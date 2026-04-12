async function sbFetch(path, opts = {}) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=minimal',
      ...opts.headers
    },
    ...opts
  });
  if (!res.ok) throw new Error('Supabase error ' + res.status);
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch(e) { return null; }
}

/* ═══ LOAD / SAVE ═══ */
async function loadAll() {
  // Always load apiKey from localStorage (device-specific)
  apiKey = localStorage.getItem('rico_apikey_'+currentProfile) || localStorage.getItem('rico_apikey') || '';

  try {
    // Load items from Supabase
    const rows = await sbFetch('items?select=data&order=updated_at.desc');
    items = rows && rows.length ? rows.map(r => r.data) : [];
  } catch(e) {
    // Fallback to localStorage if offline
    try { items = JSON.parse(localStorage.getItem('rico_items') || '[]'); } catch(e2) { items = []; }
  }

  // Always load localStorage first as baseline (source of truth for offline/pending writes)
  let cachedSt = {};
  try { cachedSt = JSON.parse(localStorage.getItem('rico_st') || '{}'); } catch(e) { cachedSt = {}; }
  stData = {...cachedSt};

  try {
    // Merge Supabase data on top (overrides localStorage with server state where present)
    const rows = await sbFetch('startup_data?select=id,data');
    if (rows) rows.forEach(r => { stData[r.id] = r.data; });
    // BUT keep jasper diary + chat keys from localStorage if Supabase missing them
    // (Supabase sync may have failed silently for these, localStorage is authoritative)
    Object.keys(cachedSt).forEach(k => {
      if (k.startsWith('jasper_diary_') || k.startsWith('memory_') || k.startsWith('mit_')) {
        if (!stData[k]) stData[k] = cachedSt[k];
      }
    });
  } catch(e) {
    console.warn('Supabase startup_data fetch failed, using localStorage:', e);
    stData = cachedSt;
  }

  Object.keys(STS).forEach(k => {
    if (!stData[k]) stData[k] = {stage:'Building', next:'', block:'', updated:''};
  });

  // Auto-delete: item done + data > 60gg fa + non ricorrente + non test/scadenza/compito
  // 60 giorni invece di 30: piu margine per non perdere storico recente sul free plan
  const sixtyAgo = dateToISO(new Date(Date.now() - 60 * 86400000));
  const PROTECTED_TYPES = ['test','scadenza','compito'];
  const toDelete  = items.filter(i =>
    i.done && i.data < sixtyAgo && !i.recur && !PROTECTED_TYPES.includes(i.tipo)
  );
  if (toDelete.length > 0) {
    const toDeleteIds = new Set(toDelete.map(it => it.id));
    items = items.filter(i => !toDeleteIds.has(i.id));
    localStorage.setItem('rico_items', JSON.stringify(items));
    Promise.allSettled(
      toDelete.map(it => sbFetch('items?id=eq.' + it.id, {method:'DELETE'}))
    ).then(results => {
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) console.warn('Auto-delete: ' + failed.length + '/' + toDelete.length + ' failed');
    });
  }

  // Mirror to localStorage as offline cache
  localStorage.setItem('rico_items', JSON.stringify(items));
  localStorage.setItem('rico_st', JSON.stringify(stData));
}

async function saveItems() {
  // Save to localStorage immediately (instant UI, offline cache)
  localStorage.setItem('rico_items', JSON.stringify(items));
  // Sync to Supabase in background — upsert each item by id
  try {
    const body = items.map(it => ({ id: it.id, data: it }));
    // Delete removed items first, then upsert all current
    await sbFetch('items', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify(body.length ? body : [])
    });
  } catch(e) {
    console.warn('Supabase sync failed, data saved locally:', e);
  }
}

async function saveSt() {
  localStorage.setItem('rico_st', JSON.stringify(stData));
  try {
    for (const [key, val] of Object.entries(stData)) {
      await sbFetch('startup_data', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({ id: key, data: val })
      });
    }
  } catch(e) {
    console.warn('Supabase startup sync failed:', e);
  }
}

/* helper: format a Date object as local YYYY-MM-DD */
function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ═══ EXPAND RECURRING ═══ */
function expand() {
  const out = [];
  const lim = new Date(); lim.setDate(lim.getDate() + 120);
  const end = dateToISO(lim);
  for (const it of items) {
    out.push(it);
    if (!it.recur) continue;
    const [baseY, baseM, baseD] = it.data.split('-').map(Number);
    for (let i = 0; i < 70; i++) {
      let nextDate;
      if (it.recur === 'weekly') {
        // Calculate directly from base to avoid accumulation drift
        nextDate = new Date(baseY, baseM - 1, baseD + (i + 1) * 7);
      } else if (it.recur === 'biweekly') {
        nextDate = new Date(baseY, baseM - 1, baseD + (i + 1) * 14);
      } else {
        // Monthly: clamp day to last day of target month
        // (avoids Jan-31 + 1month = Mar-3 overflow)
        const rawMonth  = baseM - 1 + (i + 1);
        const tgtYear   = baseY + Math.floor(rawMonth / 12);
        const tgtMonth  = ((rawMonth % 12) + 12) % 12;
        const maxDay    = new Date(tgtYear, tgtMonth + 1, 0).getDate(); // last day
        nextDate = new Date(tgtYear, tgtMonth, Math.min(baseD, maxDay));
      }
      const iso = dateToISO(nextDate);
      if (iso > end) break;
      out.push({...it, id: it.id + '_r_' + iso, data: iso, recurChild: true, parentId: it.id});
    }
  }
  return out;
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */