/* ═══ VOCE — Web Speech API (singleton condiviso qa+chat) ═══ */
let _voiceRecognition = null;
let _voiceActive      = false;

function initVoice() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;
  ['d','m'].forEach(p => {
    const mic = $(p+'QaMic'); if(mic) mic.classList.add('show');
    const chatMic = $(p+'ChatMic'); if(chatMic) chatMic.classList.add('show');
  });
  _voiceRecognition = new SpeechRec();
  _voiceRecognition.lang = 'it-IT';
  _voiceRecognition.continuous = false;
  _voiceRecognition.interimResults = false;
  _voiceRecognition.maxAlternatives = 1;
}

// Clear listening state da TUTTI i mic (qa + chat, desktop + mobile)
function _clearAllMicListening() {
  ['d','m'].forEach(p => {
    const qaMic = $(p+'QaMic'); if(qaMic) qaMic.classList.remove('listening');
    const chatMic = $(p+'ChatMic'); if(chatMic) chatMic.classList.remove('listening');
  });
}

function startVoiceChat(pfx) {
  if (!_voiceRecognition) { toast('Voce non supportata in questo browser','warn'); return; }
  if (_voiceActive) { _voiceRecognition.stop(); return; }
  const inp = $(pfx + 'ChatInp');
  const mic = $(pfx + 'ChatMic');
  _voiceActive = true;
  _clearAllMicListening(); // sicurezza: pulisci stato qa-mic se attivo
  if (mic) mic.classList.add('listening');
  _voiceRecognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    if (inp) inp.value = transcript;
    // NO auto-submit: user rilegge e invia manualmente
  };
  _voiceRecognition.onerror = (e) => {
    toast('Errore microfono — ' + (e.error === 'not-allowed' ? 'abilita il microfono' : e.error), 'warn');
  };
  _voiceRecognition.onend = () => {
    _voiceActive = false;
    _clearAllMicListening();
  };
  try { _voiceRecognition.start(); }
  catch(e) {
    _voiceActive = false;
    _clearAllMicListening();
  }
}

function startVoice(pfx) {
  if (!_voiceRecognition) { toast('Voce non supportata in questo browser', 'warn'); return; }
  if (_voiceActive) { _voiceRecognition.stop(); return; }

  const inp = $(pfx + 'QaInp');
  const mic = $(pfx + 'QaMic');

  _voiceActive = true;
  _clearAllMicListening(); // pulisci stato chat-mic se attivo
  if (mic) mic.classList.add('listening');

  _voiceRecognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    if (inp) { inp.value = transcript; setTimeout(() => doQA(pfx), 350); }
  };

  _voiceRecognition.onerror = (e) => {
    toast('Errore microfono — ' + (e.error === 'not-allowed' ? 'abilita il microfono' : e.error), 'warn');
  };

  _voiceRecognition.onend = () => {
    _voiceActive = false;
    _clearAllMicListening();
  };

  try { _voiceRecognition.start(); }
  catch(e) {
    _voiceActive = false;
    _clearAllMicListening();
  }
}

let _swipeInited = false;
function initSwipe() {
  if (_swipeInited) return;
  _swipeInited = true;
  const containers = ['dTodayList','mTodayList','dAgList','mAgList']
    .map(id => document.getElementById(id)).filter(Boolean);
  containers.forEach(cont => {
    let sx = 0, dx = 0, el = null;
    cont.addEventListener('touchstart', e => {
      el = e.target.closest('.item:not(.done)');
      if (!el) return;
      sx = e.touches[0].clientX; dx = 0;
    }, {passive:true});
    cont.addEventListener('touchmove', e => {
      if (!el) return;
      dx = e.touches[0].clientX - sx;
      if (dx > 0 && dx < 120) el.style.transform = `translateX(${dx}px)`;
    }, {passive:true});
    cont.addEventListener('touchend', () => {
      if (!el) return;
      if (dx > 80) { const pid = el.dataset.pid; if (pid) toggle(pid); }
      el.style.transform = '';
      dx = 0; el = null;
    });
  });
}

/* ═══════════════════════════════════════
   AGENDA
═══════════════════════════════════════ */
function shiftWeek(n) { weekOff += n; renderAgenda(); }

function renderAgenda() {
  // weekOff ora rappresenta lo shift in MESI (legacy nome retro-compatibile)
  const t = toISO();
  const today = new Date(); today.setHours(0,0,0,0);
  const refMonth = new Date(today.getFullYear(), today.getMonth() + weekOff, 1);
  const year = refMonth.getFullYear();
  const month = refMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // startDow: lunedi=0, domenica=6
  const startDow = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();

  // Label mese
  const monthLbl = refMonth.toLocaleDateString('it-IT', {month:'long', year:'numeric'});
  $('dWkLbl').textContent = monthLbl;
  $('mWkLbl').textContent = monthLbl;

  const expanded = expand();
  const days = ['Lu','Ma','Me','Gi','Ve','Sa','Do'];

  // Header giorni della settimana
  let dh = '<div class="month-grid">';
  days.forEach(d => dh += `<div class="month-dow">${d}</div>`);
  // Celle vuote prima del primo del mese
  for(let i = 0; i < startDow; i++) dh += `<div class="month-day empty"></div>`;
  // Giorni del mese
  for(let d = 1; d <= totalDays; d++){
    const date = new Date(year, month, d);
    const iso = dateToISO(date);
    const holiday = getHoliday(iso);
    const _dayIt = expanded.filter(x => x.data === iso && !x.done && isProfileArea(x.area));
    const _hasUrg = _dayIt.some(x => x.prio === 'alta' || ['test','scadenza'].includes(x.tipo));
    const dayDots = _dayIt.slice(0,3).map(it =>
      `<span class="month-dot ${(it.prio==='alta'||['test','scadenza'].includes(it.tipo))?'urgent':''}" style="background:${gc(it.area)}"></span>`
    ).join('');
    const cls = [
      iso===t ? 'today' : '',
      iso===agDay ? 'selected' : '',
      _dayIt.length ? 'has-items' : '',
      _hasUrg ? 'has-urgent' : '',
      holiday ? 'is-holiday' : ''
    ].filter(Boolean).join(' ');
    const titleAttr = holiday ? ` title="${esc(holiday)}"` : '';
    dh += `<button class="month-day ${cls}"${titleAttr} onclick="selDay('${iso}')" type="button"><span class="month-num">${d}</span><span class="month-dots">${dayDots}</span></button>`;
  }
  dh += '</div>';
  $('dWkGrid').innerHTML = dh;
  $('mWkGrid').innerHTML = dh;

  let list = expanded.filter(i => i.data === agDay && (currentProfile !== 'anissa' || i.area !== 'startup'));
  if (filter) list = list.filter(i => i.area === filter);
  list.sort((a,b) => (a.ora||'99:99').localeCompare(b.ora||'99:99'));

  const agDisplay = agDay
    ? new Date(agDay + 'T12:00:00').toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'})
    : new Date().toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'});
  const agHoliday = getHoliday(agDay || t);
  const holPrefix = agHoliday ? `🇨🇭 ${agHoliday} · ` : '';
  const lbl  = `${holPrefix}${agDisplay} · ${list.length} element${list.length!==1?'i':'o'}`;
  const html = list.length ? list.map(card).join('') : emptyHTML('Nessun impegno per questo giorno');
  $('dAgLbl').textContent = lbl; $('dAgList').innerHTML = html;
  $('mAgLbl').textContent = lbl; $('mAgList').innerHTML = html;
}

function selDay(iso) { agDay = iso; $('fData').value = iso; renderAgenda(); }

/* ═══════════════════════════════════════
   STARTUP HUB
═══════════════════════════════════════ */


/* ═══════════════════════════════════════
   VIEW SWITCH
═══════════════════════════════════════ */
function setView(v) {
  // Anissa non ha il Weekend — redirect a Oggi
  if (v === 'weekend' && currentProfile === 'anissa') v = 'oggi';
  if (v === 'startup' && currentProfile === 'anissa') v = 'oggi';
  if (v === 'jasper'  && currentProfile === 'rico')   v = 'oggi';
  currentView = v;
  document.querySelector('.app')?.setAttribute('data-view', v);
  if (v === 'oggi')    loadMIT();
  if (v === 'startup') renderStartup();
  if (v === 'jasper')  renderJasper();
  document.querySelectorAll('[id^="dv-"],[id^="mv-"]').forEach(e=>e.classList.remove('active'));
  document.querySelectorAll('.sb-btn[data-v],.bot-btn').forEach(b=>b.classList.remove('active'));
  $('dv-'+v)?.classList.add('active');
  $('mv-'+v)?.classList.add('active');
  document.querySelectorAll(`[data-v="${v}"]`).forEach(b=>b.classList.add('active'));
  if (v==='agenda') renderAgenda();
  if (v==='briefing') {
    checkNightReset();
    if (briefingDate !== toISO() && !briefingLoading) {
      setTimeout(() => doBriefing(), 250);
    }
  }
  renderAreas(); // aggiorna chip "OGGI" vs "Tutti" in base alla vista
  if (isMob()) window.scrollTo(0,0);
}

/* ═══════════════════════════════════════
   MODAL ADD
═══════════════════════════════════════ */
function openModal() {
  resetPills();
  fS = {tipo:'task', area:'lavoro', st:'remychef', cpc:'CCOA', prio:'media'};
  $('fData').value = agDay || toISO();
  $('fOra').value = '';
  $('fNote').value = '';
  $('fRecur').value = '';
  $('fTit').value = '';
  $('addOverlay').classList.add('open');
  setTimeout(() => $('fTit').focus(), 80);
}
function closeModal() {
  $('addOverlay').classList.remove('open');
  ['fTit','fOra','fNote'].forEach(id=>$(id).value='');
  $('fRecur').value='';
  fS={tipo:'task',area:'lavoro',st:'remychef',cpc:'CCOA',prio:'media'};
  editingItemId = null;
  resetPills();
  const btn=$('modalSubmitBtn'); const ttl=$('modalTitle');
  if(btn){btn.textContent='Aggiungi';btn.classList.remove('editing');}
  if(ttl) ttl.textContent='Nuovo elemento';
  const stopW=$('stopRecurWrap'); if(stopW) stopW.style.display='none';
}

// ── Variabile globale per edit mode ──
let editingItemId = null;

function submitModal() {
  if (editingItemId) saveEdit();
  else addItem();
}

function openEditModal(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  editingItemId = id;

  // Popola form con dati esistenti
  $('fTit').value   = it.titolo || '';
  $('fData').value  = it.data   || toISO();
  $('fOra').value   = it.ora    || '';
  $('fNote').value  = it.note   || '';
  $('fRecur').value = (!it.recurChild && it.recur) ? it.recur : '';

  // Imposta i pill group
  fS = {
    tipo: it.tipo  || 'task',
    area: it.area  || 'lavoro',
    st:   it.startupTag || 'remychef',
    cpc:  it.cpcTag     || 'CCOA',
    prio: it.prio  || 'media'
  };
  resetPills();
  setOnePill('gTipo', fS.tipo, 'tipo');
  setOnePill('gArea', fS.area, 'area');
  setOnePill('gPrio', fS.prio, 'prio');
  if (fS.area === 'startup')  { $('fStField').style.display='block';  setOnePill('gSt',  fS.st,  'st');  }
  if (fS.area === 'cpc')      { $('fCpcField').style.display='block'; setOnePill('gCpc', fS.cpc, 'cpc'); }

  // Mostra/nascondi bottone stop ricorrenza
  const stopWrap = $('stopRecurWrap');
  if (stopWrap) stopWrap.style.display = (it.recur && !it.recurChild) ? 'block' : 'none';

  // Cambia UI modal
  const btn=$('modalSubmitBtn'); const ttl=$('modalTitle');
  if(btn){btn.textContent='✓ Salva modifiche';btn.classList.add('editing');}
  if(ttl) ttl.textContent='Modifica elemento';

  $('addOverlay').classList.add('open');
  setTimeout(() => $('fTit').focus(), 80);
}

function stopRecurrence() {
  if (!editingItemId) return;
  const it = items.find(i => i.id === editingItemId);
  if (!it || !it.recur) return;
  // Nessun confirm() — esegui direttamente con toast undo
  const prevRecur = it.recur;
  const itemId    = editingItemId;
  items = items.map(i => i.id === itemId ? {...i, recur: ''} : i);
  saveItems();
  closeModal();
  renderAll();
  toast('↻ Ricorrenza interrotta ✓', 'success');
}

function saveEdit() {
  if (!editingItemId) return;
  const titolo = $('fTit').value.trim();
  if (!titolo) { $('fTit').focus(); return; }

  items = items.map(it => {
    if (it.id !== editingItemId) return it;
    return {
      ...it,
      titolo,
      tipo:  fS.tipo,
      area:  fS.area,
      prio:  fS.prio,
      ora:   $('fOra').value  || '',
      data:  ($('fData').value || toISO()).slice(0, 10),
      note:  $('fNote').value || '',
      recur: (!it.recurChild) ? $('fRecur').value : it.recur,
      ...(fS.area === 'startup' ? {startupTag: fS.st}  : {startupTag: ''}),
      ...(fS.area === 'cpc'     ? {cpcTag: fS.cpc}     : {cpcTag: ''}),
    };
  });

  saveItems();
  closeModal();
  renderAll();
  checkSmartNotifs();
  toast('✓ Elemento aggiornato', 'success');
}

function pillColor(group, val) {
  if (group==='prio')  return PRIO_CLR[val];
  if (group==='area')  return gc(val);
  return '#d4a843';
}

function applyPill(btn, group, val) {
  const c = pillColor(group, val);
  btn.style.background = c; btn.style.color='#111'; btn.style.borderColor=c;
}

function setOnePill(groupId, val, group) {
  document.querySelectorAll('#'+groupId+' .pill').forEach(p=>{
    p.classList.remove('on'); p.style.background=p.style.color=p.style.borderColor='';
  });
  const b = document.querySelector(`#${groupId} [data-v="${val}"]`);
  if (b) { b.classList.add('on'); applyPill(b, group, val); }
}

function resetPills() {
  setOnePill('gTipo','task','tipo');
  setOnePill('gArea','lavoro','area');
  setOnePill('gSt','remychef','st');
  setOnePill('gCpc','CCOA','cpc');
  setOnePill('gPrio','media','prio');
  $('fStField').style.display='none';
  $('fCpcField').style.display='none';
}

function toggleAreaPills() {
  document.querySelectorAll('.area-extra').forEach(p => p.classList.toggle('show'));
  const tog = document.querySelector('.area-toggle');
  if (tog) tog.textContent = tog.textContent.includes('+') ? '− Meno' : '+ Altro';
}

function pill(group, btn) {
  const gmap={tipo:'gTipo',area:'gArea',st:'gSt',cpc:'gCpc',prio:'gPrio'};
  document.querySelectorAll('#'+gmap[group]+' .pill').forEach(p=>{
    p.classList.remove('on'); p.style.background=p.style.color=p.style.borderColor='';
  });
  btn.classList.add('on');
  fS[group] = btn.dataset.v;
  applyPill(btn, group, btn.dataset.v);
  if (group==='area') {
    $('fStField').style.display  = fS.area==='startup'  ? 'block' : 'none';
    $('fCpcField').style.display = fS.area==='cpc'      ? 'block' : 'none';
  }
}

function addItem(pre) {
  const titolo = (pre?.titolo || $('fTit').value).trim();
  if (!titolo) { $('fTit').focus(); return; }
  const it = {
    id:    uid(),
    titolo,
    tipo:  pre?.tipo  || fS.tipo,
    area:  pre?.area  || fS.area,
    prio:  pre?.prio  || fS.prio,
    ora:   pre?.ora   || $('fOra').value  || '',
    data:  (isValidDate(pre?.data) ? pre.data : ($('fData').value || toISO())).slice(0,10), // always YYYY-MM-DD
    note:  pre?.note  || $('fNote').value.trim() || '',
    recur: pre?.recur || $('fRecur').value || '',
    done:  false,
    ...(((pre?.area||fS.area)==='startup') ? {startupTag: pre?.st||fS.st} : {}),
    ...(((pre?.area||fS.area)==='cpc')     ? {cpcTag:     pre?.cpc||fS.cpc} : {}),
  };
  items.unshift(it);
  saveItems();
  if (!pre) closeModal();
  renderAll();
  checkSmartNotifs();
  toast(`"${titolo.slice(0,28)}" aggiunto ✓`, 'success');
  scheduleNotifs();
}

/* ═══════════════════════════════════════
   SETTINGS / API KEY
═══════════════════════════════════════ */
function openSettings() {
  $('keyInp').value     = apiKey;
  $('keyInp').type      = 'password'; // always reset to hidden on open
  $('keyToggle').textContent = 'Mostra';
  $('keyStatus').textContent = apiKey ? '✓ Key configurata' : '';
  $('keyStatus').className   = apiKey ? 'key-status ok' : 'key-status';
  $('settingsOverlay').classList.add('open');
  if (!apiKey) setTimeout(() => $('keyInp').focus(), 80);
}
function closeSettings() { $('settingsOverlay').classList.remove('open'); }

function toggleKeyVis() {
  const inp = $('keyInp');
  const btn = $('keyToggle');
  if (inp.type==='password') { inp.type='text';     btn.textContent='Nascondi'; }
  else                        { inp.type='password'; btn.textContent='Mostra'; }
}

function saveKey() {
  const k = $('keyInp').value.trim();
  if (!k) { $('keyStatus').textContent='Inserisci una key valida'; $('keyStatus').className='key-status err'; return; }
  if (!k.startsWith('sk-ant')) { $('keyStatus').textContent='Formato non valido (deve iniziare con sk-ant...)'; $('keyStatus').className='key-status err'; return; }
  apiKey = k;
  localStorage.setItem('rico_apikey_'+currentProfile, k);
  $('keyStatus').textContent = '✓ Salvata! Tutte le funzioni AI sono attive.';
  $('keyStatus').className   = 'key-status ok';
  updateKeyUI();
  checkSmartNotifs(); // show morning/evening banners now that key is set
  toast('API Key salvata ✓', 'success');
  setTimeout(closeSettings, 1200);
}

function updateKeyUI() {
  const has = !!apiKey;
  ['dBanner','mBanner'].forEach(id => { const el=$(id); if(el) el.style.display = has?'none':'block'; });
  ['dQaInp','mQaInp'].forEach(id  => {
    const el = $(id); if(!el) return;
    el.disabled    = !has;
    el.placeholder = has
      ? 'Aggiunta rapida → es. "test CCOB giovedì mattina, alta priorità"'
      : 'Configura prima la API Key → ⚙ in alto a destra';
  });
}

let _clearDataPending = false;
function clearData() {
  if (!_clearDataPending) {
    _clearDataPending = true;
    toast('⚠️ Tocca di nuovo per confermare la cancellazione di TUTTI i dati', 'warn');
    setTimeout(() => { _clearDataPending = false; }, 4000);
    return;
  }
  _clearDataPending = false;
  localStorage.removeItem('rico_items');
  localStorage.removeItem('rico_st');
  // Purge all notification tracking keys
  Object.keys(localStorage).filter(k => k.startsWith('notif_')).forEach(k => localStorage.removeItem(k));
  dismissedBanners.clear();
  items = []; stData = {};
  Object.keys(STS).forEach(k => stData[k] = {stage:'Building', next:'', block:'', updated:''});
  renderAll();
  checkSmartNotifs();
  closeSettings();
  toast('Dati cancellati', 'warn');
}

/* ═══════════════════════════════════════
   AI BRIEFING
═══════════════════════════════════════ */
let briefingLoading = false;
let briefingDate    = null;
// Persistito in localStorage per evitare reset spuri ad ogni refresh dopo le 04:00
let briefingResetDate = localStorage.getItem('rico_briefing_reset') || null;

/* Reset chat alle 4:00 svizzere: notte profonda, garantito chat nuova al mattino */
function checkNightReset() {
  const swissH = parseInt(new Date().toLocaleString('en-US', {timeZone:'Europe/Zurich', hour:'2-digit', hour12:false}));
  const swissDateStr = new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Zurich'}); // YYYY-MM-DD
  if (swissH >= 4 && briefingResetDate !== swissDateStr) {
    // Salva memoria PRIMA di resettare — copia snapshot sincrona
    const _histSnap = chatHistory.slice();
    saveMemory(_histSnap).catch(()=>{});
    chatHistory    = [];
    briefingDate   = null;
    briefingResetDate = swissDateStr;
    try { localStorage.setItem('rico_briefing_reset', swissDateStr); } catch(e) { /* quota ignora */ }
    if (typeof scheduledNotifIds !== 'undefined') scheduledNotifIds.clear();
    // Purge chat localStorage dei giorni precedenti
    if (typeof purgeOldChats === 'function') purgeOldChats();
    // Pulisci UI chat
    ['d','m'].forEach(p => {
      const msgs = $(p+'ChatMsgs'); if(msgs) msgs.innerHTML = '';
      const box  = $(p+'AiBox');   if(box)  { box.innerHTML=''; box.classList.remove('show'); }
      const conf = $(p+'ChatConfirm'); if(conf){ conf.style.display='none'; conf.innerHTML=''; }
    });
  }
}
