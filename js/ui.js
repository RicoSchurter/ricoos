function renderAll() {
  renderSidebar();
  renderAreas();
  renderToday();
  // Refresh agenda if its view is active (items changed)
  if (document.getElementById('dv-agenda').classList.contains('active') ||
      document.getElementById('mv-agenda').classList.contains('active')) {
    renderAgenda();
  }
  if (typeof updateShoppingBadge === 'function') updateShoppingBadge();
}

/* ═══ SIDEBAR ═══ */
function renderSidebar() {
  const t     = toISO();
  const tAll  = expand().filter(i => i.data === t && (currentProfile !== 'anissa' || i.area !== 'startup'));
  const done  = tAll.filter(i => i.done).length;
  const total = tAll.length;

  if (total > 0) {
    $('sbProg').style.display  = 'block';
    $('mobProg').style.display = 'block';
    $('sbProgNums').textContent = `${done}/${total}`;
    $('sbProgFill').style.width = Math.round(done/total*100) + '%';
    $('mobProgNums').textContent = `${done}/${total}`;
    $('mobProgFill').style.width  = Math.round(done/total*100) + '%';
  } else {
    $('sbProg').style.display  = 'none';
    $('mobProg').style.display = 'none';
  }

  let html = '';
  // Mappa nomi corti per la sidebar (evita troncamenti)
  const SHORT_NAMES = {
    personale_rico:'Pers. Rico',
    personale_anissa:'Pers. Anissa'
  };
  Object.entries(AREAS).forEach(([k, a]) => {
    if (currentProfile === 'anissa' && k === 'startup') return;
    const open = items.filter(i => !i.deleted_at && i.tipo !== 'spesa' && i.area === k && !i.done).length;
    const tot  = items.filter(i => !i.deleted_at && i.tipo !== 'spesa' && i.area === k).length;
    const pct  = tot > 0 ? Math.round(open/tot*100) : 0;
    const displayName = SHORT_NAMES[k] || a.l;
    html += `<div class="stat-row">
      <div class="stat-dot" style="background:${a.c}"></div>
      <div class="stat-name" title="${esc(a.l)}">${esc(displayName)}</div>
      <div class="stat-bar"><div class="stat-fill" style="width:${pct}%;background:${a.c}"></div></div>
      <div class="stat-num">${open}</div>
    </div>`;
  });
  $('sbStats').innerHTML = html;
}

/* ═══ AREA CHIPS ═══ */
function renderAreas() {
  const isOggi = currentView === 'oggi';
  const tuttiChip = isOggi
    ? {id:'tutti', l:'OGGI', e:'◈', c:'#d4a843'}
    : {id:'tutti', l:'Tutti', e:'◈', c:'#d4a843'};

  // Ordine aree per profilo
  const AREA_ORDER_RICO    = ['lavoro','cpc','formatore','startup','famiglia','coppia','vacanza','personale_rico','personale_anissa','jasper'];
  const AREA_ORDER_ANISSA  = ['jasper','famiglia','coppia','vacanza','personale_anissa','personale_rico','lavoro','formatore','cpc'];

  const order = currentProfile === 'anissa' ? AREA_ORDER_ANISSA : AREA_ORDER_RICO;
  const visibleAreas = order.filter(k => AREAS[k]).map(k => ({id:k, ...AREAS[k]}));

  const chips = [
    tuttiChip,
    ...visibleAreas
  ].map(a => {
    const cnt = a.id !== 'tutti' ? items.filter(i => !i.deleted_at && i.tipo !== 'spesa' && i.area === a.id && !i.done).length : 0;
    const act = (a.id === 'tutti') ? filter === null : filter === a.id;
    const col = act ? (a.id === 'tutti' ? '#d4a843' : gc(a.id)) : '';
    return `<button class="chip ${act?'active':''}"
      style="${act ? `background:${col};border-color:${col};` : ''}"
      onclick="toggleFilter('${a.id}')">
      ${a.e} ${a.l}${cnt > 0 ? ' <span style="opacity:.7">'+cnt+'</span>' : ''}
    </button>`;
  }).join('');
  $('dAreas').innerHTML = chips;
  $('mAreas').innerHTML = chips;
}

function toggleFilter(id) {
  filter = (filter === id || id === 'tutti') ? null : id;
  renderAreas();
  renderToday();
  // Also refresh agenda list if agenda is currently active
  if ($('dv-agenda').classList.contains('active') ||
      $('mv-agenda').classList.contains('active')) {
    renderAgenda();
  }
}

/* ═══ TODAY ═══ */
function renderToday() {
  if (filter !== null) { renderFiltered(filter); return; }
  const t = toISO();
  const allToday = expand().filter(i => i.data === t && (currentProfile !== 'anissa' || i.area !== 'startup'));
  let list = [...allToday];
  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pc = {alta:0, media:1, bassa:2};
    if (!a.ora && !b.ora) return (pc[a.prio]||1) - (pc[b.prio]||1);
    return (a.ora||'99:99').localeCompare(b.ora||'99:99');
  });

  const lbl  = list.length ? `${list.length} elemento${list.length !== 1 ? 'i' : 'o'} oggi` : 'Agenda libera';
  const html = list.length ? list.map(card).join('') : emptyOggiHTML();
  // Avvia orologio live se agenda vuota
  if (!list.length) setTimeout(startLiveClock, 100);
  else { if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; } }

  $('dTodayLbl').textContent = lbl; $('dTodayList').innerHTML = html;
  $('mTodayLbl').textContent = lbl; $('mTodayList').innerHTML = html;

  if (allToday.length > 0 && allToday.every(i => i.done)) confetti();
  initSwipe();
}

/* ═══ FILTER VIEW — tutti gli item dell'area ═══ */
function renderFiltered(area) {
  const today      = toISO();
  const sevenAgo   = dateToISO(new Date(Date.now() - 7 * 86400000));
  const areaInfo   = AREAS[area] || AREAS.personale_rico;
  const areaItems  = items.filter(i => !i.deleted_at && i.tipo !== 'spesa' && i.area === area && (currentProfile !== 'anissa' || i.area !== 'startup'));

  // In "Oggi": lista piatta senza sezioni, senza data, ordine data+ora
  if (currentView === 'oggi') {
    const list = areaItems.sort((a,b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      return (a.ora||'99:99').localeCompare(b.ora||'99:99');
    });
    const lbl  = `${areaInfo.e} ${areaInfo.l} · ${list.filter(i=>!i.done).length} aperti`;
    const html = list.length ? list.map(it => cardNoDate(it)).join('') : emptyHTML(`Nessun elemento per ${areaInfo.l}`);
    $('dTodayLbl').textContent = lbl; $('dTodayList').innerHTML = html;
    $('mTodayLbl').textContent = lbl; $('mTodayList').innerHTML = html;
    initSwipe();
    return;
  }

  // In "Agenda": sezioni scaduti / futuri / completati
  const scaduti = areaItems
    .filter(i => !i.done && i.data < today)
    .sort((a,b) => a.data.localeCompare(b.data));
  const futuri = areaItems
    .filter(i => !i.done && i.data >= today)
    .sort((a,b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      return (a.ora||'99:99').localeCompare(b.ora||'99:99');
    });
  const completati = areaItems
    .filter(i => i.done && i.data >= sevenAgo && i.data <= today)
    .sort((a,b) => a.data.localeCompare(b.data) || (a.ora||'').localeCompare(b.ora||''));

  const total = scaduti.length + futuri.length;
  const lbl   = `${areaInfo.e} ${areaInfo.l} · ${total} aperti · ${completati.length} completati (7gg)`;

  let html = '';
  if (completati.length > 0) {
    html += `<div class="filter-section">
      <div class="filter-sec-lbl lbl-done">✓ Completati ultimi 7 giorni (${completati.length})</div>
      <div class="completati-wrap items-list">${completati.map(it => card(it)).join('')}</div>
    </div>`;
  }
  if (scaduti.length > 0) {
    html += `<div class="filter-section">
      <div class="filter-sec-lbl lbl-overdue">⚠ Scaduti non completati (${scaduti.length})</div>
      <div class="items-list">${scaduti.map(it => card(it)).join('')}</div>
    </div>`;
  }
  if (futuri.length > 0) {
    html += `<div class="filter-section">
      <div class="filter-sec-lbl lbl-future">📅 In arrivo (${futuri.length})</div>
      <div class="items-list">${futuri.map(it => card(it)).join('')}</div>
    </div>`;
  }
  if (!html) html = emptyHTML(`Nessun elemento per ${areaInfo.l}`);

  $('dTodayLbl').textContent = lbl; $('dTodayList').innerHTML = html;
  $('mTodayLbl').textContent = lbl; $('mTodayList').innerHTML = html;
  initSwipe();
}

function emptyHTML(msg) {
  return `<div class="empty-st"><div class="sym">◇</div><p>${msg}</p></div>`;
}

// Orologio live per empty state Oggi
let _clockInterval = null;
function startLiveClock() {
  if (_clockInterval) return;
  _clockInterval = setInterval(() => {
    const el = document.querySelector('.empty-oggi-time');
    if (!el) { clearInterval(_clockInterval); _clockInterval = null; return; }
    const now = new Date();
    el.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  }, 1000); // ogni secondo
}

function emptyOggiHTML() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const part = now.getHours() < 12 ? 'mattina libera' : now.getHours() < 17 ? 'pomeriggio libero' : now.getHours() < 21 ? 'serata libera' : 'notte tranquilla';
  const msgs = [
    'Nessun impegno oggi.<br>Uno spazio raro — usalo con intenzione.',
    'Agenda vuota.<br>Cosa farebbe più differenza oggi?',
    'Giornata libera.<br>Una cosa sola. Quale?',
    'Nessun appuntamento.<br>Respira. Poi scegli una cosa.'
  ];
  const msg = msgs[new Date().getDay() % msgs.length];
  return '<div class="empty-oggi">' +
    '<div class="empty-oggi-time">' + h + ':' + m + '</div>' +
    '<div class="empty-oggi-label">' + part + '</div>' +
    '<div class="empty-oggi-sym">◈</div>' +
    '<div class="empty-oggi-msg">' + msg + '</div>' +
    '<button class="empty-oggi-cta" onclick="openModal()">+ Aggiungi qualcosa</button>' +
    '</div>';
}

function card(it) {
  const a   = AREAS[it.area] || AREAS.personale_rico;
  const ic  = gc(it.area);
  const pid = it.recurChild ? it.parentId : it.id;
  const safeTitle = esc(it.titolo);
  const safeNote  = esc(it.note || '');
  const stag = it.area === 'startup' && it.startupTag
    ? `<span class="badge" style="color:#b088f0">${STS[it.startupTag]?.e} ${esc(STS[it.startupTag]?.n||it.startupTag)}</span>` : '';
  const ctag = it.area === 'cpc' && it.cpcTag
    ? `<span class="badge" style="color:#4db8f0">${esc(it.cpcTag)}</span>` : '';
  const rtag = it.recur && !it.recurChild
    ? `<div class="recur-lbl">↻ ${it.recur==='weekly'?'Settimanale':it.recur==='biweekly'?'Bisettimanale':'Mensile'}</div>`
    : it.recurChild ? '<div class="recur-lbl">↻ Ricorrente</div>' : '';
  const urgDot = it.prio === 'alta' && !it.done ? '<div class="urgent-dot"></div>' : '';

  return `<div class="item ${it.done?'done':''}" style="--ic:${ic}" id="c-${it.id}" data-pid="${pid}">
    ${urgDot}
    <div class="item-row">
      <button class="chk ${it.done?'on':''}" onclick="toggle('${pid}')"><span class="chk-m">✓</span></button>
      <div class="item-body">
        <div class="item-title">${safeTitle}</div>
        <div class="item-meta">
          <span class="badge area-badge-edit" style="color:${ic}" onclick="openAreaPicker('${pid}',this,event)">${a.e} ${a.l}</span>
          ${it.ora ? `<span class="badge" style="color:#a09070">🕐 ${esc(it.ora)}</span>` : ''}
          <span class="badge" style="color:${PRIO_CLR[it.prio]||'#9a9080'}">● ${esc(it.prio||'?')}</span>
          <span class="badge" style="color:var(--dim)">${esc(it.tipo)}</span>
          ${stag}${ctag}
        </div>
        ${it.note ? `<div class="item-note">${safeNote}</div>` : ''}
        ${rtag}
      </div>
      <button class="edit-btn" onclick="openEditModal('${pid}');event.stopPropagation()" title="Modifica">✎</button>
      ${!it.recurChild ? `<button class="del-btn" onclick="delItem('${esc(it.id)}',event)">×</button>` : ''}
    </div>
  </div>`;
}

/* card senza badge area — usata in "Oggi" con filtro attivo (l'area è già nota dal chip) */
/* Mostra la data in badge al posto dell'area, utile per vedere quando è l'appuntamento */
function cardNoDate(it) {
  const a   = AREAS[it.area] || AREAS.personale_rico;
  const ic  = gc(it.area);
  const pid = it.recurChild ? it.parentId : it.id;
  const safeTitle = esc(it.titolo);
  const safeNote  = esc(it.note || '');
  const stag = it.area === 'startup' && it.startupTag
    ? `<span class="badge" style="color:#b088f0">${STS[it.startupTag]?.e} ${esc(STS[it.startupTag]?.n||it.startupTag)}</span>` : '';
  const ctag = it.area === 'cpc' && it.cpcTag
    ? `<span class="badge" style="color:#4db8f0">${esc(it.cpcTag)}</span>` : '';
  const rtag = it.recur && !it.recurChild
    ? `<div class="recur-lbl">↻ ${it.recur==='weekly'?'Settimanale':it.recur==='biweekly'?'Bisettimanale':'Mensile'}</div>`
    : it.recurChild ? '<div class="recur-lbl">↻ Ricorrente</div>' : '';
  const urgDot = it.prio === 'alta' && !it.done ? '<div class="urgent-dot"></div>' : '';
  // Formatta data leggibile: "lun 14 apr"
  const dateObj = new Date(it.data + 'T12:00:00');
  const dateLbl = it.data === toISO() ? 'oggi'
    : dateObj.toLocaleDateString('it-IT', {weekday:'short', day:'numeric', month:'short'});

  return `<div class="item ${it.done?'done':''}" style="--ic:${ic}" id="c-${it.id}" data-pid="${pid}">
    ${urgDot}
    <div class="item-row">
      <button class="chk ${it.done?'on':''}" onclick="toggle('${pid}')"><span class="chk-m">✓</span></button>
      <div class="item-body">
        <div class="item-title">${safeTitle}</div>
        <div class="item-meta">
          <span class="badge" style="color:var(--dim)">📅 ${esc(dateLbl)}</span>
          <span class="badge area-badge-edit" style="color:${ic}" onclick="openAreaPicker('${pid}',this,event)">${a.e} ${a.l}</span>
          ${it.ora ? `<span class="badge" style="color:#a09070">🕐 ${esc(it.ora)}</span>` : ''}
          <span class="badge" style="color:${PRIO_CLR[it.prio]||'#9a9080'}">● ${esc(it.prio||'?')}</span>
          <span class="badge" style="color:var(--dim)">${esc(it.tipo)}</span>
          ${stag}${ctag}
        </div>
        ${it.note ? `<div class="item-note">${safeNote}</div>` : ''}
        ${rtag}
      </div>
      <button class="edit-btn" onclick="openEditModal('${pid}');event.stopPropagation()" title="Modifica">✎</button>
      ${!it.recurChild ? `<button class="del-btn" onclick="delItem('${esc(it.id)}',event)">×</button>` : ''}
    </div>
  </div>`;
}

function toggle(id) {
  items = items.map(i => i.id === id ? {...i, done: !i.done} : i);
  saveItems();
  renderAll();
  checkSmartNotifs();
  const it = items.find(i => i.id === id);
  if (it?.done) toast(`✓ "${it.titolo.slice(0,28)}" completato`, 'success');
}

function delItem(id, e) {
  e?.stopPropagation();
  const deleted = items.find(i => i.id === id);
  if (!deleted) return;
  softDeleteItem(id);
  renderAll();
  checkSmartNotifs();
  toast('"' + deleted.titolo.slice(0,28) + '" eliminato', 'info', {
    label: 'ANNULLA',
    timeout: 5000,
    callback: () => {
      restoreItem(id);
      renderAll();
      checkSmartNotifs();
      toast('Ripristinato ✓', 'success');
    }
  });
}

/* ═══ RIPROGRAMMA ═══ */
function suggestNextDate(it) {
  const d = new Date(); d.setDate(d.getDate() + 1);
  if (it.area === 'cpc') {
    while (d.getDay() !== 3 && d.getDay() !== 4) d.setDate(d.getDate() + 1);
  } else if (it.area === 'famiglia') {
    while (d.getDay() !== 6 && d.getDay() !== 0) d.setDate(d.getDate() + 1);
  } else if (it.area === 'lavoro' || it.area === 'formatore') {
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  }
  return dateToISO(d);
}

function openRiprogramma(id, event) {
  event?.stopPropagation();
  // Chiudi eventuali panel aperti
  document.querySelectorAll('.riprog-panel').forEach(p => p.remove());
  const it = items.find(i => i.id === id);
  if (!it) return;
  const cardEl = document.getElementById('c-' + id);
  if (!cardEl) return;

  const sugDate = suggestNextDate(it);
  const safeId  = esc(id);

  const panel = document.createElement('div');
  panel.className = 'riprog-panel';
  panel.id = 'rp-' + id;
  panel.innerHTML = `
    <div class="riprog-title">↻ Riprogramma — ${esc(it.titolo.slice(0,30))}</div>
    <div class="riprog-ai-hint" id="rpHint-${safeId}"><span style="color:var(--dim)">⏳ Calcolo proposta AI…</span></div>
    <div class="riprog-fields">
      <input type="date" id="rpDate-${safeId}" value="${sugDate}" min="${toISO()}" style="flex:1">
      <input type="time" id="rpTime-${safeId}" value="${esc(it.ora||'')}" style="flex:1">
    </div>
    <div class="riprog-btns">
      <button class="riprog-ok" onclick="confirmRiprogramma('${safeId}')">✓ Conferma</button>
      <button class="riprog-cancel" onclick="closeRiprogramma('${safeId}')">✗ Annulla</button>
    </div>`;
  cardEl.after(panel);

  if (apiKey) getRiprogrammaAI(id, it);
}

async function getRiprogrammaAI(id, it) {
  const prompt = `Sei il coach di Rico. Deve riprogrammare: "${it.titolo}" (${it.tipo}, area ${it.area}, data originale ${it.data}).
Oggi è ${toISO()} (${new Date().toLocaleDateString('it-IT',{weekday:'long'})}).
Regole per la proposta:
- CPC → mercoledì o giovedì mattina
- Lavoro/Formatore → lunedì-venerdì, orario lavorativo
- Famiglia → sabato o domenica
- Personale → qualsiasi giorno, stesso orario se presente
Rispondi SOLO con JSON valido: {"data":"YYYY-MM-DD","ora":"HH:MM o null","motivo":"max 8 parole"}`;
  try {
    const raw = await apiCall([{role:'user', content:prompt}], 120);
    const p   = JSON.parse(raw.replace(/```json|```/g,'').trim());
    const hint = document.getElementById('rpHint-' + id);
    if (hint) {
      hint.innerHTML = `<span style="color:var(--gold2)">✦ Proposta: <strong>${esc(p.data||'')}</strong>${(p.ora && p.ora!=='null') ? ' alle <strong>'+esc(p.ora)+'</strong>' : ''} — ${esc(p.motivo||'')}</span>`;
    }
    const di = document.getElementById('rpDate-' + id);
    const ti = document.getElementById('rpTime-' + id);
    if (di && p.data) di.value = p.data;
    if (ti && p.ora && p.ora !== 'null') ti.value = p.ora;
  } catch(e) {
    const hint = document.getElementById('rpHint-' + id);
    if (hint) hint.innerHTML = '<span style="color:var(--dim)">Proposta AI non disponibile — scegli tu la data.</span>';
  }
}

function confirmRiprogramma(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const newDate = document.getElementById('rpDate-' + id)?.value;
  const newTime = document.getElementById('rpTime-' + id)?.value || '';
  if (!newDate) { toast('Seleziona una data', 'warn'); return; }

  // Marca originale come done
  if (!it.done) {
    items = items.map(i => i.id === id ? {...i, done: true} : i);
  }
  // Crea nuovo item con nuova data
  const newIt = {
    ...it,
    id:    uid(),
    data:  newDate.slice(0,10),
    ora:   newTime,
    done:  false,
    recur: '',
  };
  items.unshift(newIt);
  saveItems();
  closeRiprogramma(id);
  renderAll();
  toast(`↻ Riprogrammato al ${newDate}`, 'success');
}

function closeRiprogramma(id) {
  const panel = document.getElementById('rp-' + id);
  if (panel) panel.remove();
}

/* ═══ AREA PICKER — modifica categoria inline ═══ */
function openAreaPicker(itemId, badgeEl, event) {
  event?.stopPropagation();
  closeAreaPicker(); // chiudi eventuale picker aperto

  const it = items.find(i => i.id === itemId);
  if (!it) return;

  // Overlay invisibile per chiudere al click fuori
  const overlay = document.createElement('div');
  overlay.className = 'area-picker-overlay';
  overlay.id = 'areaPicOverlay';
  overlay.onclick = closeAreaPicker;
  document.body.appendChild(overlay);

  // Picker con tutte le aree
  const picker = document.createElement('div');
  picker.className = 'area-picker';
  picker.id = 'areaPic';

  picker.innerHTML = Object.entries(AREAS).map(([key, a]) =>
    `<button class="area-picker-btn ${it.area===key?'current':''}"
      onclick="changeItemArea('${esc(itemId)}','${key}',event)">
      ${a.e} ${a.l}
    </button>`
  ).join('');

  document.body.appendChild(picker);

  // Posiziona picker vicino al badge cliccato
  const rect = badgeEl.getBoundingClientRect();
  const picW = 270;
  const margin = 10;
  let left = rect.left;
  let top  = rect.bottom + 6;

  // Misura altezza reale dopo inserimento nel DOM
  requestAnimationFrame(() => {
    const picH = picker.offsetHeight || 160;
    // Evita uscita a destra
    if (left + picW > window.innerWidth - margin) left = window.innerWidth - picW - margin;
    // Evita uscita a sinistra
    if (left < margin) left = margin;
    // Se non c'è spazio sotto, apri sopra
    if (top + picH > window.innerHeight - margin) top = rect.top - picH - 6;
    // Ultimo fallback: centra verticalmente
    if (top < margin) top = Math.max(margin, (window.innerHeight - picH) / 2);
    picker.style.top  = top  + 'px';
    picker.style.left = left + 'px';
    picker.style.opacity = '1';
  });
  picker.style.opacity = '0'; // Nascondi fino al posizionamento
}

function closeAreaPicker() {
  document.getElementById('areaPic')?.remove();
  document.getElementById('areaPicOverlay')?.remove();
}

async function changeItemArea(itemId, newArea, event) {
  event?.stopPropagation();
  closeAreaPicker();
  if (!AREAS[newArea]) return;

  const it = items.find(i => i.id === itemId);
  if (!it || it.area === newArea) return;

  const oldArea = it.area;
  items = items.map(i => i.id === itemId ? {...i, area: newArea} : i);
  saveItems();
  renderAll();
  toast(`${AREAS[newArea].e} Spostato in ${AREAS[newArea].l}`, 'success');
}

