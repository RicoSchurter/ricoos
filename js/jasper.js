/* ═══ COSTANTI JASPER ═══ */
const JASPER_MILESTONES = [
  {m:0,  e:'🎂', l:'Nascita'},
  {m:1,  e:'👁',  l:'Fissa'},
  {m:2,  e:'😊', l:'Sorride'},
  {m:3,  e:'🦒', l:'Regge la testa'},
  {m:4,  e:'😄', l:'Ride'},
  {m:5,  e:'🔄', l:'Si gira'},
  {m:6,  e:'🪑', l:'Siede'},
  {m:7,  e:'🫳', l:'Prende oggetti'},
  {m:8,  e:'💬', l:'Lallazione'},
  {m:9,  e:'🐛', l:'Gattona'},
  {m:10, e:'🧗', l:'Si tira su'},
  {m:12, e:'👣', l:'Primi passi'},
  {m:15, e:'🚶', l:'Cammina'},
  {m:18, e:'💬', l:'Parola'},
  {m:24, e:'🗣', l:'Frasi'},
];

const JASPER_PHRASES = [
  'Ogni settimana Jasper scopre qualcosa di nuovo — sei lì a vederlo tutto.',
  'Stai facendo un lavoro straordinario, anche nelle notti difficili.',
  'Jasper cresce ogni giorno. E tu con lui.',
  'I momenti che sembrano piccoli sono quelli che Jasper ricorderà.',
  'Sei la sua persona preferita al mondo. Lo sa già.',
  'Anche tu stai crescendo — come mamma, ogni giorno.',
  'Le notti difficili passano. I sorrisi di Jasper restano.',
  'Prendersi cura di qualcuno così è il lavoro più importante che esiste.',
];

/* ═══ JASPER — mini-app per Anissa ═══ */
let jasperTab = 'oggi';
let jasperCalMonth = null; // {year, month} per il calendario

let _jasperRendering = false;

