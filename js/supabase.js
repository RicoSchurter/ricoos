async function sbFetch(path, opts = {}) {
  // Tempo massimo di attesa: con rete debole la richiesta non resta appesa per sempre
  // (prima un salvataggio bloccato poteva fermare tutte le azioni successive).
  const ms = opts.timeout || 15000;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    const res = await fetch(SB_URL + '/rest/v1/' + path, {
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': opts.prefer || 'return=minimal',
        ...opts.headers
      },
      ...opts,
      signal: ctrl ? ctrl.signal : undefined
    });
    if (!res.ok) throw new Error('Supabase error ' + res.status);
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch(e) { return null; }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ═══ LOAD / SAVE ═══
   Regole anti-perdita dati:
   1. Il calendario salva SOLO gli impegni cambiati (mai tutta la lista):
      un telefono con dati vecchi non può più annullare le modifiche dell'altro.
   2. Ogni modifica non ancora confermata dal server resta "in attesa"
      (localStorage) e alla riapertura vince sulla versione del server,
      poi viene rinviata. Niente più dati persi senza rete.
   3. Diario Jasper e pesi: prima di scrivere si rilegge la versione aggiornata
      dal server e si applica la modifica su quella (stMutate). */
let _itemsSynced  = {}; // id -> JSON dell'ultima versione confermata dal server
let _pendingItems = new Set(_readPending('rico_pending_items'));
let _pendingSt    = new Set(_readPending('rico_pending_st'));
let _syncRetryTimer = null;

function _readPending(k) {
  try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; }
  catch(e) { return []; }
}
function _persistPending() {
  try {
    localStorage.setItem('rico_pending_items', JSON.stringify([..._pendingItems]));
    localStorage.setItem('rico_pending_st', JSON.stringify([..._pendingSt]));
  } catch(e) { /* quota: ignora */ }
  updateSyncBadge();
}
function updateSyncBadge() {
  const n = _pendingItems.size + _pendingSt.size;
  ['dSyncBadge','mSyncBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = n > 0 ? '' : 'none';
  });
}
function _scheduleRetry() {
  if (_syncRetryTimer) return;
  _syncRetryTimer = setTimeout(() => { _syncRetryTimer = null; flushPending(); }, 30000);
}

/* Unione di due versioni dello stesso dato (server + locale non salvato).
   Regola: non perdere mai una registrazione. In caso di doppione vince la locale. */
function mergeStValue(key, server, local) {
  if (server == null) return local;
  if (local == null) return server;
  const clone = o => JSON.parse(JSON.stringify(o));
  if (key.startsWith('jasper_diary_')) {
    const out = clone(server);
    const byKey = (arr, f) => { const m = new Map(); (arr || []).forEach(x => { if (x) m.set(f(x), x); }); return m; };
    const sl = byKey(server.sleeps, s => s.start);
    (local.sleeps || []).forEach(s => {
      if (!s) return;
      const ex = sl.get(s.start);
      if (!ex || s.end || !ex.end) sl.set(s.start, s); // la locale vince, salvo che tolga una fine già registrata
    });
    out.sleeps = [...sl.values()];
    const ml = byKey(server.meals, m => m.hhmm);
    (local.meals || []).forEach(m => { if (m) ml.set(m.hhmm, m); });
    out.meals = [...ml.values()];
    const nl = byKey(server.notes, n => (n.ts || '') + '|' + (n.text || ''));
    (local.notes || []).forEach(n => { if (n) nl.set((n.ts || '') + '|' + (n.text || ''), n); });
    out.notes = [...nl.values()];
    if (local.woke_at) out.woke_at = local.woke_at;
    const last = out.meals.map(m => m.hhmm).filter(Boolean).sort().pop();
    out.lastMeal = last || null;
    return out;
  }
  if (key === 'jasper_weights') {
    const m = new Map();
    ((server.list) || []).forEach(w => { if (w) m.set(w.date, w); });
    ((local.list) || []).forEach(w => { if (w) m.set(w.date, w); });
    return {...clone(server), list: [...m.values()].sort((a,b) => (a.date||'').localeCompare(b.date||''))};
  }
  return local; // MIT e altri: vince la versione locale
}

async function loadAll() {
  // Always load apiKey from localStorage (device-specific)
  apiKey = localStorage.getItem('rico_apikey_'+currentProfile) || localStorage.getItem('rico_apikey') || '';

  // ── Impegni ──
  let localItems = [];
  try { localItems = JSON.parse(localStorage.getItem('rico_items') || '[]'); } catch(e) { localItems = []; }
  if (!Array.isArray(localItems)) localItems = [];
  // Le due letture partono insieme: con rete lenta l'attesa massima è 8 secondi, non 16
  const _stReq = sbFetch('startup_data?select=id,data', {timeout: 8000}).then(r => ({ok: true, rows: r}), e => ({ok: false, e}));
  let serverItems = null;
  try {
    const rows = await sbFetch('items?select=data&order=updated_at.desc', {timeout: 8000});
    serverItems = rows && rows.length ? rows.map(r => r.data).filter(Boolean) : [];
  } catch(e) { serverItems = null; }

  if (serverItems === null) {
    // Offline: lavora sulla copia locale. Quello che non è "in attesa" si considera già sul server.
    items = localItems;
    _itemsSynced = {};
    items.forEach(i => { if (i && i.id && !_pendingItems.has(i.id)) _itemsSynced[i.id] = JSON.stringify(i); });
  } else {
    const map = new Map(serverItems.map(i => [i.id, i]));
    _itemsSynced = {};
    serverItems.forEach(i => { _itemsSynced[i.id] = JSON.stringify(i); });
    // Modifiche locali non ancora salvate: vince la versione locale (poi viene rinviata)
    _pendingItems.forEach(id => {
      const loc = localItems.find(i => i && i.id === id);
      if (loc) map.set(id, loc); else _pendingItems.delete(id);
    });
    // Impegni presenti solo su questo telefono (salvataggio mai arrivato): si recuperano
    localItems.forEach(loc => {
      if (loc && loc.id && !map.has(loc.id)) { map.set(loc.id, loc); _pendingItems.add(loc.id); }
    });
    items = [...map.values()];
  }

  // ── Diario Jasper, pesi, MIT ──
  let cachedSt = {};
  try { cachedSt = JSON.parse(localStorage.getItem('rico_st') || '{}'); } catch(e) { cachedSt = {}; }
  if (!cachedSt || typeof cachedSt !== 'object') cachedSt = {};
  let serverSt = null;
  const _stRes = await _stReq;
  if (_stRes.ok) {
    serverSt = {};
    (_stRes.rows || []).forEach(r => { serverSt[r.id] = r.data; });
  } else {
    console.warn('Supabase startup_data fetch failed, using localStorage:', _stRes.e);
  }
  if (serverSt === null) {
    stData = {...cachedSt};
  } else {
    stData = {...cachedSt, ...serverSt};
    // Chiavi presenti solo in locale (salvataggio mai arrivato): si tengono
    Object.keys(cachedSt).forEach(k => {
      if (!(k in serverSt) && (k.startsWith('jasper_') || k.startsWith('mit_'))) { stData[k] = cachedSt[k]; _pendingSt.add(k); }
    });
    // Modifiche locali non ancora salvate: unione server + locale, niente va perso
    _pendingSt.forEach(k => {
      if (cachedSt[k] != null) stData[k] = mergeStValue(k, serverSt[k], cachedSt[k]);
      else _pendingSt.delete(k);
    });
  }

  Object.keys(STS).forEach(k => {
    if (!stData[k]) stData[k] = {stage:'Building', next:'', block:'', updated:''};
  });

  // Correzione dati: area "personale" non esiste (vecchia scansione) → Personale Rico
  items.forEach((it, idx) => {
    if (it && it.tipo !== 'spesa' && it.area === 'personale') items[idx] = {...it, area: 'personale_rico'};
  });

  // Cestino: gli impegni eliminati da più di 7 giorni vengono cancellati definitivamente.
  // (Rimossa la vecchia cancellazione automatica degli impegni completati dopo 60 giorni.)
  if (serverItems !== null) {
    const sevenAgoTs = Date.now() - 7 * 86400000;
    const trashExpired = items.filter(i => {
      if (!i || !i.deleted_at) return false;
      const ts = Date.parse(i.deleted_at);
      return !isNaN(ts) && ts < sevenAgoTs;
    });
    if (trashExpired.length > 0) {
      const ids = new Set(trashExpired.map(it => it.id));
      items = items.filter(i => !ids.has(i.id));
      ids.forEach(id => { delete _itemsSynced[id]; _pendingItems.delete(id); });
      Promise.allSettled(
        trashExpired.map(it => sbFetch('items?id=eq.' + encodeURIComponent(it.id), {method:'DELETE'}))
      ).then(results => {
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length) console.warn('Hard-delete cestino: ' + failed.length + '/' + trashExpired.length + ' failed');
      });
    }
  }

  // Mirror to localStorage as offline cache
  try {
    localStorage.setItem('rico_items', JSON.stringify(items));
    localStorage.setItem('rico_st', JSON.stringify(stData));
  } catch(e) { /* quota: ignora */ }
  _persistPending();

  // Rinvia subito ciò che è in attesa (e la correzione area, se serve)
  if (serverItems !== null) flushPending();
}