function jasperSetTab(tab) {
  jasperTab = tab;
  // Se renderJasper e ancora in corso, aspetta che finisca prima di renderizzare il sub-tab
  if (_jasperRendering) {
    setTimeout(() => jasperSetTab(tab), 50);
    return;
  }
  document.querySelectorAll('.jas-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.jas-tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
  if (tab === 'storico') renderJasperStorico();
  if (tab === 'crescita') renderJasperCrescita();
  if (tab === 'cibo') renderJasperCibo();
}

/* ── Età ── */
function jasperAgeDetails() {
  const now=new Date(), bd=JASPER_BD;
  let months=(now.getFullYear()-bd.getFullYear())*12+now.getMonth()-bd.getMonth();
  const pivot=new Date(bd.getFullYear(),bd.getMonth()+months,bd.getDate());
  if(pivot>now)months--;
  const pivot2=new Date(bd.getFullYear(),bd.getMonth()+months,bd.getDate());
  const days=Math.floor((now-pivot2)/86400000);
  const totalD=Math.floor((now-bd)/86400000);
  return{months,days,totalD};
}

/* ── Diary key ── */
function jasperDiaryKey(date){return 'jasper_diary_'+(date||toISO());}

async function loadJasperDiary(date){
  const key=jasperDiaryKey(date);
  if(stData[key]){
    const entry = JSON.parse(JSON.stringify(stData[key]));
    // Migrazione backward-compat: assicura esistenza sleeps array
    if(!Array.isArray(entry.sleeps)) entry.sleeps = [];
    if(!Array.isArray(entry.meals)) entry.meals = [];
    if(!Array.isArray(entry.notes)) entry.notes = [];
    return entry;
  }
  return{notes:[],meals:[],sleeps:[],lastMeal:null};
}

/* ── Helper sleep ── */
function hhmmDiffMin(a, b){
  if(!a || !b) return 0;
  const [ah,am] = a.split(':').map(Number);
  const [bh,bm] = b.split(':').map(Number);
  let diff = (bh*60+bm) - (ah*60+am);
  if(diff < 0) diff += 24*60;
  return diff;
}
function formatMin(min){
  if(min < 1) return 'adesso';
  if(min < 60) return min + ' min';
  const h = Math.floor(min/60), m = min%60;
  return h + 'h' + (m > 0 ? ' ' + m + 'min' : '');
}
function openingSleep(entry){
  return (entry.sleeps||[]).find(s => s.start && !s.end) || null;
}
function nowHHMMSwiss(){
  return new Date().toLocaleTimeString('it-IT',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'});
}

/* ── HHMM picker 24h: due number input (ora 0-23, minuti 0-59).
   Evita il clock picker nativo 12h che confonde AM/PM. ── */
function hhmmPickerHTML(idPrefix, hhmm, opts){
  const o = opts || {};
  const parts = (hhmm||'').split(':');
  const hh = parts[0] != null && parts[0] !== '' ? String(parseInt(parts[0],10)||0).padStart(2,'0') : '';
  const mm = parts[1] != null && parts[1] !== '' ? String(parseInt(parts[1],10)||0).padStart(2,'0') : '';
  const nowBtn = o.withNow
    ? `<button type="button" class="jas-hhmm-now" onclick="jasperHHMMPickerNow('${idPrefix}')" title="Ora attuale">⟲</button>`
    : '';
  const placeholder = o.allowEmpty ? ' placeholder="--"' : '';
  return `<div class="jas-hhmm-picker">
    <input type="number" min="0" max="23" step="1" inputmode="numeric" class="jas-hhmm-inp" id="${idPrefix}H" value="${hh}"${placeholder}>
    <span class="jas-hhmm-sep">:</span>
    <input type="number" min="0" max="59" step="1" inputmode="numeric" class="jas-hhmm-inp" id="${idPrefix}M" value="${mm}"${placeholder}>
    ${nowBtn}
  </div>`;
}
function readHHMMPicker(idPrefix){
  const hEl = document.getElementById(idPrefix+'H');
  const mEl = document.getElementById(idPrefix+'M');
  if(!hEl || !mEl) return null;
  const hRaw = (hEl.value||'').trim();
  const mRaw = (mEl.value||'').trim();
  if(hRaw === '' && mRaw === '') return null;
  const h = parseInt(hRaw,10);
  const m = parseInt(mRaw,10);
  if(isNaN(h) || h < 0 || h > 23) return null;
  if(isNaN(m) || m < 0 || m > 59) return null;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}
function jasperHHMMPickerNow(idPrefix){
  const now = nowHHMMSwiss();
  const [h,m] = now.split(':');
  const hEl = document.getElementById(idPrefix+'H');
  const mEl = document.getElementById(idPrefix+'M');
  if(hEl) hEl.value = String(parseInt(h,10)).padStart(2,'0');
  if(mEl) mEl.value = String(parseInt(m,10)).padStart(2,'0');
}

async function saveJasperEntry(date,data){
  const key=jasperDiaryKey(date);
  stData[key]=data;
  // localStorage = source of truth: always write synchronously
  localStorage.setItem('rico_st',JSON.stringify(stData));
  // Supabase = backup sync: fire-and-forget with logging
  sbFetch('startup_data',{
    method:'POST',
    prefer:'resolution=merge-duplicates,return=minimal',
    body:JSON.stringify({id:key,data})
  }).catch(e => console.warn('saveJasperEntry Supabase sync failed (localStorage OK):', e));
}

/* ── Render principale ── */
async function renderJasper(){
  _jasperRendering = true;
  // Placeholder solo nell'active container (no ID duplicati)
  const _activePre = jasperActive();
  if(_activePre && !_activePre.querySelector('.jasper-page')){
    _activePre.innerHTML='<div style="padding:40px;text-align:center;color:#6a5030;font-size:28px">🌿</div>';
  }
  // Svuota l'inactive sempre
  const _inactivePre = jasperInactive();
  if(_inactivePre) _inactivePre.innerHTML='';
  try {
  // Save scroll position before re-render (prevents iOS scroll jump)
  const _scrollY = window.scrollY || document.documentElement.scrollTop;

  const{months,days,totalD}=jasperAgeDetails();
  const today=toISO();
  const entry=await loadJasperDiary(today);
  jasperDiary[today]=entry;

  const phrase=JASPER_PHRASES[Math.floor(totalD/7)%JASPER_PHRASES.length];
  const ageEmoji=months<3?'👶':months<6?'🍼':months<9?'🧸':months<12?'🐣':'👦';
  const ageStr=months+' mes'+(months===1?'e':'i')+(days>0?' e '+days+' giorn'+(days===1?'o':'i'):'');

  // Pasti di oggi (ordinati per ora, piu recente in cima)
  const meals=(entry.meals||[]).slice().sort((a,b)=>(b.hhmm||'').localeCompare(a.hhmm||''));
  const mealsListHtml=meals.length
    ? meals.map((m,i)=>`<div class="jas-meal-row">
        <span class="jas-meal-time">🍼 ${esc(m.hhmm||'?')}</span>
        <button class="jas-meal-del" onclick="jasperDeleteMeal(${i})" title="Rimuovi">×</button>
      </div>`).join('')
    : '<div class="jas-meal-empty">Nessun pasto registrato oggi</div>';

  // Ultimo pasto (tempo fa)
  const lastMealTime = meals.length ? meals[0].hhmm : null;
  function timeAgoFromHHMM(hhmm){
    if(!hhmm) return '—';
    const [h,m]=hhmm.split(':').map(Number);
    const now=new Date();
    const mealDate=new Date();
    mealDate.setHours(h,m,0,0);
    const diffMin=Math.max(0,Math.floor((now-mealDate)/60000));
    if(diffMin<1) return 'adesso';
    if(diffMin<60) return diffMin+' min fa';
    const hh=Math.floor(diffMin/60), mm=diffMin%60;
    return hh+'h'+(mm>0?' '+mm+'min':'')+' fa';
  }
  const lastMealAgo = timeAgoFromHHMM(lastMealTime);

  // Ora corrente per default del time picker
  const nowHHMM = new Date().toLocaleTimeString('it-IT',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'});

  // ── SONNO / Pisolini ──
  const sleeps = entry.sleeps || [];
  const opening = openingSleep(entry);
  const completedSleeps = sleeps.filter(s => s.start && s.end).slice().sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  const lastCompleted = completedSleeps.length ? completedSleeps[completedSleeps.length-1] : null;

  // Cross-midnight: se oggi non ha un pisolino aperto, cercane uno aperto in ieri.
  // Il pisolino della notte resta salvato sull'entry di ieri (dove è iniziato);
  // jasperEndSleep() ha già il fallback per chiuderlo lì. Qui lo mostriamo come
  // attivo così il timer non appare "bloccato" al mattino.
  let overnightOpening = null;
  if(!opening){
    const yesterday = dateToISO(new Date(Date.now() - 86400000));
    const yEntry = jasperDiary[yesterday] || stData[jasperDiaryKey(yesterday)];
    if(yEntry && Array.isArray(yEntry.sleeps)){
      overnightOpening = yEntry.sleeps.find(s => s.start && !s.end) || null;
    }
  }

  // Card stato sonno (sleeping / awake / mai)
  let sleepCardHtml;
  if(opening){
    const sleepingFor = hhmmDiffMin(opening.start, nowHHMM);
    sleepCardHtml = `<div class="jas-sleep-card sleeping">
      <div class="jas-sleep-lbl">💤 Sta dormendo</div>
      <div class="jas-sleep-status">da ${formatMin(sleepingFor)}</div>
      <div class="jas-sleep-detail">iniziato alle ${esc(opening.start)}</div>
      <button class="jas-sleep-btn wake" onclick="jasperEndSleep()" type="button">☀️ Svegliato ora</button>
    </div>`;
  } else if(overnightOpening){
    const sleepingFor = hhmmDiffMin(overnightOpening.start, nowHHMM);
    sleepCardHtml = `<div class="jas-sleep-card sleeping">
      <div class="jas-sleep-lbl">🌙 Sta dormendo (notte)</div>
      <div class="jas-sleep-status">da ${formatMin(sleepingFor)}</div>
      <div class="jas-sleep-detail">iniziato alle ${esc(overnightOpening.start)} di ieri</div>
      <button class="jas-sleep-btn wake" onclick="jasperEndSleep()" type="button">☀️ Svegliato ora</button>
    </div>`;
  } else if(lastCompleted){
    const awakeFor = hhmmDiffMin(lastCompleted.end, nowHHMM);
    const duration = hhmmDiffMin(lastCompleted.start, lastCompleted.end);
    sleepCardHtml = `<div class="jas-sleep-card">
      <div class="jas-sleep-lbl">☀️ Sveglio</div>
      <div class="jas-sleep-status">da ${formatMin(awakeFor)}</div>
      <div class="jas-sleep-detail">ultimo pisolino ${esc(lastCompleted.start)}→${esc(lastCompleted.end)} · ${formatMin(duration)}</div>
      <button class="jas-sleep-btn" onclick="jasperStartSleep()" type="button">💤 Dorme ora</button>
    </div>`;
  } else if(entry.woke_at){
    // Tipicamente: mattino dopo pisolino notturno cross-midnight chiuso su ieri.
    // Oggi non ha completati ma sappiamo l'orario di sveglia → timer "Sveglio da X".
    const awakeFor = hhmmDiffMin(entry.woke_at, nowHHMM);
    sleepCardHtml = `<div class="jas-sleep-card">
      <div class="jas-sleep-lbl">☀️ Sveglio</div>
      <div class="jas-sleep-status">da ${formatMin(awakeFor)}</div>
      <div class="jas-sleep-detail">svegliato alle ${esc(entry.woke_at)}</div>
      <button class="jas-sleep-btn" onclick="jasperStartSleep()" type="button">💤 Dorme ora</button>
    </div>`;
  } else {
    sleepCardHtml = `<div class="jas-sleep-card">
      <div class="jas-sleep-lbl">Sonno</div>
      <div class="jas-sleep-status">Nessun pisolino oggi</div>
      <div class="jas-sleep-detail">Inizia a tracciare quando Jasper dorme</div>
      <button class="jas-sleep-btn" onclick="jasperStartSleep()" type="button">💤 Dorme ora</button>
    </div>`;
  }

  // Lista pisolini di oggi con gap di sveglia tra uno e l'altro
  let sleepsListHtml = '';
  if(completedSleeps.length || opening){
    const rows = [];
    completedSleeps.forEach((s, i) => {
      const duration = hhmmDiffMin(s.start, s.end);
      rows.push(`<div class="jas-sleep-row">
        <span class="jas-sleep-time">💤 ${esc(s.start)} → ${esc(s.end)} · ${formatMin(duration)}</span>
        <button class="jas-sleep-del" onclick="jasperDeleteSleep('${esc(s.start)}',event)" title="Rimuovi" type="button">×</button>
      </div>`);
      // Gap verso il prossimo (altro pisolino completato o quello in corso)
      const next = completedSleeps[i+1] || opening;
      if(next){
        const gap = hhmmDiffMin(s.end, next.start);
        rows.push(`<div class="jas-sleep-gap">↕ ${formatMin(gap)} sveglio</div>`);
      }
    });
    if(opening){
      rows.push(`<div class="jas-sleep-row active">
        <span class="jas-sleep-time">💤 ${esc(opening.start)} → <em>in corso</em> · ${formatMin(hhmmDiffMin(opening.start, nowHHMM))}</span>
      </div>`);
    }
    sleepsListHtml = rows.join('');
  }

  // Note oggi
  const notesHtml=(entry.notes||[]).slice().reverse().slice(0,10).map((n,i)=>
    `<div class="jas-note-item">
      <span class="jas-note-ts">${esc(n.ts||'')}</span>${esc(n.text)}
      <button class="jas-note-del" onclick="jasperDeleteNote(${entry.notes.length-1-i})">×</button>
    </div>`
  ).join('');

  const html=`<div class="jasper-page">
    <!-- Header -->
    <div class="jas-hdr">
      <span class="jas-emoji">${ageEmoji}</span>
      <div class="jas-age">${ageStr}</div>
      <div class="jas-age-sub">${totalD} giorni nel mondo · nato il 12/09/2025</div>
      <div class="jas-phrase">${phrase}</div>
    </div>

    <!-- Sub-tab -->
    <div class="jas-tabs">
      <button class="jas-tab active" data-tab="oggi" onclick="jasperSetTab('oggi')" type="button">📅 Oggi</button>
      <button class="jas-tab" data-tab="cibo" onclick="jasperSetTab('cibo')" type="button">🥕 Cibo</button>
      <button class="jas-tab" data-tab="storico" onclick="jasperSetTab('storico')" type="button">🗓 Storico</button>
      <button class="jas-tab" data-tab="crescita" onclick="jasperSetTab('crescita')" type="button">📊 Crescita</button>
    </div>

    <!-- TAB OGGI — Solo pasti + note -->
    <div class="jas-tab-pane active" data-pane="oggi">

      <!-- Ultimo pasto card -->
      <div class="jas-last-meal-card">
        <div class="jas-last-meal-lbl">⏱ Ultimo pasto</div>
        <div class="jas-last-meal-val">${lastMealTime||'—'}</div>
        <div class="jas-last-meal-sub">${lastMealTime?lastMealAgo:'nessun pasto oggi'} · ${meals.length} pasti oggi</div>
      </div>

      <!-- Aggiungi pasto -->
      <div class="jas-add-meal">
        <div class="jas-section-lbl">🍼 Registra pasto</div>
        <div class="jas-add-meal-row">
          ${hhmmPickerHTML('jasMealTime', nowHHMM, {withNow:true})}
          <button class="jas-meal-save-btn" onclick="jasperLogMealTime()">+ Aggiungi</button>
        </div>
      </div>

      <!-- Lista pasti oggi -->
      <div class="jas-meals-list">
        <div class="jas-section-lbl">Pasti di oggi</div>
        <div class="jas-meals-rows">${mealsListHtml}</div>
      </div>

      <!-- Sonno / Pisolini -->
      <div class="jas-section-lbl" style="margin-top:8px">💤 Sonno</div>
      ${sleepCardHtml}

      ${sleepsListHtml ? `<div class="jas-sleeps-list">
        <div class="jas-section-lbl">🌙 Pisolini di oggi (${completedSleeps.length}${opening?' + 1 in corso':''})</div>
        <div class="jas-sleeps-rows">${sleepsListHtml}</div>
      </div>` : ''}

      <button class="jas-sleep-add-btn" onclick="jasperShowManualSleepForm()" type="button">+ Aggiungi pisolino manualmente</button>
      <div id="jasManualSleepForm" style="display:none"></div>

      <!-- Note veloci -->
      <div class="jas-notes-block">
        <div class="jas-section-lbl">📝 Note di oggi</div>
        <textarea class="jas-note-inp" id="jasNoteInp" rows="2"
          placeholder='es. "Ha riso tanto" · "Primo dentino" · "6h di fila"'
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();jasperSaveNote();}"
          oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button class="jas-note-save-btn" onclick="jasperSaveNote()">💾 Salva nota</button>
        </div>
        <div class="jas-note-saved">${notesHtml}</div>
      </div>
    </div>

    <!-- TAB CIBO -->
    <div class="jas-tab-pane" data-pane="cibo" id="jasCiboPane">
      <div style="color:#6a5030;font-size:13px;text-align:center;padding:20px 0">Caricamento...</div>
    </div>

    <!-- TAB STORICO -->
    <div class="jas-tab-pane" data-pane="storico" id="jasStoricoPane">
      <div style="color:#6a5030;font-size:13px;text-align:center;padding:20px 0">Caricamento...</div>
    </div>

    <!-- TAB CRESCITA -->
    <div class="jas-tab-pane" data-pane="crescita" id="jasCrescitaPane">
      <div style="color:#6a5030;font-size:13px;text-align:center;padding:20px 0">Caricamento...</div>
    </div>
  </div>`;

  // Render only to the active container (mobile OR desktop) — evita ID duplicati
  const active = jasperActive();
  const inactive = jasperInactive();
  if (active) active.innerHTML = html;
  if (inactive) inactive.innerHTML = ''; // svuota l'altro per evitare duplicati DOM
  _jasperRendering = false;
  // Restore scroll position after re-render
  requestAnimationFrame(() => { window.scrollTo(0, _scrollY); });
  // Ripristina tab attivo
  if(jasperTab!=='oggi') setTimeout(()=>jasperSetTab(jasperTab),0);
  // Avvia live tick se c'e un pisolino attivo (auto-update durata)
  startSleepTick();
  } catch(err) {
    _jasperRendering = false;
    console.error('renderJasper error:', err);
    const active = jasperActive();
    if(active) active.innerHTML='<div style="padding:20px;color:#e06060;font-size:13px">Errore caricamento: '+err.message+'</div>';
  }
}

/* ── Live tick per sezione Sonno (aggiorna durate mentre Jasper dorme) ── */
let _sleepTickInterval = null;
function startSleepTick(){
  if(_sleepTickInterval) return;
  _sleepTickInterval = setInterval(() => {
    // Solo se siamo su tab Oggi Jasper e c'e un pisolino attivo
    if(jasperTab !== 'oggi') return;
    const today = toISO();
    const entry = jasperDiary[today] || stData[jasperDiaryKey(today)];
    const hasTodayOpen = entry && (entry.sleeps||[]).some(s => s.start && !s.end);
    // Cross-midnight: mantieni vivo il tick se ieri ha un pisolino aperto
    // (pisolino notturno iniziato prima di mezzanotte, non ancora chiuso).
    let hasOvernightOpen = false;
    if(!hasTodayOpen){
      const yesterday = dateToISO(new Date(Date.now() - 86400000));
      const yEntry = jasperDiary[yesterday] || stData[jasperDiaryKey(yesterday)];
      hasOvernightOpen = !!(yEntry && (yEntry.sleeps||[]).some(s => s.start && !s.end));
    }
    // Tick anche quando baby è sveglio, per aggiornare "Sveglio da X":
    // sia dopo un pisolino diurno (lastCompleted) sia dopo quello notturno (woke_at).
    const hasAwakeTimer = !hasTodayOpen && !hasOvernightOpen && entry && (
      (entry.sleeps||[]).some(s => s.start && s.end) || entry.woke_at
    );
    if(!hasTodayOpen && !hasOvernightOpen && !hasAwakeTimer){
      // Niente da aggiornare → stop tick
      clearInterval(_sleepTickInterval);
      _sleepTickInterval = null;
      return;
    }
    // Re-render solo se la view Jasper e visibile
    const active = jasperActive();
    if(active && active.querySelector('.jasper-page')){
      renderJasper();
    }
  }, 30000); // ogni 30 secondi
}

/* ── Helpers per evitare ID duplicati su dual-pane ── */
function jasperActive() {
  return document.getElementById(isMob() ? 'mv-jasper' : 'dv-jasper');
}
function jasperInactive() {
  return document.getElementById(isMob() ? 'dv-jasper' : 'mv-jasper');
}
function jasperPane(name) {
  return jasperActive()?.querySelector(`[data-pane="${name}"]`);
}

/* ── Storico calendario + Timeline milestone + Chart 7gg + Umore Anissa ── */
async function renderJasperStorico(){
  const pane=jasperPane('storico');
  const now=new Date();
  if(!jasperCalMonth) jasperCalMonth={year:now.getFullYear(),month:now.getMonth()};
  const{year,month}=jasperCalMonth;
  const firstDay=new Date(year,month,1);
  const lastDay=new Date(year,month+1,0);
  const today=toISO();
  const limit180=dateToISO(new Date(Date.now()-180*86400000));

  // Intestazione mese
  const mLbl=firstDay.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
  const canPrev=dateToISO(new Date(year,month,1))>limit180;
  const canNext=new Date(year,month+1,1)<=new Date(now.getFullYear(),now.getMonth()+1,1);

  // Giorni vuoti prima del primo giorno
  let startDow=(firstDay.getDay()+6)%7; // lun=0
  let calHtml='<div class="jas-cal-hdr">';
  calHtml+=`<button class="jas-cal-nav" onclick="jasperCalNav(-1)" ${!canPrev?'disabled style="opacity:.3"':''}>‹</button>`;
  calHtml+=`<div class="jas-cal-title">${mLbl}</div>`;
  calHtml+=`<button class="jas-cal-nav" onclick="jasperCalNav(1)" ${!canNext?'disabled style="opacity:.3"':''}>›</button>`;
  calHtml+='</div><div class="jas-cal-grid">';
  ['Lu','Ma','Me','Gi','Ve','Sa','Do'].forEach(d=>calHtml+=`<div class="jas-cal-dow">${d}</div>`);
  for(let i=0;i<startDow;i++) calHtml+=`<div class="jas-cal-day empty"></div>`;

  for(let d=1;d<=lastDay.getDate();d++){
    const iso=dateToISO(new Date(year,month,d));
    const isFuture=iso>today;
    const isPast180=iso<limit180;
    const e=stData[jasperDiaryKey(iso)]||{};
    const mealsCount=(e.meals||[]).length;
    const notesCount=(e.notes||[]).length;
    const hasData=!!(mealsCount||notesCount);
    const isToday=iso===today;
    const cls=[
      isFuture||isPast180?'future':'',
      hasData&&!isFuture&&!isPast180?'has-data':'',
      isToday?'today':'',
    ].filter(Boolean).join(' ');
    const dot=hasData&&!isFuture?'<div class="jas-cal-dot"></div>':'';
    calHtml+=`<button class="jas-cal-day ${cls}" onclick="${isFuture||isPast180?'':`openJasperDayPopup('${iso}')`}" type="button">${d}${dot}</button>`;
  }
  calHtml+='</div>';

  // Conteggio pasti ultimi 7 giorni
  const days7=[];
  for(let i=6;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const iso=dateToISO(d);
    const e=stData[jasperDiaryKey(iso)]||{};
    days7.push({day:d.toLocaleDateString('it-IT',{weekday:'short'}).slice(0,2).toUpperCase(),meals:(e.meals||[]).length,iso});
  }
  const maxMeals=Math.max(1,...days7.map(d=>d.meals));
  const weekBarsHtml=days7.map(d=>{
    const h=d.meals>0?Math.round((d.meals/maxMeals)*100):0;
    const isToday=d.iso===today;
    return `<div class="jas-chart-col">
      <div class="jas-chart-bar-wrap">
        <div class="jas-chart-bar" style="height:${Math.max(4,h)}%;background:#d4a843;width:100%"></div>
      </div>
      <div class="jas-chart-day" style="${isToday?'color:#f0c860;font-weight:bold':''}">${d.day}</div>
      <div style="font-size:10px;color:#6a5030;margin-top:2px">${d.meals||''}</div>
    </div>`;
  }).join('');
  const weekChartHtml=`<div class="jas-chart" style="margin:20px 0">
    <div style="font-size:10px;letter-spacing:2px;color:#6a5030;text-transform:uppercase;margin-bottom:10px">🍼 Pasti ultimi 7 giorni</div>
    ${days7.every(d=>!d.meals)
      ?'<div style="text-align:center;padding:16px 0;color:#4a3820;font-size:13px;font-style:italic">Inizia a registrare i pasti 🌱</div>'
      :'<div class="jas-chart-grid">'+weekBarsHtml+'</div>'
    }
  </div>`;

  const html=calHtml+weekChartHtml;
  if(pane) pane.innerHTML=html;
}

function jasperCalNav(dir){
  if(!jasperCalMonth){const n=new Date();jasperCalMonth={year:n.getFullYear(),month:n.getMonth()};}
  jasperCalMonth.month+=dir;
  if(jasperCalMonth.month>11){jasperCalMonth.month=0;jasperCalMonth.year++;}
  if(jasperCalMonth.month<0){jasperCalMonth.month=11;jasperCalMonth.year--;}
  renderJasperStorico();
}

/* ── Crescita: peso + milestone custom ── */
async function renderJasperCrescita(){
  const pane=jasperPane('crescita');
  const weights=(stData['jasper_weights']||{list:[]}).list;
  const sorted=[...weights].sort((a,b)=>a.date.localeCompare(b.date));
  const maxW=sorted.length?Math.max(...sorted.map(w=>w.kg)):6;
  const minW=sorted.length?Math.min(...sorted.map(w=>w.kg))-0.5:3;

  const barHtml=sorted.slice(-10).map(w=>{
    const pct=Math.round(((w.kg-minW)/(maxW-minW+0.1))*100);
    const dlbl=new Date(w.date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
    return `<div style="display:flex;flex-direction:column;align-items:center;flex:1">
      <div style="font-size:10px;color:#d4a843;margin-bottom:4px">${w.kg}</div>
      <div class="jas-weight-bar" style="height:${Math.max(8,pct)}%;width:100%;min-height:8px"></div>
      <div class="jas-weight-bar-lbl">${dlbl}</div>
    </div>`;
  }).join('');

  const listHtml=sorted.slice().reverse().slice(0,15).map((w,i)=>{
    const dlbl=new Date(w.date+'T12:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'long'});
    return `<div class="jas-weight-entry">
      <span style="font-size:11px;color:#6a5030">${dlbl}</span>
      ${w.note?`<span style="font-size:11px;color:#4a3820">${esc(w.note)}</span>`:''}
      <span class="jas-weight-val">${w.kg} kg</span>
      <button class="jas-weight-del" onclick="jasperDeleteWeight(${sorted.length-1-i})">×</button>
    </div>`;
  }).join('');

  // ── Milestone custom ──
  const cms=jasperCustomMilestones();
  const cmsHtml=cms.list.length
    ?cms.list.map((m,i)=>`<div class="jas-custom-ms-item"><span>✦</span><span>${esc(m.text)}</span><span class="jas-custom-ms-date">${m.label||m.date}</span><button class="jas-custom-ms-del" onclick="jasperDeleteMilestone(${i})">×</button></div>`).join('')
    :'<div style="font-size:12px;color:#4a3820;padding:8px 0">Nessuna milestone personale ancora</div>';

  const html=`<div>
    <div class="jas-section-lbl">⚖ Registra peso</div>
    <div class="jas-weight-inp-row">
      <input class="jas-weight-inp" id="jasWeightKg" placeholder="es. 7.25" inputmode="decimal" autocomplete="off" style="width:100px">
      <input class="jas-weight-inp" type="date" id="jasWeightDate" value="${toISO()}" max="${toISO()}">
      <input class="jas-weight-inp" id="jasWeightNote" placeholder="nota opzionale (es. Pediatra)" style="flex:1">
    </div>
    <button onclick="jasperLogWeight()" style="padding:9px 20px;background:#221608;border:1px solid #6a5030;border-radius:12px;color:#d4a843;font-size:13px;cursor:pointer;font-family:inherit;margin-bottom:20px">+ Salva peso</button>
    ${sorted.length>=2?`<div class="jas-section-lbl">📈 Curva di crescita</div>
    <div class="jas-weight-bar-wrap">${barHtml}</div>`:''}
    <div class="jas-section-lbl">📋 Storico pesi</div>
    ${listHtml||'<div style="font-size:13px;color:#4a3820;font-style:italic;padding:8px 0">Nessun peso registrato ancora</div>'}

    <!-- Milestone custom -->
    <div class="jas-custom-ms" style="margin-top:28px">
      <div class="jas-section-lbl">✦ Le tue milestone</div>
      <div class="jas-custom-ms-list">${cmsHtml}</div>
      <input class="jas-ms-inp" id="jasMsInp" autocomplete="off" autocorrect="off" autocapitalize="sentences" placeholder='es. "Prima volta che ha riso" · "Ha detto mamma"'
        maxlength="60" style="width:100%;margin-bottom:10px">
      <input class="jas-ms-inp" type="date" id="jasMsDate" value="${toISO()}" max="${toISO()}" style="width:100%;margin-bottom:10px">
      <button onclick="jasperAddMilestone()" class="jas-ms-save-btn">💾 Salva milestone</button>
    </div>
  </div>`;
  if(pane) pane.innerHTML=html;
}

/* ════════════════════════════════════════
   CIBO — Dedicata ad Anissa
   Database globale dei cibi che mangia Jasper
   con reazione 1-5 (faccine), supporto mix
   ════════════════════════════════════════ */
const FOOD_FACES = ['','🤮','😣','😐','🙂','😍'];
const FOOD_LABELS = ['','Vomita','Non gli piace','Neutro','Gli piace','Adora'];
let _cibofilter = 'all'; // 'all' | '1' | '2' | '3' | '4' | '5'

function jasperFoodsAll(){
  const data = stData['jasper_foods'] || {list:[]};
  if (!Array.isArray(data.list)) data.list = [];
  return data;
}

async function saveJasperFoods(foods){
  stData['jasper_foods']=foods;
  localStorage.setItem('rico_st',JSON.stringify(stData));
  sbFetch('startup_data',{
    method:'POST',
    prefer:'resolution=merge-duplicates,return=minimal',
    body:JSON.stringify({id:'jasper_foods',data:foods})
  }).catch(e => console.warn('saveJasperFoods Supabase sync failed:', e));
}

async function renderJasperCibo(){
  const pane=jasperPane('cibo');
  const foods=jasperFoodsAll();
  const list=foods.list||[];
  // Cleanup: se _editingFoodId non esiste piu (es. item cancellato), resettalo
  if(_editingFoodId && !list.some(f => f.id === _editingFoodId)) _editingFoodId = null;

  // Filter
  let filtered=list;
  // Filter by exact reaction (1-5)
  const fnum = parseInt(_cibofilter);
  if(!isNaN(fnum) && fnum>=1 && fnum<=5) {
    filtered = list.filter(f => (f.reaction||3) === fnum);
  }

  // Sort
  if(_cibofilter==='all') {
    // Tutti: ordina per reazione discendente (love prima)
    filtered = filtered.slice().sort((a,b)=>(b.reaction||0)-(a.reaction||0));
  } else {
    // Filtri specifici: ordina per data discendente (piu recenti prima)
    filtered = filtered.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  }

  const cardsHtml=filtered.length
    ? filtered.map(f=>{
        const dateLbl=f.date?new Date(f.date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'}):'';
        const typeLbl=f.type==='mix'?'<span class="jas-cibo-type-pill mix">MIX</span>':'<span class="jas-cibo-type-pill single">solo</span>';
        return `<div class="jas-cibo-card" data-react="${f.reaction||0}">
          <div class="jas-cibo-card-face">${FOOD_FACES[f.reaction||3]}</div>
          <div class="jas-cibo-card-body">
            <div class="jas-cibo-card-name">${esc(f.name)}</div>
            <div class="jas-cibo-card-meta">${typeLbl}${dateLbl?'<span class="jas-cibo-date">'+esc(dateLbl)+'</span>':''}</div>
            ${f.note?`<div class="jas-cibo-card-note">${esc(f.note)}</div>`:''}
          </div>
          <div class="jas-cibo-card-actions">
            <button class="jas-cibo-edit" onclick="jasperEditFood('${esc(f.id)}')" title="Modifica">✎</button>
            <button class="jas-cibo-del" onclick="jasperDeleteFoodEntry('${esc(f.id)}')" title="Rimuovi">×</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="jas-cibo-empty">Nessun cibo registrato ancora.<br>Aggiungi il primo qui sotto ✦</div>';

  // Stats
  const total=list.length;
  const loved=list.filter(f=>f.reaction>=4).length;
  const hated=list.filter(f=>f.reaction<=2).length;

  const html=`<div class="jas-cibo-page">
    <!-- Stats -->
    <div class="jas-cibo-stats">
      <div class="jas-cibo-stat">
        <div class="jas-cibo-stat-val">${total}</div>
        <div class="jas-cibo-stat-lbl">Totale</div>
      </div>
      <div class="jas-cibo-stat love">
        <div class="jas-cibo-stat-val">${loved}</div>
        <div class="jas-cibo-stat-lbl">Gli piace</div>
      </div>
      <div class="jas-cibo-stat hate">
        <div class="jas-cibo-stat-val">${hated}</div>
        <div class="jas-cibo-stat-lbl">No</div>
      </div>
    </div>

    <!-- Form aggiungi -->
    <div class="jas-cibo-form">
      <div class="jas-section-lbl">🥕 Aggiungi cibo</div>
      <input class="jas-cibo-inp" id="jasCiboName" autocomplete="off" autocorrect="off" autocapitalize="sentences"
        placeholder='es. "Carota" · "Pasta + zucchine + patate"' maxlength="60"
        onkeydown="if(event.key==='Enter'){event.preventDefault();jasperAddFoodEntry()}">

      <div class="jas-cibo-type-row">
        <label class="jas-cibo-type-opt">
          <input type="radio" name="ciboType" value="single" checked>
          <span>Singolo</span>
        </label>
        <label class="jas-cibo-type-opt">
          <input type="radio" name="ciboType" value="mix">
          <span>Mix</span>
        </label>
      </div>

      <div class="jas-cibo-faces-lbl">Come l'ha presa?</div>
      <div class="jas-cibo-faces" id="jasCiboFaces">
        ${[1,2,3,4,5].map(v=>`<button class="jas-cibo-face ${v===3?'selected':''}" data-v="${v}" onclick="jasperSelectFoodFace(${v})" type="button">${FOOD_FACES[v]}<span>${FOOD_LABELS[v]}</span></button>`).join('')}
      </div>

      <textarea class="jas-cibo-note" id="jasCiboNote" rows="2" placeholder="Nota opzionale (es. quantita, dettagli...)"></textarea>

      <button class="jas-cibo-save-btn" onclick="jasperAddFoodEntry()">💾 Salva cibo</button>
    </div>

    <!-- Filtri -->
    <div class="jas-cibo-filters">
      <button class="jas-cibo-filter ${_cibofilter==='all'?'on':''}" onclick="jasperSetCiboFilter('all')" type="button">Tutti</button>
      ${[1,2,3,4,5].map(v=>`<button class="jas-cibo-filter face ${_cibofilter===String(v)?'on':''}" onclick="jasperSetCiboFilter('${v}')" type="button">${FOOD_FACES[v]}</button>`).join('')}
    </div>

    <!-- Lista -->
    <div class="jas-cibo-list">${cardsHtml}</div>
  </div>`;

  if(pane) pane.innerHTML=html;
}

let _selectedFoodFace=3;
let _editingFoodId=null;

function jasperSelectFoodFace(v){
  _selectedFoodFace=v;
  document.querySelectorAll('.jas-cibo-face').forEach(b=>b.classList.toggle('selected',+b.dataset.v===v));
}

function jasperSetCiboFilter(f){
  _cibofilter=f;
  renderJasperCibo();
}

async function jasperAddFoodEntry(){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const active = jasperActive();
      const inp = active?.querySelector('#jasCiboName') || document.getElementById('jasCiboName');
      if(!inp||!inp.value.trim()){toast('Scrivi il nome del cibo','warn');return;}
      const type = (active?.querySelector('input[name="ciboType"]:checked') || document.querySelector('input[name="ciboType"]:checked'))?.value || 'single';
      const noteEl = active?.querySelector('#jasCiboNote') || document.getElementById('jasCiboNote');
      const note = (noteEl?.value||'').trim();
      const foods = jasperFoodsAll();
      if(_editingFoodId){
        const idx = foods.list.findIndex(f=>f.id===_editingFoodId);
        if(idx>=0){
          foods.list[idx] = {...foods.list[idx], name:inp.value.trim(), type, reaction:_selectedFoodFace, note};
          await saveJasperFoods(foods);
          toast('✓ Cibo aggiornato','success');
        }
        _editingFoodId = null;
      } else {
        foods.list.unshift({
          id:'food_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
          name:inp.value.trim(),
          type, reaction:_selectedFoodFace, date:toISO(), note
        });
        await saveJasperFoods(foods);
        toast('🥕 '+inp.value.trim()+' salvato','success');
      }
      inp.value = '';
      if(noteEl) noteEl.value = '';
      _selectedFoodFace = 3;
      renderJasperCibo();
    } catch(e) { console.error('jasperAddFoodEntry:', e); toast('Errore salvataggio cibo','warn'); }
  }).catch(() => {});
}

function jasperEditFood(id){
  const foods=jasperFoodsAll();
  const f=foods.list.find(x=>x.id===id);
  if(!f)return;
  _editingFoodId=id;
  _selectedFoodFace=f.reaction||3;
  setTimeout(()=>{
    const inp=document.getElementById('jasCiboName');
    const note=document.getElementById('jasCiboNote');
    if(inp){inp.value=f.name;inp.focus();}
    if(note) note.value=f.note||'';
    document.querySelectorAll('input[name="ciboType"]').forEach(r=>r.checked=(r.value===(f.type||'single')));
    document.querySelectorAll('.jas-cibo-face').forEach(b=>b.classList.toggle('selected',+b.dataset.v===_selectedFoodFace));
    inp?.scrollIntoView({behavior:'smooth',block:'center'});
  },50);
}

async function jasperDeleteFoodEntry(id){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const foods = jasperFoodsAll();
      foods.list = foods.list.filter(f=>f.id!==id);
      // Reset _editingFoodId se stiamo cancellando quello in edit
      if(_editingFoodId === id) _editingFoodId = null;
      await saveJasperFoods(foods);
      renderJasperCibo();
      toast('Cibo rimosso','info');
    } catch(e) { console.error('jasperDeleteFoodEntry:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

async function jasperLogWeight(){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      // Cerca l'input dentro l'active container per evitare duplicati
      const active = jasperActive();
      const inpEl = active?.querySelector('#jasWeightKg') || document.getElementById('jasWeightKg');
      const raw = (inpEl?.value||'').replace(',','.').trim();
      const kg = parseFloat(raw);
      const dateEl = active?.querySelector('#jasWeightDate') || document.getElementById('jasWeightDate');
      const date = dateEl?.value || toISO();
      const noteEl = active?.querySelector('#jasWeightNote') || document.getElementById('jasWeightNote');
      const note = (noteEl?.value||'').trim();
      if(isNaN(kg)||kg<0.5||kg>25){
        toast('Inserisci un peso valido (0.5 - 25 kg)','warn');
        return;
      }
      const ws = stData['jasper_weights']||{list:[]};
      ws.list = ws.list.filter(w=>w.date!==date);
      ws.list.push({kg,date,note});
      ws.list.sort((a,b)=>a.date.localeCompare(b.date));
      stData['jasper_weights'] = ws;
      localStorage.setItem('rico_st',JSON.stringify(stData));
      sbFetch('startup_data',{
        method:'POST',
        prefer:'resolution=merge-duplicates,return=minimal',
        body:JSON.stringify({id:'jasper_weights',data:ws})
      }).catch(e => console.warn('jasper_weights sync failed:',e));
      toast('⚖ '+kg+'kg salvato ✓','success');
      renderJasperCrescita();
    } catch(e){ console.error('jasperLogWeight:',e); toast('Errore salvataggio peso','warn'); }
  }).catch(() => {});
}

async function jasperDeleteWeight(idx){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const ws = stData['jasper_weights']||{list:[]};
      // idx riferito alla lista SORTED ascending (come nella UI render)
      const sorted = [...ws.list].sort((a,b)=>a.date.localeCompare(b.date));
      if(idx < 0 || idx >= sorted.length) return;
      const toRemove = sorted[idx];
      // Rimuovi dal ws.list matchando per data (unica per giorno)
      ws.list = ws.list.filter(w => w.date !== toRemove.date);
      stData['jasper_weights'] = ws;
      localStorage.setItem('rico_st',JSON.stringify(stData));
      sbFetch('startup_data',{
        method:'POST',
        prefer:'resolution=merge-duplicates,return=minimal',
        body:JSON.stringify({id:'jasper_weights',data:ws})
      }).catch(e => console.warn('jasper_weights sync failed:',e));
      renderJasperCrescita();
      toast('Peso rimosso','info');
    } catch(e) { console.error('jasperDeleteWeight:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

/* ── Actions ── */
let _jasperOpQueue = Promise.resolve();

// Registra un pasto con ora custom (default: ora corrente)
async function jasperLogMealTime(){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const hhmm=readHHMMPicker('jasMealTime');
      if(!hhmm){toast('Seleziona un orario','warn');return;}
      const today=toISO();
      const entry=jasperDiary[today]||(await loadJasperDiary(today));
      if(!entry.meals)entry.meals=[];
      // Evita duplicati: se esiste gia un pasto nello stesso minuto non lo ri-aggiunge
      if(entry.meals.some(m => m.hhmm === hhmm)){toast('Pasto gia registrato a '+hhmm,'warn');return;}
      entry.meals.push({hhmm});
      entry.lastMeal=hhmm;
      jasperDiary[today]=entry;
      await saveJasperEntry(today,entry);
      renderJasper();
      toast('🍼 Pasto alle '+hhmm,'success');
    } catch(e) { console.error('jasperLogMealTime:', e); toast('Errore salvataggio pasto','warn'); }
  }).catch(() => {});
}

function jasperDeleteMeal(idx){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const today=toISO();
      const entry=jasperDiary[today]||(await loadJasperDiary(today));
      if(!entry.meals||idx<0)return;
      const sorted=entry.meals.slice().sort((a,b)=>(b.hhmm||'').localeCompare(a.hhmm||''));
      const toRemove=sorted[idx];
      if(!toRemove)return;
      entry.meals=entry.meals.filter(m=>m!==toRemove);
      if(entry.meals.length){
        const latest=entry.meals.slice().sort((a,b)=>(b.hhmm||'').localeCompare(a.hhmm||''))[0];
        entry.lastMeal=latest.hhmm;
      } else { entry.lastMeal=null; }
      jasperDiary[today]=entry;
      await saveJasperEntry(today,entry);
      renderJasper();
      toast('Pasto rimosso','info');
    } catch(e) { console.error('jasperDeleteMeal:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

/* ── Sleep tracking (pisolini) ── */
function jasperStartSleep(){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const today = toISO();
      const entry = jasperDiary[today] || (await loadJasperDiary(today));
      if(!entry.sleeps) entry.sleeps = [];
      // Evita doppio start se c'e gia un pisolino aperto
      if(entry.sleeps.some(s => s.start && !s.end)){
        toast('Jasper sta gia dormendo','warn');
        return;
      }
      const start = nowHHMMSwiss();
      entry.sleeps.push({start, end:null});
      jasperDiary[today] = entry;
      await saveJasperEntry(today, entry);
      renderJasper();
      toast('💤 Pisolino iniziato alle '+start, 'success');
    } catch(e) { console.error('jasperStartSleep:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperEndSleep(){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const today = toISO();
      let entry = jasperDiary[today] || (await loadJasperDiary(today));
      if(!entry.sleeps) entry.sleeps = [];
      let opening = entry.sleeps.find(s => s.start && !s.end);
      let targetDate = today;

      // Fallback cross-midnight: se oggi non ha opening, cercalo in ieri.
      // Pisolino iniziato a 23:50 dom + svegliato a 00:15 lun va chiuso
      // nell'entry di domenica (dove fu aperto), non lunedi.
      if(!opening){
        const yesterday = dateToISO(new Date(Date.now() - 86400000));
        const yEntry = stData[jasperDiaryKey(yesterday)] || (await loadJasperDiary(yesterday));
        if(yEntry && Array.isArray(yEntry.sleeps)){
          const yOpening = yEntry.sleeps.find(s => s.start && !s.end);
          if(yOpening){
            entry = yEntry;
            opening = yOpening;
            targetDate = yesterday;
          }
        }
      }

      if(!opening){ toast('Nessun pisolino in corso','warn'); return; }
      const end = nowHHMMSwiss();
      opening.end = end;
      if(targetDate === today){
        entry.woke_at = end;
        jasperDiary[today] = entry;
      }
      await saveJasperEntry(targetDate, entry);
      // Cross-midnight: salva woke_at anche nell'entry di oggi, così la UI
      // mostra "Sveglio da X" al mattino anche senza pisolini completati oggi.
      if(targetDate !== today){
        const todayEntry = jasperDiary[today] || (await loadJasperDiary(today));
        todayEntry.woke_at = end;
        jasperDiary[today] = todayEntry;
        await saveJasperEntry(today, todayEntry);
      }
      renderJasper();
      const duration = hhmmDiffMin(opening.start, end);
      toast('☀️ Ha dormito '+formatMin(duration), 'success');
    } catch(e) { console.error('jasperEndSleep:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperDeleteSleep(startHHMM, event){
  event?.stopPropagation();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const today = toISO();
      const entry = jasperDiary[today] || (await loadJasperDiary(today));
      if(!entry.sleeps) return;
      entry.sleeps = entry.sleeps.filter(s => s.start !== startHHMM);
      jasperDiary[today] = entry;
      await saveJasperEntry(today, entry);
      renderJasper();
      toast('Pisolino rimosso','info');
    } catch(e) { console.error('jasperDeleteSleep:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperShowManualSleepForm(){
  const active = jasperActive();
  const wrap = active?.querySelector('#jasManualSleepForm') || document.getElementById('jasManualSleepForm');
  if(!wrap) return;
  if(wrap.style.display === 'block'){
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  const now = nowHHMMSwiss();
  wrap.innerHTML = `<div class="jas-sleep-manual-form">
    <div class="jas-popup-edit-lbl">Aggiungi pisolino manualmente</div>
    <div class="jas-sleep-manual-row">
      <label>Inizio</label>
      ${hhmmPickerHTML('jasManualStart', now, {withNow:true})}
    </div>
    <div class="jas-sleep-manual-row">
      <label>Fine</label>
      ${hhmmPickerHTML('jasManualEnd', '', {withNow:true, allowEmpty:true})}
    </div>
    <div style="font-size:11px;color:#8a7ca0;margin-bottom:10px;font-style:italic">Lascia vuota la fine se il pisolino e in corso</div>
    <div class="jas-popup-edit-btns">
      <button class="jas-popup-edit-save" onclick="jasperAddSleepManual()" type="button">✓ Salva</button>
      <button class="jas-popup-edit-cancel" onclick="jasperShowManualSleepForm()" type="button">✗ Annulla</button>
    </div>
  </div>`;
  wrap.style.display = 'block';
}

function jasperAddSleepManual(){
  const start = readHHMMPicker('jasManualStart');
  const end = readHHMMPicker('jasManualEnd'); // null = in corso
  if(!start){ toast('Inserisci almeno l\'ora di inizio','warn'); return; }
  if(end && start === end){ toast('Inizio e fine coincidono','warn'); return; }
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const today = toISO();
      const entry = jasperDiary[today] || (await loadJasperDiary(today));
      if(!entry.sleeps) entry.sleeps = [];
      // Se si sta aggiungendo un in-corso, verifica che non ce ne sia gia uno aperto
      if(!end && entry.sleeps.some(s => s.start && !s.end)){
        toast('C\'e gia un pisolino in corso','warn');
        return;
      }
      // Evita duplicato esatto sullo stesso start
      if(entry.sleeps.some(s => s.start === start)){
        toast('Pisolino gia presente con questo inizio','warn');
        return;
      }
      entry.sleeps.push({start, end: end || null});
      jasperDiary[today] = entry;
      await saveJasperEntry(today, entry);
      renderJasper();
      if(end){
        const duration = hhmmDiffMin(start, end);
        toast('💤 Pisolino aggiunto · '+formatMin(duration), 'success');
      } else {
        toast('💤 Pisolino in corso dalle '+start, 'success');
      }
    } catch(e) { console.error('jasperAddSleepManual:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

/* ── Popup storico giorno (con edit/delete inline) ── */
let _popupEditingState = null; // {type: 'meal'|'note'|'milestone'|'weight', iso, data}

function openJasperDayPopup(iso){
  const entry=stData[jasperDiaryKey(iso)]||{};
  const meals=(entry.meals||[]).slice().sort((a,b)=>(a.hhmm||'').localeCompare(b.hhmm||''));
  const notes=entry.notes||[];
  const cms=jasperCustomMilestones();
  const dayMilestones=cms.list.filter(m=>m.date===iso);
  const ws=(stData['jasper_weights']||{list:[]}).list;
  const dayWeights=ws.filter(w=>w.date===iso);
  const dlbl=new Date(iso+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  let content='';

  // ── Pasti ──
  content+=`<div class="jas-popup-section">
    <div class="jas-popup-sec-lbl">🍼 Pasti (${meals.length})</div>
    ${meals.length
      ? meals.map(m=>`<div class="jas-popup-item-row">
          <div class="jas-popup-meal">🍼 ${esc(m.hhmm||'?')}</div>
          <button class="jas-popup-item-btn edit" onclick="jasperEditMealFromDay('${iso}','${esc(m.hhmm||'')}',event)" title="Modifica">✎</button>
          <button class="jas-popup-item-btn del" onclick="jasperDeleteMealFromDay('${iso}','${esc(m.hhmm||'')}',event)" title="Rimuovi">×</button>
        </div>`).join('')
      : '<div class="jas-popup-empty">Nessun pasto registrato</div>'}
  </div>`;

  // ── Note ──
  content+=`<div class="jas-popup-section">
    <div class="jas-popup-sec-lbl">📝 Note (${notes.length})</div>
    ${notes.length
      ? notes.map((n,i)=>`<div class="jas-popup-item-row">
          <div class="jas-popup-note"><span class="jas-popup-note-ts">${esc(n.ts||'')}</span>${esc(n.text||'')}</div>
          <button class="jas-popup-item-btn edit" onclick="jasperEditNoteFromDay('${iso}',${i},event)" title="Modifica">✎</button>
          <button class="jas-popup-item-btn del" onclick="jasperDeleteNoteFromDay('${iso}',${i},event)" title="Rimuovi">×</button>
        </div>`).join('')
      : '<div class="jas-popup-empty">Nessuna nota</div>'}
  </div>`;

  // ── Pisolini ──
  const sleepsDayList = (entry.sleeps||[]).filter(s=>s.start).slice().sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  content+=`<div class="jas-popup-section">
    <div class="jas-popup-sec-lbl">💤 Pisolini (${sleepsDayList.length})</div>
    ${sleepsDayList.length
      ? sleepsDayList.map(s=>`<div class="jas-popup-item-row">
          <div class="jas-popup-sleep">💤 ${esc(s.start)} → ${s.end?esc(s.end)+' · '+formatMin(hhmmDiffMin(s.start,s.end)):'<em>in corso</em>'}</div>
          <button class="jas-popup-item-btn edit" onclick="jasperEditSleepFromDay('${iso}','${esc(s.start)}',event)" title="Modifica">✎</button>
          <button class="jas-popup-item-btn del" onclick="jasperDeleteSleepFromDay('${iso}','${esc(s.start)}',event)" title="Rimuovi">×</button>
        </div>`).join('')
      : '<div class="jas-popup-empty">Nessun pisolino registrato</div>'}
  </div>`;

  // ── Milestones ──
  content+=`<div class="jas-popup-section">
    <div class="jas-popup-sec-lbl">✦ Milestone (${dayMilestones.length})</div>
    ${dayMilestones.length
      ? dayMilestones.map((m,i)=>`<div class="jas-popup-item-row">
          <div class="jas-popup-milestone">${esc(m.text)}</div>
          <button class="jas-popup-item-btn edit" onclick="jasperEditMilestoneFromDay('${iso}',${i},event)" title="Modifica">✎</button>
          <button class="jas-popup-item-btn del" onclick="jasperDeleteMilestoneFromDay('${iso}',${i},event)" title="Rimuovi">×</button>
        </div>`).join('')
      : '<div class="jas-popup-empty">Nessuna milestone questo giorno</div>'}
  </div>`;

  // ── Pesi ──
  content+=`<div class="jas-popup-section">
    <div class="jas-popup-sec-lbl">⚖ Peso</div>
    ${dayWeights.length
      ? dayWeights.map(w=>`<div class="jas-popup-item-row">
          <div class="jas-popup-weight">${w.kg} kg${w.note?' · '+esc(w.note):''}</div>
          <button class="jas-popup-item-btn edit" onclick="jasperEditWeightFromDay('${iso}','${esc(w.date||'')}',event)" title="Modifica">✎</button>
          <button class="jas-popup-item-btn del" onclick="jasperDeleteWeightFromDay('${iso}','${esc(w.date||'')}',event)" title="Rimuovi">×</button>
        </div>`).join('')
      : '<div class="jas-popup-empty">Nessun peso registrato</div>'}
  </div>`;

  // ── Edit form (se in editing mode per questo iso) ──
  if(_popupEditingState && _popupEditingState.iso === iso){
    content += renderPopupEditForm(iso, _popupEditingState);
  }

  const title=document.getElementById('jasDayPopupTitle');
  const body=document.getElementById('jasDayPopupContent');
  if(title) title.textContent=dlbl;
  if(body) body.innerHTML=content;
  const overlay=document.getElementById('jasperDayPopup');
  if(overlay) overlay.classList.add('open');
  // Focus sul campo edit se presente. Per meal/sleep gli id sono diversi
  // (popupEditMealH / popupEditSleepStartH), gli altri usano popupEditFocus.
  if(_popupEditingState && _popupEditingState.iso === iso){
    setTimeout(()=>{
      const t = _popupEditingState?.type;
      const focusId = t === 'meal' ? 'popupEditMealH'
                    : t === 'sleep' ? 'popupEditSleepStartH'
                    : 'popupEditFocus';
      const focusEl = document.getElementById(focusId);
      if(focusEl) focusEl.focus();
    }, 80);
  }
}

function closeJasperDayPopup(){
  _popupEditingState = null;
  const overlay=document.getElementById('jasperDayPopup');
  if(overlay) overlay.classList.remove('open');
}

/* ── Popup edit form renderer ── */
function renderPopupEditForm(iso, state){
  if(!state) return '';
  const {type, data} = state;
  let body = '';
  if(type === 'meal'){
    body = `
      <div class="jas-popup-edit-lbl">Modifica ora pasto</div>
      ${hhmmPickerHTML('popupEditMeal', data.hhmm||'', {withNow:true})}
      <div class="jas-popup-edit-btns">
        <button class="jas-popup-edit-save" onclick="jasperSaveMealEdit('${iso}','${esc(data.hhmm||'')}',event)" type="button">✓ Salva</button>
        <button class="jas-popup-edit-cancel" onclick="jasperCancelPopupEdit('${iso}',event)" type="button">✗ Annulla</button>
      </div>`;
  } else if(type === 'note'){
    body = `
      <div class="jas-popup-edit-lbl">Modifica nota</div>
      <textarea id="popupEditFocus" class="jas-popup-edit-inp" rows="3">${esc(data.text||'')}</textarea>
      <div class="jas-popup-edit-btns">
        <button class="jas-popup-edit-save" onclick="jasperSaveNoteEdit('${iso}',event)" type="button">✓ Salva</button>
        <button class="jas-popup-edit-cancel" onclick="jasperCancelPopupEdit('${iso}',event)" type="button">✗ Annulla</button>
      </div>`;
  } else if(type === 'milestone'){
    body = `
      <div class="jas-popup-edit-lbl">Modifica milestone</div>
      <input type="text" id="popupEditFocus" class="jas-popup-edit-inp" value="${esc(data.text||'')}" maxlength="60">
      <input type="date" id="popupEditMsDate" class="jas-popup-edit-inp" value="${esc(data.date||iso)}" style="margin-top:8px">
      <div class="jas-popup-edit-btns">
        <button class="jas-popup-edit-save" onclick="jasperSaveMilestoneEdit('${iso}',${data.globalIdx},event)" type="button">✓ Salva</button>
        <button class="jas-popup-edit-cancel" onclick="jasperCancelPopupEdit('${iso}',event)" type="button">✗ Annulla</button>
      </div>`;
  } else if(type === 'weight'){
    body = `
      <div class="jas-popup-edit-lbl">Modifica peso</div>
      <input type="text" id="popupEditFocus" class="jas-popup-edit-inp" inputmode="decimal" value="${esc(String(data.kg||''))}" placeholder="es. 7.25">
      <input type="text" id="popupEditWNote" class="jas-popup-edit-inp" value="${esc(data.note||'')}" placeholder="nota opzionale" style="margin-top:8px">
      <div class="jas-popup-edit-btns">
        <button class="jas-popup-edit-save" onclick="jasperSaveWeightEdit('${iso}','${esc(data.date||'')}',event)" type="button">✓ Salva</button>
        <button class="jas-popup-edit-cancel" onclick="jasperCancelPopupEdit('${iso}',event)" type="button">✗ Annulla</button>
      </div>`;
  } else if(type === 'sleep'){
    body = `
      <div class="jas-popup-edit-lbl">Modifica pisolino</div>
      <div class="jas-sleep-manual-row">
        <label>Inizio</label>
        ${hhmmPickerHTML('popupEditSleepStart', data.start||'', {withNow:true})}
      </div>
      <div class="jas-sleep-manual-row">
        <label>Fine</label>
        ${hhmmPickerHTML('popupEditSleepEnd', data.end||'', {withNow:true, allowEmpty:true})}
      </div>
      <div style="font-size:11px;color:#8a7ca0;margin-bottom:10px;font-style:italic">Lascia vuota la fine se il pisolino e in corso</div>
      <div class="jas-popup-edit-btns">
        <button class="jas-popup-edit-save" onclick="jasperSaveSleepEdit('${iso}','${esc(data.originalStart||'')}',event)" type="button">✓ Salva</button>
        <button class="jas-popup-edit-cancel" onclick="jasperCancelPopupEdit('${iso}',event)" type="button">✗ Annulla</button>
      </div>`;
  }
  return `<div class="jas-popup-edit-form">${body}</div>`;
}

/* ── Popup: delete functions (in queue per evitare race) ── */
function jasperDeleteMealFromDay(iso, hhmm, event){
  event?.stopPropagation();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const entry = (stData[jasperDiaryKey(iso)] ? JSON.parse(JSON.stringify(stData[jasperDiaryKey(iso)])) : await loadJasperDiary(iso));
      if(!entry.meals) return;
      const idx = entry.meals.findIndex(m => m.hhmm === hhmm);
      if(idx < 0) return;
      entry.meals.splice(idx, 1);
      if(entry.meals.length){
        const latest = entry.meals.slice().sort((a,b) => (b.hhmm||'').localeCompare(a.hhmm||''))[0];
        entry.lastMeal = latest.hhmm;
      } else { entry.lastMeal = null; }
      await saveJasperEntry(iso, entry);
      if(iso === toISO()) jasperDiary[iso] = entry;
      openJasperDayPopup(iso);
      toast('Pasto rimosso','info');
    } catch(e) { console.error('jasperDeleteMealFromDay:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperDeleteNoteFromDay(iso, idx, event){
  event?.stopPropagation();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const entry = (stData[jasperDiaryKey(iso)] ? JSON.parse(JSON.stringify(stData[jasperDiaryKey(iso)])) : await loadJasperDiary(iso));
      if(!entry.notes || idx < 0 || idx >= entry.notes.length) return;
      entry.notes.splice(idx, 1);
      await saveJasperEntry(iso, entry);
      if(iso === toISO()) jasperDiary[iso] = entry;
      openJasperDayPopup(iso);
      toast('Nota rimossa','info');
    } catch(e) { console.error('jasperDeleteNoteFromDay:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperDeleteMilestoneFromDay(iso, idx, event){
  event?.stopPropagation();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const cms = jasperCustomMilestones();
      const dayMs = cms.list.filter(m => m.date === iso);
      if(idx < 0 || idx >= dayMs.length) return;
      const toRemove = dayMs[idx];
      cms.list = cms.list.filter(m => !(m.date === iso && m.text === toRemove.text));
      stData['jasper_milestones'] = cms;
      localStorage.setItem('rico_st', JSON.stringify(stData));
      sbFetch('startup_data', {
        method:'POST', prefer:'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({id:'jasper_milestones', data:cms})
      }).catch(e => console.warn('jasper_milestones sync failed:', e));
      openJasperDayPopup(iso);
      toast('Milestone rimossa','info');
    } catch(e) { console.error('jasperDeleteMilestoneFromDay:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperDeleteWeightFromDay(iso, weightDate, event){
  event?.stopPropagation();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const ws = stData['jasper_weights']||{list:[]};
      ws.list = ws.list.filter(w => w.date !== weightDate);
      stData['jasper_weights'] = ws;
      localStorage.setItem('rico_st', JSON.stringify(stData));
      sbFetch('startup_data', {
        method:'POST', prefer:'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({id:'jasper_weights', data:ws})
      }).catch(e => console.warn('jasper_weights sync failed:', e));
      openJasperDayPopup(iso);
      toast('Peso rimosso','info');
    } catch(e) { console.error('jasperDeleteWeightFromDay:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperDeleteSleepFromDay(iso, startHHMM, event){
  event?.stopPropagation();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const entry = (stData[jasperDiaryKey(iso)] ? JSON.parse(JSON.stringify(stData[jasperDiaryKey(iso)])) : await loadJasperDiary(iso));
      if(!entry.sleeps) return;
      entry.sleeps = entry.sleeps.filter(s => s.start !== startHHMM);
      await saveJasperEntry(iso, entry);
      if(iso === toISO()) jasperDiary[iso] = entry;
      openJasperDayPopup(iso);
      toast('Pisolino rimosso','info');
    } catch(e) { console.error('jasperDeleteSleepFromDay:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

/* ── Popup: edit triggers ── */
function jasperEditMealFromDay(iso, hhmm, event){
  event?.stopPropagation();
  _popupEditingState = {type:'meal', iso, data:{hhmm}};
  openJasperDayPopup(iso);
}

function jasperEditNoteFromDay(iso, idx, event){
  event?.stopPropagation();
  const entry = stData[jasperDiaryKey(iso)];
  if(!entry || !entry.notes || idx < 0 || idx >= entry.notes.length) return;
  // Salva il testo originale + ts per identificare la nota anche se l'indice cambia
  const original = entry.notes[idx];
  _popupEditingState = {type:'note', iso, data:{originalText:original.text, originalTs:original.ts||'', text:original.text}};
  openJasperDayPopup(iso);
}

function jasperEditMilestoneFromDay(iso, idx, event){
  event?.stopPropagation();
  const cms = jasperCustomMilestones();
  const dayMs = cms.list.filter(m => m.date === iso);
  if(idx < 0 || idx >= dayMs.length) return;
  const toEdit = dayMs[idx];
  const globalIdx = cms.list.findIndex(m => m.date === iso && m.text === toEdit.text);
  _popupEditingState = {type:'milestone', iso, data:{text:toEdit.text, date:toEdit.date, globalIdx}};
  openJasperDayPopup(iso);
}

function jasperEditWeightFromDay(iso, weightDate, event){
  event?.stopPropagation();
  const ws = stData['jasper_weights']||{list:[]};
  const w = ws.list.find(x => x.date === weightDate);
  if(!w) return;
  _popupEditingState = {type:'weight', iso, data:{kg:w.kg, note:w.note||'', date:weightDate}};
  openJasperDayPopup(iso);
}

function jasperEditSleepFromDay(iso, startHHMM, event){
  event?.stopPropagation();
  const entry = stData[jasperDiaryKey(iso)];
  if(!entry || !entry.sleeps) return;
  const s = entry.sleeps.find(x => x.start === startHHMM);
  if(!s) return;
  _popupEditingState = {type:'sleep', iso, data:{originalStart:s.start, start:s.start, end:s.end||''}};
  openJasperDayPopup(iso);
}

function jasperCancelPopupEdit(iso, event){
  event?.stopPropagation();
  _popupEditingState = null;
  openJasperDayPopup(iso);
}

/* ── Popup: save edit functions (in queue per evitare race) ── */
function jasperSaveMealEdit(iso, oldHhmm, event){
  event?.stopPropagation();
  // Snapshot del nuovo valore PRIMA di entrare in queue (evita problemi se popup re-rendered)
  const newHhmm = readHHMMPicker('popupEditMeal');
  if(!newHhmm){ toast('Seleziona un orario','warn'); return; }
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const entry = (stData[jasperDiaryKey(iso)] ? JSON.parse(JSON.stringify(stData[jasperDiaryKey(iso)])) : await loadJasperDiary(iso));
      const mealIdx = entry.meals.findIndex(m => m.hhmm === oldHhmm);
      if(mealIdx < 0) return;
      if(entry.meals.some((m,i) => m.hhmm === newHhmm && i !== mealIdx)){
        toast('Pasto gia registrato a '+newHhmm,'warn');
        return;
      }
      entry.meals[mealIdx].hhmm = newHhmm;
      const latest = entry.meals.slice().sort((a,b) => (b.hhmm||'').localeCompare(a.hhmm||''))[0];
      entry.lastMeal = latest.hhmm;
      await saveJasperEntry(iso, entry);
      if(iso === toISO()) jasperDiary[iso] = entry;
      _popupEditingState = null;
      openJasperDayPopup(iso);
      toast('Pasto aggiornato ✓','success');
    } catch(e) { console.error('jasperSaveMealEdit:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperSaveNoteEdit(iso, event){
  event?.stopPropagation();
  const newText = document.getElementById('popupEditFocus')?.value.trim();
  if(!newText){ toast('Scrivi la nota','warn'); return; }
  const state = _popupEditingState;
  if(!state || state.type !== 'note') return;
  const {originalText, originalTs} = state.data;
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const entry = (stData[jasperDiaryKey(iso)] ? JSON.parse(JSON.stringify(stData[jasperDiaryKey(iso)])) : await loadJasperDiary(iso));
      if(!entry.notes || !entry.notes.length) return;
      const idx = entry.notes.findIndex(n => n.text === originalText && (n.ts||'') === (originalTs||''));
      if(idx < 0){ toast('Nota non trovata','warn'); return; }
      entry.notes[idx].text = newText;
      await saveJasperEntry(iso, entry);
      if(iso === toISO()) jasperDiary[iso] = entry;
      _popupEditingState = null;
      openJasperDayPopup(iso);
      toast('Nota aggiornata ✓','success');
    } catch(e) { console.error('jasperSaveNoteEdit:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperSaveMilestoneEdit(iso, globalIdx, event){
  event?.stopPropagation();
  const newText = document.getElementById('popupEditFocus')?.value.trim();
  const newDate = document.getElementById('popupEditMsDate')?.value;
  if(!newText){ toast('Scrivi la milestone','warn'); return; }
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const cms = jasperCustomMilestones();
      if(globalIdx < 0 || globalIdx >= cms.list.length) return;
      const date = newDate || iso;
      cms.list[globalIdx] = {
        text: newText,
        date,
        label: new Date(date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'})
      };
      stData['jasper_milestones'] = cms;
      localStorage.setItem('rico_st', JSON.stringify(stData));
      sbFetch('startup_data', {
        method:'POST', prefer:'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({id:'jasper_milestones', data:cms})
      }).catch(e => console.warn('jasper_milestones sync failed:', e));
      _popupEditingState = null;
      openJasperDayPopup(date); // riapri sulla nuova data se cambiata
      toast('Milestone aggiornata ✓','success');
    } catch(e) { console.error('jasperSaveMilestoneEdit:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperSaveWeightEdit(iso, oldDate, event){
  event?.stopPropagation();
  const raw = (document.getElementById('popupEditFocus')?.value||'').replace(',','.').trim();
  const newKg = parseFloat(raw);
  const newNote = (document.getElementById('popupEditWNote')?.value||'').trim();
  if(isNaN(newKg) || newKg < 0.5 || newKg > 25){
    toast('Inserisci un peso valido (0.5 - 25 kg)','warn');
    return;
  }
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const ws = stData['jasper_weights']||{list:[]};
      const idx = ws.list.findIndex(w => w.date === oldDate);
      if(idx < 0) return;
      ws.list[idx] = {kg:newKg, date:oldDate, note:newNote};
      ws.list.sort((a,b) => a.date.localeCompare(b.date));
      stData['jasper_weights'] = ws;
      localStorage.setItem('rico_st', JSON.stringify(stData));
      sbFetch('startup_data', {
        method:'POST', prefer:'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({id:'jasper_weights', data:ws})
      }).catch(e => console.warn('jasper_weights sync failed:', e));
      _popupEditingState = null;
      openJasperDayPopup(iso);
      toast('Peso aggiornato ✓','success');
    } catch(e) { console.error('jasperSaveWeightEdit:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperSaveSleepEdit(iso, originalStart, event){
  event?.stopPropagation();
  const newStart = readHHMMPicker('popupEditSleepStart');
  const newEnd = readHHMMPicker('popupEditSleepEnd');
  if(!newStart){ toast('Inserisci almeno l\'ora di inizio','warn'); return; }
  if(newEnd && newStart === newEnd){ toast('Inizio e fine coincidono','warn'); return; }
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const entry = (stData[jasperDiaryKey(iso)] ? JSON.parse(JSON.stringify(stData[jasperDiaryKey(iso)])) : await loadJasperDiary(iso));
      if(!entry.sleeps) entry.sleeps = [];
      const idx = entry.sleeps.findIndex(s => s.start === originalStart);
      if(idx < 0){ toast('Pisolino non trovato','warn'); return; }
      // Evita collisione con altro pisolino che ha gia quell'inizio
      if(newStart !== originalStart && entry.sleeps.some((s,i) => i !== idx && s.start === newStart)){
        toast('Esiste gia un pisolino a '+newStart,'warn');
        return;
      }
      entry.sleeps[idx] = {start:newStart, end:newEnd || null};
      await saveJasperEntry(iso, entry);
      if(iso === toISO()) jasperDiary[iso] = entry;
      _popupEditingState = null;
      openJasperDayPopup(iso);
      toast('Pisolino aggiornato ✓','success');
    } catch(e) { console.error('jasperSaveSleepEdit:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperCustomMilestones(){
  const data = stData['jasper_milestones'] || {list:[]};
  if (!Array.isArray(data.list)) data.list = [];
  return data;
}

async function jasperAddMilestone(){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const active = jasperActive();
      const inp = active?.querySelector('#jasMsInp') || document.getElementById('jasMsInp');
      const dateInp = active?.querySelector('#jasMsDate') || document.getElementById('jasMsDate');
      if(!inp||!inp.value.trim()){toast('Scrivi la milestone','warn');return;}
      const ms = jasperCustomMilestones();
      const date = (dateInp?.value)||toISO();
      const label = new Date(date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
      ms.list.unshift({text:inp.value.trim(),date,label});
      if(ms.list.length>50) ms.list = ms.list.slice(0,50);
      stData['jasper_milestones'] = ms;
      localStorage.setItem('rico_st',JSON.stringify(stData));
      sbFetch('startup_data',{
        method:'POST',
        prefer:'resolution=merge-duplicates,return=minimal',
        body:JSON.stringify({id:'jasper_milestones',data:ms})
      }).catch(e=>console.warn('milestone sync:',e));
      inp.value='';
      renderJasperCrescita();
      toast('✦ Milestone salvata!','success');
    } catch(e) { console.error('jasperAddMilestone:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperDeleteMilestone(idx){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const ms=jasperCustomMilestones();
      if(idx<0||idx>=ms.list.length)return;
      ms.list.splice(idx,1);
      stData['jasper_milestones']=ms;
      localStorage.setItem('rico_st',JSON.stringify(stData));
      sbFetch('startup_data',{
        method:'POST',
        prefer:'resolution=merge-duplicates,return=minimal',
        body:JSON.stringify({id:'jasper_milestones',data:ms})
      }).catch(e=>console.warn('milestone sync:',e));
      renderJasperCrescita();
      toast('Milestone rimossa','info');
    } catch(e){ console.error('jasperDeleteMilestone:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperSaveNote(){
  // Snapshot del valore PRIMA di entrare in queue
  const active = jasperActive();
  const inp = active?.querySelector('#jasNoteInp') || document.getElementById('jasNoteInp');
  if(!inp||!inp.value.trim()){toast('Scrivi una nota','warn');return;}
  const noteText = inp.value.trim();
  inp.value = '';
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const today=toISO();
      const entry=jasperDiary[today]||(await loadJasperDiary(today));
      if(!entry.notes) entry.notes=[];
      const ts=new Date().toLocaleString('it-IT',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'});
      entry.notes.push({text:noteText,ts});
      jasperDiary[today]=entry;
      await saveJasperEntry(today,entry);
      renderJasper();
      toast('Nota salvata ✓','success');
    } catch(e) { console.error('jasperSaveNote:', e); toast('Errore salvataggio nota','warn'); }
  }).catch(() => {});
}

function jasperDeleteNote(idx, _ignore){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const today=toISO();
      const entry=jasperDiary[today]||(await loadJasperDiary(today));
      if(!entry.notes||idx<0||idx>=entry.notes.length)return;
      entry.notes.splice(idx,1);
      jasperDiary[today]=entry;
      await saveJasperEntry(today,entry);
      renderJasper();
    } catch(e){ console.error('jasperDeleteNote:',e); }
  }).catch(() => {});
}