async function saveItems() {
  // Save to localStorage immediately (instant UI, offline cache)
  try { localStorage.setItem('rico_items', JSON.stringify(items)); } catch(e) { /* quota */ }
  // Solo gli impegni cambiati rispetto all'ultima versione confermata dal server
  const dirty = items.filter(it => it && it.id && _itemsSynced[it.id] !== JSON.stringify(it));
  if (!dirty.length) return;
  const snap = dirty.map(it => ({id: it.id, json: JSON.stringify(it)}));
  snap.forEach(s => _pendingItems.add(s.id));
  _persistPending();
  try {
    await sbFetch('items', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify(snap.map(s => ({id: s.id, data: JSON.parse(s.json)})))
    });
    snap.forEach(s => {
      _itemsSynced[s.id] = s.json;
      const cur = items.find(i => i && i.id === s.id);
      if (!cur || JSON.stringify(cur) === s.json) _pendingItems.delete(s.id);
    });
    _persistPending();
  } catch(e) {
    console.warn('Supabase sync failed, data saved locally:', e);
    _scheduleRetry();
  }
}

/* Modifica sicura di un dato del diario/pesi/MIT:
   rilegge la versione aggiornata dal server, applica fn e salva.
   fn riceve una copia modificabile; ritorna false per annullare. */
async function stMutate(key, fn, defVal, onLocal) {
  let base = null, online = true;
  try {
    const rows = await sbFetch('startup_data?id=eq.' + encodeURIComponent(key) + '&select=data', {timeout: 4000});
    base = (rows && rows[0]) ? rows[0].data : null;
  } catch(e) { online = false; }
  if (!online) base = stData[key] != null ? stData[key] : null;
  else if (_pendingSt.has(key) && stData[key] != null) base = mergeStValue(key, base, stData[key]);
  if (base == null) base = (typeof defVal === 'function') ? defVal() : JSON.parse(JSON.stringify(defVal));
  const work = JSON.parse(JSON.stringify(base));
  const res = fn(work);
  if (res === false) {
    if (online && !_pendingSt.has(key)) { stData[key] = base; try { localStorage.setItem('rico_st', JSON.stringify(stData)); } catch(e) {} }
    return null;
  }
  const val = (res === undefined || res === true) ? work : res;
  stData[key] = val;
  try { localStorage.setItem('rico_st', JSON.stringify(stData)); } catch(e) { /* quota */ }
  _pendingSt.add(key);
  _persistPending();
  // Lo schermo si aggiorna subito, senza aspettare la conferma del server
  if (onLocal) { try { onLocal(val); } catch(e) { console.warn('onLocal:', e); } }
  try {
    await sbFetch('startup_data', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify({id: key, data: val}),
      timeout: 8000
    });
    if (stData[key] === val) _pendingSt.delete(key);
    _persistPending();
  } catch(e) {
    console.warn('stMutate sync failed (salvato in locale):', key, e);
    _scheduleRetry();
  }
  return val;
}

let _flushing = false;
async function flushPending(manual) {
  if (_flushing) return;
  _flushing = true;
  try {
    await saveItems();
    for (const k of [..._pendingSt]) {
      if (stData[k] == null) { _pendingSt.delete(k); continue; }
      let toSend = stData[k];
      try {
        const rows = await sbFetch('startup_data?id=eq.' + encodeURIComponent(k) + '&select=data', {timeout: 4000});
        const srv = (rows && rows[0]) ? rows[0].data : null;
        toSend = mergeStValue(k, srv, stData[k]);
        await sbFetch('startup_data', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: JSON.stringify({id: k, data: toSend})
        });
        stData[k] = toSend;
        _pendingSt.delete(k);
      } catch(e) { _scheduleRetry(); break; }
    }
    try { localStorage.setItem('rico_st', JSON.stringify(stData)); } catch(e) {}
    _persistPending();
    if (manual) toast(_pendingItems.size + _pendingSt.size ? 'Ancora offline — riprovo da solo' : 'Tutto salvato ✓', _pendingItems.size + _pendingSt.size ? 'warn' : 'success');
  } finally { _flushing = false; }
}

/* helper: format a Date object as local YYYY-MM-DD */
function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ═══ SOFT DELETE / RESTORE (trash logico 7gg) ═══
   Invece di hard-delete, marca l'item con deleted_at = ISO timestamp.
   expand() e tutte le viste escludono gli item con deleted_at.
   loadAll() hard-delete gli item con deleted_at piu vecchi di 7 giorni. */
function softDeleteItem(id) {
  const it = items.find(i => i.id === id);
  if (!it) return null;
  it.deleted_at = new Date().toISOString();
  saveItems();
  return it;
}
function restoreItem(id) {
  const it = items.find(i => i.id === id);
  if (!it) return null;
  delete it.deleted_at;
  saveItems();
  return it;
}

/* ═══ EXPAND RECURRING ═══ */
function expand() {
  const out = [];
  const lim = new Date(); lim.setDate(lim.getDate() + 120);
  const end = dateToISO(lim);
  for (const it of items) {
    if (it.deleted_at) continue; // trash logico invisibile
    if (!it.recur) { out.push(it); continue; }
    // Ricorrente: la spunta vale per il singolo giorno (doneDates)
    out.push({...it, done: isItemDoneOn(it, it.data)});
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
      out.push({...it, id: it.id + '_r_' + iso, data: iso, recurChild: true, parentId: it.id, done: isItemDoneOn(it, iso)});
    }
  }
  return out;
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */