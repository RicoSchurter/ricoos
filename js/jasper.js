/* ═══ COSTANTI JASPER ═══ */

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
  if (tab !== 'oggi' && tab !== 'storico' && tab !== 'crescita') tab = 'oggi';
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
    <input type="number" min="0" max="23" step="1" inputmode="numeric" class="jas-hhmm-inp" id="${idPrefix}H" value="${hh}"${placeholder} oninput="this.dataset.touched='1'">
    <span class="jas-hhmm-sep">:</span>
    <input type="number" min="0" max="59" step="1" inputmode="numeric" class="jas-hhmm-inp" id="${idPrefix}M" value="${mm}"${placeholder} oninput="this.dataset.touched='1'">
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
  if(hEl){ hEl.value = String(parseInt(h,10)).padStart(2,'0'); hEl.dataset.touched = '1'; }
  if(mEl){ mEl.value = String(parseInt(m,10)).padStart(2,'0'); mEl.dataset.touched = '1'; }
}

/* ── Salvataggio sicuro di un giorno del diario ──
   Rilegge la versione aggiornata dal server (stMutate) e applica la modifica su quella:
   niente più sovrascritture partendo da dati vecchi o vuoti.
   fn riceve l'entry del giorno e ritorna false per annullare. */
function _jasNormEntry(e){
  if(!e || typeof e !== 'object') e = {};
  if(!Array.isArray(e.sleeps)) e.sleeps = [];
  if(!Array.isArray(e.meals)) e.meals = [];
  if(!Array.isArray(e.notes)) e.notes = [];
  if(!('lastMeal' in e)) e.lastMeal = null;
  return e;
}
async function jasperMutateDay(date, fn){
  const key = jasperDiaryKey(date);
  // Appena la modifica è salvata sul telefono, lo schermo si aggiorna (anche con rete lenta)
  const onLocal = v => {
    jasperDiary[date] = _jasNormEntry(JSON.parse(JSON.stringify(v)));
    if (currentView === 'jasper' && !_jasperRendering) renderJasper();
  };
  const val = await stMutate(key, e => fn(_jasNormEntry(e)), () => ({notes:[],meals:[],sleeps:[],lastMeal:null}), onLocal);
  if (stData[key]) jasperDiary[date] = _jasNormEntry(JSON.parse(JSON.stringify(stData[key])));
  return val;
}

/* ── Tempo assoluto dei sonni (anche a cavallo della mezzanotte) ── */
const _HHMM_RE = /^\d{2}:\d{2}$/;
function jasAbs(iso, hhmm){
  const [y,m,d] = iso.split('-').map(Number);
  const [h,mi] = (hhmm || '00:00').split(':').map(Number);
  return new Date(y, m-1, d, h, mi, 0, 0);
}
function jasHHMM(dt){ return String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0'); }
function _fmtDur(min){ return min < 1 ? '0 min' : formatMin(Math.round(min)); }
function _median(a){
  if(!a.length) return null;
  const s = [...a].sort((x,y) => x-y), m = Math.floor(s.length/2);
  return s.length % 2 ? s[m] : Math.round((s[m-1] + s[m]) / 2);
}
/* Notte = sonno che passa la mezzanotte o dura almeno 4 ore.
   Sonno in corso: notte se è iniziato dopo le 18:00 o prima delle 05:00. */
function jasIsNight(x){
  if (x.en) return dateToISO(x.en) !== dateToISO(x.st) || (x.en - x.st) / 60000 >= 240;
  const h = x.st.getHours();
  return h >= 18 || h < 5;
}
/* Tutti i sonni registrati tra due date, come intervalli con inizio/fine reali, ordinati */
function jasperIntervals(fromISO, toISO){
  const out = [];
  const d = new Date(fromISO + 'T12:00:00');
  const end = new Date(toISO + 'T12:00:00');
  while (d <= end) {
    const iso = dateToISO(d);
    const e = stData[jasperDiaryKey(iso)];
    ((e && Array.isArray(e.sleeps)) ? e.sleeps : []).forEach(s => {
      if (!s || !_HHMM_RE.test(s.start || '')) return;
      const st = jasAbs(iso, s.start);
      let en = null;
      if (s.end && _HHMM_RE.test(s.end)) {
        en = jasAbs(iso, s.end);
        if (en <= st) en = new Date(en.getTime() + 86400000);
      }
      out.push({day: iso, start: s.start, end: en ? s.end : null, st, en});
    });
    d.setDate(d.getDate() + 1);
  }
  out.sort((a, b) => a.st - b.st);
  out.forEach(x => { x.night = jasIsNight(x); });
  return out;
}
/* Veglia tipica (mediana ultimi 14 giorni): dal risveglio al 1° pisolino e dopo un pisolino */
function jasperWakeStats(){
  const iv = jasperIntervals(dateToISO(new Date(Date.now() - 15*86400000)), toISO()).filter(x => x.en);
  const morning = [], other = [];
  for (let i = 1; i < iv.length; i++) {
    const g = (iv[i].st - iv[i-1].en) / 60000;
    if (g <= 10 || g >= 8*60) continue; // oltre 8h = dati mancanti, non veglia
    if (iv[i-1].night) { if (!iv[i].night) morning.push(g); }
    else other.push(g);
  }
  return {
    morning: morning.length >= 5 ? _median(morning) : null,
    other:   other.length   >= 5 ? _median(other)   : null
  };
}
/* Intervallo tipico tra due pasti (mediana ultimi 7 giorni, esclusi i buchi della notte) */
function jasperMealStats(){
  const pts = [];
  for (let i = 7; i >= 0; i--) {
    const iso = dateToISO(new Date(Date.now() - i*86400000));
    const e = stData[jasperDiaryKey(iso)];
    ((e && e.meals) || []).forEach(m => { if (m && _HHMM_RE.test(m.hhmm || '')) pts.push(jasAbs(iso, m.hhmm)); });
  }
  pts.sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < pts.length; i++) {
    const g = (pts[i] - pts[i-1]) / 60000;
    if (g >= 30 && g <= 8*60) gaps.push(g);
  }
  return gaps.length >= 5 ? _median(gaps) : null;
}
function jasperAgeLabel(months, days){
  const dd = days > 0 ? days + ' giorn' + (days === 1 ? 'o' : 'i') : '';
  if (months < 12) {
    const mm = months + ' mes' + (months === 1 ? 'e' : 'i');
    return dd ? mm + ' e ' + dd : mm;
  }
  const y = Math.floor(months / 12), m = months % 12;
  const parts = [y + (y === 1 ? ' anno' : ' anni')];
  if (m) parts.push(m + ' mes' + (m === 1 ? 'e' : 'i'));
  if (dd) parts.push(dd);
  return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1];
}
/* Riepilogo di un giorno: notte finita quel mattino, pisolini, pasti */
function jasperDaySummary(iso){
  const prev = dateToISO(new Date(new Date(iso + 'T12:00:00').getTime() - 86400000));
  const iv = jasperIntervals(prev, iso);
  const night = iv.find(x => x.night && x.en && dateToISO(x.en) === iso) || null;
  const naps = iv.filter(x => x.day === iso && !x.night && x.en);
  const napMin = naps.reduce((s, x) => s + (x.en - x.st) / 60000, 0);
  const e = stData[jasperDiaryKey(iso)] || {};
  return {night, naps, napMin: Math.round(napMin), meals: (e.meals || []).length};
}
function jasperDaySummaryText(iso){
  const s = jasperDaySummary(iso);
  const n = s.night ? `Notte ${_fmtDur((s.night.en - s.night.st) / 60000)} (${s.night.start}→${s.night.end})` : 'Notte non registrata';
  return `${n} · ${s.naps.length} pisolin${s.naps.length === 1 ? 'o' : 'i'} (${_fmtDur(s.napMin)}) · ${s.meals} past${s.meals === 1 ? 'o' : 'i'}`;
}

/* ── Aggiornamento senza cancellare quello che Anissa sta scrivendo ── */
function jasperUserBusy(){
  const host = jasperActive();
  if (!host) return false;
  const ae = document.activeElement;
  if (ae && host.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return true;
  const note = host.querySelector('#jasNoteInp');
  if (note && note.value.trim()) return true;
  const form = host.querySelector('#jasManualSleepForm');
  if (form && form.style.display === 'block') return true;
  if (host.querySelector('.jas-hhmm-inp[data-touched="1"]')) return true;
  const pop = document.getElementById('jasperDayPopup');
  if (pop && pop.classList.contains('open')) return true;
  return false;
}
function jasperSoftRefresh(){
  if (currentView !== 'jasper') return;
  if (jasperUserBusy()) return;
  renderJasper();
}

/* ── Grafici SVG (nessuna libreria esterna) ── */
function jasSvgBars(vals, labels, opts){
  const W = 320, H = 120, padB = 16, padT = 14;
  const n = vals.length;
  const gap = n > 40 ? 1 : n > 14 ? 2 : 4;
  const valid = vals.filter(v => v != null);
  const max = Math.max(opts.min || 1, ...(valid.length ? valid : [0]));
  const bw = (W - gap * (n - 1)) / n;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || '')}">`;
  vals.forEach((v, i) => {
    const x = i * (bw + gap);
    if (v == null) { s += `<rect x="${x.toFixed(1)}" y="${H - padB - 2}" width="${bw.toFixed(1)}" height="2" fill="#2a2010"/>`; return; }
    const h = Math.max(2, (v / max) * (H - padB - padT));
    const y = H - padB - h;
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${opts.color}"/>`;
    if (n <= 14) s += `<text x="${(x + bw/2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="9" text-anchor="middle" fill="#c9a860">${opts.fmt(v)}</text>`;
  });
  labels.forEach((l, i) => {
    if (!l) return;
    const x = i * (bw + gap) + bw / 2;
    s += `<text x="${x.toFixed(1)}" y="${H - 3}" font-size="9" text-anchor="middle" fill="#8a7050">${esc(l)}</text>`;
  });
  return s + '</svg>';
}
function jasSvgWeight(list){
  const pts = list.filter(w => w && isValidDate(w.date) && typeof w.kg === 'number').sort((a,b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return '';
  const W = 320, H = 150, pl = 30, pr = 10, pt = 14, pb = 22;
  const t0 = new Date(pts[0].date + 'T12:00:00').getTime();
  const t1 = new Date(pts[pts.length-1].date + 'T12:00:00').getTime();
  const kmin = Math.min(...pts.map(p => p.kg)) - 0.2, kmax = Math.max(...pts.map(p => p.kg)) + 0.2;
  const X = t => pl + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (W - pl - pr);
  const Y = k => pt + (1 - (k - kmin) / (kmax - kmin)) * (H - pt - pb);
  const xy = pts.map(p => [X(new Date(p.date + 'T12:00:00').getTime()), Y(p.kg)]);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva del peso">`;
  [kmin + 0.2, (kmin + kmax) / 2, kmax - 0.2].forEach(k => {
    s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(k).toFixed(1)}" y2="${Y(k).toFixed(1)}" stroke="#2a2010" stroke-width="1"/>`;
    s += `<text x="${pl - 4}" y="${(Y(k) + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="#8a7050">${k.toFixed(1)}</text>`;
  });
  s += `<polyline fill="none" stroke="#d4a843" stroke-width="2" points="${xy.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
  xy.forEach(p => { s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#f0c860"/>`; });
  const lbl = d => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', {day:'numeric', month:'short', year:'2-digit'});
  s += `<text x="${pl}" y="${H - 5}" font-size="9" fill="#8a7050">${esc(lbl(pts[0].date))}</text>`;
  s += `<text x="${W - pr}" y="${H - 5}" font-size="9" text-anchor="end" fill="#8a7050">${esc(lbl(pts[pts.length-1].date))}</text>`;
  const last = xy[xy.length - 1];
  s += `<text x="${(last[0] - 4).toFixed(1)}" y="${(last[1] - 7).toFixed(1)}" font-size="10" text-anchor="end" fill="#f0c860">${pts[pts.length-1].kg} kg</text>`;
  return s + '</svg>';
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
  // Conserva la nota che si sta scrivendo (il ridisegno non la cancella mai)
  const _noteDraft = (jasperActive()?.querySelector('#jasNoteInp')?.value) || '';

  const{months,days,totalD}=jasperAgeDetails();
  const today=toISO();
  const yISO=dateToISO(new Date(Date.now()-86400000));
  const nowD=new Date();
  const entry=await loadJasperDiary(today);
  jasperDiary[today]=entry;

  const phrase=JASPER_PHRASES[Math.floor(totalD/7)%JASPER_PHRASES.length];
  const ageEmoji=months<3?'👶':months<6?'🍼':months<9?'🧸':months<12?'🐣':'👦';
  const ageStr=jasperAgeLabel(months,days);

  // Pasti di oggi (ordinati per ora, piu recente in cima)
  const meals=(entry.meals||[]).slice().sort((a,b)=>(b.hhmm||'').localeCompare(a.hhmm||''));
  const mealsListHtml=meals.length
    ? meals.map((m,i)=>{
        const note = esc(m.note||'');
        return `<div class="jas-meal-row" onclick="jasperEditMealNote(${i})" title="Tocca per modificare">
          <div class="jas-meal-info">
            <span class="jas-meal-time">🍼 ${esc(m.hhmm||'?')}</span>
            ${note ? `<span class="jas-meal-note">${note}</span>` : `<span class="jas-meal-note-empty">+ nota</span>`}
          </div>
          <button class="jas-meal-del" onclick="event.stopPropagation();jasperDeleteMeal(${i})" title="Rimuovi">×</button>
        </div>`;
      }).join('')
    : '<div class="jas-meal-empty">Nessun pasto registrato oggi</div>';

  // Ultimo pasto: se oggi non ha ancora mangiato, guarda ieri sera
  let lastMealTime=null, lastMealAt=null, lastMealYesterday=false;
  if(meals.length && _HHMM_RE.test(meals[0].hhmm||'')){
    lastMealTime=meals[0].hhmm; lastMealAt=jasAbs(today,lastMealTime);
  } else {
    const ye=stData[jasperDiaryKey(yISO)];
    const ym=((ye&&ye.meals)||[]).map(m=>m&&m.hhmm).filter(h=>_HHMM_RE.test(h||'')).sort().pop();
    if(ym){ lastMealTime=ym; lastMealAt=jasAbs(yISO,ym); lastMealYesterday=true; }
  }
  const agoTxt=dt=>{ const mn=Math.max(0,Math.floor((nowD-dt)/60000)); return mn<1?'adesso':formatMin(mn)+' fa'; };
  const mealGap=jasperMealStats();
  const lastMealSub=lastMealAt
    ? `${lastMealYesterday?'ieri · ':''}<span data-since="${lastMealAt.getTime()}" data-fmt="ago">${agoTxt(lastMealAt)}</span> · ${meals.length} past${meals.length===1?'o':'i'} oggi`
    : 'nessun pasto registrato';

  // Ora corrente per default del time picker
  const nowHHMM = new Date().toLocaleTimeString('it-IT',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'});

  // ── SONNO: ieri + oggi come intervalli reali (la notte è salvata sul giorno in cui inizia) ──
  const iv=jasperIntervals(yISO,today).filter(x=>x.st<=nowD);
  const openIv=[...iv].reverse().find(x=>!x.en)||null;
  const doneIv=iv.filter(x=>x.en&&x.en<=nowD);
  const lastDone=doneIv.length?doneIv[doneIv.length-1]:null;

  let sleepCardHtml;
  if(openIv){
    const sleepingMin=Math.max(0,Math.floor((nowD-openIv.st)/60000));
    const prev=doneIv.filter(x=>x.en<=openIv.st).pop();
    const awakeBefore=prev?Math.floor((openIv.st-prev.en)/60000):null;
    const hint=(awakeBefore!==null&&awakeBefore>0&&awakeBefore<8*60)
      ? `<div class="jas-sleep-hint">Prima era sveglio ${formatMin(awakeBefore)} (dalle ${esc(prev.end)})</div>` : '';
    const tooLong=openIv.night ? sleepingMin>15*60 : sleepingMin>180;
    const warn=tooLong
      ? `<div class="jas-sleep-warn">Dorme da ${formatMin(sleepingMin)}: forse "Svegliato ora" non è stato premuto?<br><button type="button" onclick="jasperOpenSleepEditor('${openIv.day}','${esc(openIv.start)}')">Correggi orario</button></div>` : '';
    sleepCardHtml = `<div class="jas-sleep-card sleeping">
      <div class="jas-sleep-lbl">${openIv.night?'🌙 Sta dormendo (notte)':'💤 Sta dormendo'}</div>
      <div class="jas-sleep-status">da <span data-since="${openIv.st.getTime()}">${formatMin(sleepingMin)}</span></div>
      <div class="jas-sleep-detail">iniziato alle ${esc(openIv.start)}${openIv.day!==today?' di ieri':''}</div>
      ${hint}
      <button class="jas-sleep-btn wake" onclick="jasperEndSleep()" type="button">☀️ Svegliato ora</button>
      <button class="jas-sleep-alt" onclick="jasperOpenSleepEditor('${openIv.day}','${esc(openIv.start)}',{endNow:true})" type="button">Si è svegliato prima? Scegli l'ora</button>
      ${warn}
    </div>`;
  } else if(lastDone && (nowD-lastDone.en) < 16*3600000){
    const awakeMin=Math.max(0,Math.floor((nowD-lastDone.en)/60000));
    const dur=Math.round((lastDone.en-lastDone.st)/60000);
    const detail=lastDone.night
      ? `svegliato alle ${esc(lastDone.end)} · notte ${formatMin(dur)}`
      : `ultimo pisolino ${esc(lastDone.start)}→${esc(lastDone.end)} · ${formatMin(dur)}`;
    const stats=jasperWakeStats();
    const w=lastDone.night?stats.morning:stats.other;
    let hint='';
    if(w){
      const due=new Date(lastDone.en.getTime()+w*60000);
      hint = due>nowD
        ? `<div class="jas-sleep-hint">Prossimo sonno probabile verso ${jasHHMM(due)} · di solito sveglio ${formatMin(w)} (ultimi 14 giorni)</div>`
        : `<div class="jas-sleep-hint">Di solito a quest'ora dorme già · sveglio in media ${formatMin(w)} (ultimi 14 giorni)</div>`;
    }
    sleepCardHtml = `<div class="jas-sleep-card">
      <div class="jas-sleep-lbl">☀️ Sveglio</div>
      <div class="jas-sleep-status">da <span data-since="${lastDone.en.getTime()}">${formatMin(awakeMin)}</span></div>
      <div class="jas-sleep-detail">${detail}</div>
      ${hint}
      <button class="jas-sleep-btn" onclick="jasperStartSleep()" type="button">💤 Dorme ora</button>
      <button class="jas-sleep-alt" onclick="jasperOpenSleepEditor(toISO(),'')" type="button">Si è addormentato prima? Scegli l'ora</button>
    </div>`;
  } else if(entry.woke_at && _HHMM_RE.test(entry.woke_at)){
    const wokeAt=jasAbs(today,entry.woke_at);
    const awakeMin=Math.max(0,Math.floor((nowD-wokeAt)/60000));
    sleepCardHtml = `<div class="jas-sleep-card">
      <div class="jas-sleep-lbl">☀️ Sveglio</div>
      <div class="jas-sleep-status">da <span data-since="${wokeAt.getTime()}">${formatMin(awakeMin)}</span></div>
      <div class="jas-sleep-detail">svegliato alle ${esc(entry.woke_at)}</div>
      <button class="jas-sleep-btn" onclick="jasperStartSleep()" type="button">💤 Dorme ora</button>
      <button class="jas-sleep-alt" onclick="jasperOpenSleepEditor(toISO(),'')" type="button">Si è addormentato prima? Scegli l'ora</button>
    </div>`;
  } else {
    sleepCardHtml = `<div class="jas-sleep-card">
      <div class="jas-sleep-lbl">Sonno</div>
      <div class="jas-sleep-status">Nessun pisolino oggi</div>
      <div class="jas-sleep-detail">Inizia a tracciare quando Jasper dorme</div>
      <button class="jas-sleep-btn" onclick="jasperStartSleep()" type="button">💤 Dorme ora</button>
      <button class="jas-sleep-alt" onclick="jasperOpenSleepEditor(toISO(),'')" type="button">Si è addormentato prima? Scegli l'ora</button>
    </div>`;
  }

  // Lista sonno di oggi: notte finita stamattina + pisolini, con la veglia tra uno e l'altro
  const todayRows=iv.filter(x=>x.day===today||(x.en&&dateToISO(x.en)===today)||x===openIv);
  const napsDone=todayRows.filter(x=>x.day===today&&!x.night&&x.en).length;
  const napOpen=todayRows.some(x=>x.day===today&&!x.night&&!x.en);
  let sleepsListHtml='';
  if(todayRows.length){
    const rows=[];
    const first=todayRows[0];
    if(first.day===today){
      const prevOfFirst=iv.filter(x=>x.en&&x.en<=first.st).pop();
      if(prevOfFirst){
        const g=Math.floor((first.st-prevOfFirst.en)/60000);
        if(g>0&&g<8*60) rows.push(`<div class="jas-sleep-gap">↕ ${formatMin(g)} sveglio (dalle ${esc(prevOfFirst.end)})</div>`);
      }
    }
    todayRows.forEach((x,i)=>{
      const cls='jas-sleep-row'+(x.en?'':' active')+(x.night?' night':'');
      const ico=x.night?'🌙':'💤';
      const lbl=x.night?'Notte ':'';
      const fromY=x.day!==today?' (ieri)':'';
      const timeTxt=x.en
        ? `${ico} ${lbl}${esc(x.start)}${fromY} → ${esc(x.end)} · ${formatMin(Math.round((x.en-x.st)/60000))}`
        : `${ico} ${lbl}${esc(x.start)}${fromY} → <em>in corso</em> · <span data-since="${x.st.getTime()}">${formatMin(Math.max(0,Math.floor((nowD-x.st)/60000)))}</span>`;
      const del=(x.day===today&&x.en)?`<button class="jas-sleep-del" onclick="jasperDeleteSleep('${esc(x.start)}',event)" title="Rimuovi" type="button">×</button>`:'';
      rows.push(`<div class="${cls}" onclick="jasperOpenSleepEditor('${x.day}','${esc(x.start)}')" title="Tocca per modificare gli orari"><span class="jas-sleep-time">${timeTxt}</span><span class="jas-sleep-edit">✎</span>${del}</div>`);
      const next=todayRows[i+1];
      if(next&&x.en){
        const g=Math.floor((next.st-x.en)/60000);
        if(g>0) rows.push(`<div class="jas-sleep-gap">↕ ${formatMin(g)} sveglio</div>`);
      }
    });
    sleepsListHtml=rows.join('');
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
      <button class="jas-tab" data-tab="storico" onclick="jasperSetTab('storico')" type="button">🗓 Storico</button>
      <button class="jas-tab" data-tab="crescita" onclick="jasperSetTab('crescita')" type="button">📊 Crescita</button>
    </div>

    <!-- TAB OGGI -->
    <div class="jas-tab-pane active" data-pane="oggi">

      <!-- Ultimo pasto card -->
      <div class="jas-last-meal-card">
        <div class="jas-last-meal-lbl">⏱ Ultimo pasto</div>
        <div class="jas-last-meal-val">${lastMealTime||'—'}</div>
        <div class="jas-last-meal-sub">${lastMealSub}</div>
        ${mealGap?`<div class="jas-last-meal-sub">di solito ogni ${formatMin(mealGap)}</div>`:''}
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

      <!-- Sonno -->
      <div class="jas-section-lbl" style="margin-top:8px">💤 Sonno</div>
      ${sleepCardHtml}

      ${sleepsListHtml ? `<div class="jas-sleeps-list">
        <div class="jas-section-lbl">🌙 Sonno di oggi (${napsDone} pisolin${napsDone===1?'o':'i'}${napOpen?' + 1 in corso':''})</div>
        <div class="jas-sleeps-rows">${sleepsListHtml}</div>
      </div>` : ''}

      <button class="jas-sleep-add-btn" onclick="jasperOpenSleepEditor(toISO(),'')" type="button">+ Aggiungi sonno (pisolino o notte)</button>

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
  if (_noteDraft && active) { const ni = active.querySelector('#jasNoteInp'); if (ni) ni.value = _noteDraft; }
  _jasperRendering = false;
  // Restore scroll position after re-render
  requestAnimationFrame(() => { window.scrollTo(0, _scrollY); });
  // Ripristina tab attivo
  if(jasperTab!=='oggi') setTimeout(()=>jasperSetTab(jasperTab),0);
  // Aggiorna i tempi ogni 30 secondi senza ridisegnare la pagina
  startSleepTick();
  } catch(err) {
    _jasperRendering = false;
    console.error('renderJasper error:', err);
    const active = jasperActive();
    if(active) active.innerHTML='<div style="padding:20px;color:#e06060;font-size:13px">Errore caricamento: '+esc(err.message)+'</div>';
  }
}

/* ── Live tick per sezione Sonno (aggiorna durate mentre Jasper dorme) ── */
let _sleepTickInterval = null;
let _jasTickCount = 0;
function startSleepTick(){
  if(_sleepTickInterval) return;
  // Ogni 30 secondi aggiorna solo i numeri dei tempi (niente ridisegno: non cancella
  // quello che si sta scrivendo). Ogni 5 minuti ridisegna, ma solo se nessuno sta scrivendo.
  _sleepTickInterval = setInterval(() => {
    const host = jasperActive();
    if(!host || !host.querySelector('.jasper-page')) return;
    const now = Date.now();
    host.querySelectorAll('[data-since]').forEach(el => {
      const ts = +el.dataset.since;
      if(!ts) return;
      const min = Math.max(0, Math.floor((now - ts) / 60000));
      el.textContent = el.dataset.fmt === 'ago' ? (min < 1 ? 'adesso' : formatMin(min) + ' fa') : formatMin(min);
    });
    _jasTickCount++;
    if(_jasTickCount % 10 === 0) jasperSoftRefresh();
  }, 30000);
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

/* ── Storico: serie sonno per i grafici ── */
let jasperSleepRange = 7;
function jasperSetSleepRange(n){ jasperSleepRange = n; renderJasperStorico(); }

/* Serie giornaliera sonno: pisolini (min, numero) e notte che inizia quel giorno */
function jasperSleepSeries(days){
  const today = toISO();
  const iv = jasperIntervals(dateToISO(new Date(Date.now() - (days + 1) * 86400000)), today);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = dateToISO(new Date(Date.now() - i * 86400000));
    const dayIv = iv.filter(x => x.day === iso);
    const naps = dayIv.filter(x => !x.night && x.en);
    const night = dayIv.find(x => x.night && x.en) || null;
    // Veglia dal risveglio (fine notte precedente) al primo pisolino
    const prevNight = iv.find(x => x.night && x.en && dateToISO(x.en) === iso);
    const firstNap = naps[0];
    const morningWake = (prevNight && firstNap && firstNap.st > prevNight.en) ? (firstNap.st - prevNight.en) / 60000 : null;
    out.push({
      iso,
      hasData: dayIv.length > 0,
      napMin: naps.reduce((s, x) => s + (x.en - x.st) / 60000, 0),
      naps: naps.length,
      nightMin: night ? (night.en - night.st) / 60000 : null,
      morningWake: (morningWake !== null && morningWake < 8 * 60) ? morningWake : null
    });
  }
  return out;
}

function jasperSleepChartsHTML(){
  const days = jasperSleepRange;
  const series = jasperSleepSeries(days);
  const withData = series.filter(d => d.hasData);
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const napsPerDay = avg(withData.map(d => d.naps));
  const napDurs = [];
  const nightMins = withData.map(d => d.nightMin).filter(v => v != null);
  series.forEach(d => { if (d.naps) napDurs.push(d.napMin / d.naps); });
  const avgNapDur = avg(napDurs);
  const avgNight = avg(nightMins);
  const wake = _median(withData.map(d => d.morningWake).filter(v => v != null));
  const h1 = v => (v / 60).toFixed(1).replace('.', ',') + 'h';

  // 7 e 30 giorni: una barra per giorno. 90 giorni: media per settimana.
  let napVals, nightVals, labels;
  if (days <= 30) {
    // Oggi è ancora in corso: senza pisolini finiti la barra resta vuota (non "0 ore")
    napVals   = series.map(d => (d.hasData && !(d.iso === toISO() && !d.naps)) ? d.napMin : null);
    nightVals = series.map(d => d.nightMin);
    labels = series.map((d, i) => {
      const dt = new Date(d.iso + 'T12:00:00');
      if (days <= 7) return dt.toLocaleDateString('it-IT', {weekday:'short'}).slice(0, 2);
      return (i % 5 === 0 || i === series.length - 1) ? String(dt.getDate()) : '';
    });
  } else {
    napVals = []; nightVals = []; labels = [];
    for (let i = 0; i < series.length; i += 7) {
      const w = series.slice(i, i + 7);
      const wd = w.filter(d => d.hasData);
      napVals.push(wd.length ? avg(wd.map(d => d.napMin)) : null);
      const wn = w.map(d => d.nightMin).filter(v => v != null);
      nightVals.push(wn.length ? avg(wn) : null);
      const dt = new Date(w[0].iso + 'T12:00:00');
      labels.push((i / 7) % 3 === 0 ? dt.toLocaleDateString('it-IT', {day:'numeric', month:'numeric'}) : '');
    }
  }
  const rangeBtn = n => `<button type="button" class="${days === n ? 'on' : ''}" onclick="jasperSetSleepRange(${n})">${n === 7 ? 'Settimana' : n === 30 ? 'Mese' : '3 mesi'}</button>`;
  if (!withData.length) {
    return `<div class="jas-section-lbl">💤 Sonno</div><div class="jas-range">${rangeBtn(7)}${rangeBtn(30)}${rangeBtn(90)}</div>
      <div style="text-align:center;padding:16px 0;color:#4a3820;font-size:13px;font-style:italic">Nessun sonno registrato in questo periodo</div>`;
  }
  return `<div class="jas-section-lbl">💤 Sonno</div>
    <div class="jas-range">${rangeBtn(7)}${rangeBtn(30)}${rangeBtn(90)}</div>
    <div class="jas-stats">
      <div class="jas-stat"><div class="jas-stat-val">${napsPerDay != null ? napsPerDay.toFixed(1).replace('.', ',') : '—'}</div><div class="jas-stat-lbl">Pisolini al giorno</div></div>
      <div class="jas-stat"><div class="jas-stat-val">${avgNapDur != null ? formatMin(Math.round(avgNapDur)) : '—'}</div><div class="jas-stat-lbl">Durata pisolino</div></div>
      <div class="jas-stat"><div class="jas-stat-val">${avgNight != null ? formatMin(Math.round(avgNight)) : '—'}</div><div class="jas-stat-lbl">Notte media</div></div>
      <div class="jas-stat"><div class="jas-stat-val">${wake != null ? formatMin(Math.round(wake)) : '—'}</div><div class="jas-stat-lbl">Sveglio prima del 1° pisolino</div></div>
    </div>
    <div class="jas-chart-box">
      <div class="jas-chart-ttl">☀️ Sonno di giorno${days > 30 ? ' · media per settimana' : ''}</div>
      ${jasSvgBars(napVals, labels, {color:'#d4a843', fmt:h1, min:60, title:'Sonno di giorno'})}
    </div>
    <div class="jas-chart-box">
      <div class="jas-chart-ttl">🌙 Notte${days > 30 ? ' · media per settimana' : ''}</div>
      ${jasSvgBars(nightVals, labels, {color:'#7a6ab0', fmt:h1, min:60, title:'Notte'})}
      <div class="jas-chart-note">La notte è segnata sul giorno in cui inizia. Barre vuote: giorni senza dati.</div>
    </div>`;
}

/* ── Storico: calendario + grafici sonno + pasti ultimi 7 giorni ── */
async function renderJasperStorico(){
  const pane=jasperPane('storico');
  const now=new Date();
  if(!jasperCalMonth) jasperCalMonth={year:now.getFullYear(),month:now.getMonth()};
  const{year,month}=jasperCalMonth;
  const firstDay=new Date(year,month,1);
  const lastDay=new Date(year,month+1,0);
  const today=toISO();
  // Primo giorno con dati: nessun limite di 180 giorni, lo storico resta tutto consultabile
  const diaryDays=Object.keys(stData).filter(k=>k.startsWith('jasper_diary_')).map(k=>k.slice(13)).filter(isValidDate).sort();
  const firstData=diaryDays[0]||today;

  // Intestazione mese
  const mLbl=firstDay.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
  const canPrev=dateToISO(new Date(year,month,1))>firstData;
  const canNext=new Date(year,month+1,1)<=new Date(now.getFullYear(),now.getMonth()+1,1);

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
    const isBefore=iso<firstData;
    const e=stData[jasperDiaryKey(iso)]||{};
    const hasData=!!((e.meals||[]).length||(e.notes||[]).length||(e.sleeps||[]).length);
    const isToday=iso===today;
    const cls=[
      isFuture||isBefore?'future':'',
      hasData&&!isFuture?'has-data':'',
      isToday?'today':'',
    ].filter(Boolean).join(' ');
    const dot=hasData&&!isFuture?'<div class="jas-cal-dot"></div>':'';
    calHtml+=`<button class="jas-cal-day ${cls}" onclick="${isFuture||isBefore?'':`openJasperDayPopup('${iso}')`}" type="button">${d}${dot}</button>`;
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

  let sleepHtml='';
  try { sleepHtml=jasperSleepChartsHTML(); } catch(e) { console.error('grafici sonno:', e); }
  const html=calHtml+'<div style="margin-top:22px">'+sleepHtml+'</div>'+weekChartHtml;
  if(pane) pane.innerHTML=html;
}

function jasperCalNav(dir){
  if(!jasperCalMonth){const n=new Date();jasperCalMonth={year:n.getFullYear(),month:n.getMonth()};}
  jasperCalMonth.month+=dir;
  if(jasperCalMonth.month>11){jasperCalMonth.month=0;jasperCalMonth.year++;}
  if(jasperCalMonth.month<0){jasperCalMonth.month=11;jasperCalMonth.year--;}
  renderJasperStorico();
}

/* ── Crescita: peso ── */
async function renderJasperCrescita(){
  const pane=jasperPane('crescita');
  const weights=(stData['jasper_weights']||{list:[]}).list||[];
  const sorted=[...weights].filter(w=>w&&w.date).sort((a,b)=>a.date.localeCompare(b.date));

  const listHtml=sorted.slice().reverse().slice(0,15).map((w,i)=>{
    const dlbl=new Date(w.date+'T12:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'long'});
    return `<div class="jas-weight-entry">
      <span style="font-size:11px;color:#6a5030">${dlbl}</span>
      ${w.note?`<span style="font-size:11px;color:#4a3820">${esc(w.note)}</span>`:''}
      <span class="jas-weight-val">${w.kg} kg</span>
      <button class="jas-weight-del" onclick="jasperDeleteWeight(${sorted.length-1-i})">×</button>
    </div>`;
  }).join('');

  const chart=jasSvgWeight(sorted);
  const html=`<div>
    <div class="jas-section-lbl">⚖ Registra peso</div>
    <div class="jas-weight-inp-row">
      <input class="jas-weight-inp" id="jasWeightKg" placeholder="es. 7.25" inputmode="decimal" autocomplete="off" style="width:100px">
      <input class="jas-weight-inp" type="date" id="jasWeightDate" value="${toISO()}" max="${toISO()}">
      <input class="jas-weight-inp" id="jasWeightNote" placeholder="nota opzionale (es. Pediatra)" style="flex:1">
    </div>
    <button onclick="jasperLogWeight()" style="padding:9px 20px;background:#221608;border:1px solid #6a5030;border-radius:12px;color:#d4a843;font-size:13px;cursor:pointer;font-family:inherit;margin-bottom:20px">+ Salva peso</button>
    ${chart?`<div class="jas-section-lbl">📈 Curva di crescita</div>
    <div class="jas-chart-box">${chart}</div>`:''}
    <div class="jas-section-lbl">📋 Storico pesi</div>
    ${listHtml||'<div style="font-size:13px;color:#4a3820;font-style:italic;padding:8px 0">Nessun peso registrato ancora</div>'}
  </div>`;
  if(pane) pane.innerHTML=html;
}


async function jasperLogWeight(){
  // Valori letti al momento del tocco. Cerca l'input dentro l'active container per evitare duplicati
  const active = jasperActive();
  const inpEl = active?.querySelector('#jasWeightKg') || document.getElementById('jasWeightKg');
  const raw = (inpEl?.value||'').replace(',','.').trim();
  const kg = parseFloat(raw);
  const dateEl = active?.querySelector('#jasWeightDate') || document.getElementById('jasWeightDate');
  const date = (dateEl?.value || toISO()).slice(0,10);
  const noteEl = active?.querySelector('#jasWeightNote') || document.getElementById('jasWeightNote');
  const note = (noteEl?.value||'').trim();
  if(isNaN(kg)||kg<0.5||kg>25){
    toast('Inserisci un peso valido (0.5 - 25 kg)','warn');
    return;
  }
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      await stMutate('jasper_weights', ws => {
        if(!Array.isArray(ws.list)) ws.list = [];
        ws.list = ws.list.filter(w => w && w.date !== date);
        ws.list.push({kg,date,note});
        ws.list.sort((a,b)=>a.date.localeCompare(b.date));
      }, {list:[]});
      toast('⚖ '+kg+'kg salvato ✓','success');
      renderJasperCrescita();
    } catch(e){ console.error('jasperLogWeight:',e); toast('Errore salvataggio peso','warn'); }
  }).catch(() => {});
}

async function jasperDeleteWeight(idx){
  const sorted=[...((stData['jasper_weights']||{list:[]}).list||[])].filter(w=>w&&w.date).sort((a,b)=>a.date.localeCompare(b.date));
  const target=sorted[idx];
  if(!target) return;
  await _jasperRemoveWeight(target, () => renderJasperCrescita());
}
/* Rimozione peso con ANNULLA */
function _jasperRemoveWeight(target, after){
  return _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      await stMutate('jasper_weights', ws => {
        if(!Array.isArray(ws.list)) ws.list = [];
        const before = ws.list.length;
        ws.list = ws.list.filter(w => !(w && w.date === target.date));
        if(ws.list.length === before) return false;
      }, {list:[]});
      if(after) after();
      toast('Peso rimosso','info',{label:'ANNULLA',timeout:5000,callback:()=>{
        _jasperOpQueue = _jasperOpQueue.then(async () => {
          await stMutate('jasper_weights', ws => {
            if(!Array.isArray(ws.list)) ws.list = [];
            if(ws.list.some(w => w && w.date === target.date)) return false;
            ws.list.push(target); ws.list.sort((a,b)=>a.date.localeCompare(b.date));
          }, {list:[]});
          if(after) after();
          toast('Ripristinato ✓','success');
        }).catch(() => {});
      }});
    } catch(e) { console.error('jasperDeleteWeight:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

/* ── Actions ── */
let _jasperOpQueue = Promise.resolve();

// Registra un pasto con ora custom (default: ora corrente)
async function jasperLogMealTime(){
  // Valori letti al momento del tocco (con rete lenta il turno in coda può arrivare dopo)
  const hhmm=readHHMMPicker('jasMealTime');
  if(!hhmm){toast('Seleziona un orario','warn');return;}
  const today=toISO();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      let dup=false;
      const res=await jasperMutateDay(today, e => {
        // Evita duplicati: se esiste gia un pasto nello stesso minuto non lo ri-aggiunge
        if(e.meals.some(m => m && m.hhmm === hhmm)){ dup=true; return false; }
        e.meals.push({hhmm});
        e.lastMeal=hhmm;
      });
      renderJasper();
      if(dup){ toast('Pasto gia registrato a '+hhmm,'warn'); return; }
      if(res) toast('🍼 Pasto alle '+hhmm,'success');
    } catch(e) { console.error('jasperLogMealTime:', e); toast('Errore salvataggio pasto','warn'); }
  }).catch(() => {});
}

/* Tocco su un pasto: apre la modifica (ora + nota) nella scheda del giorno.
   Sostituisce la finestra prompt(), che nell'app su iPhone non funziona. */
function jasperEditMealNote(idx){
  const today=toISO();
  const entry=jasperDiary[today]||stData[jasperDiaryKey(today)]||{};
  const sorted=(entry.meals||[]).slice().sort((a,b)=>(b.hhmm||'').localeCompare(a.hhmm||''));
  const target=sorted[idx];
  if(!target) return;
  _popupEditingState={type:'meal', iso:today, data:{hhmm:target.hhmm, note:target.note||''}};
  openJasperDayPopup(today);
}

function jasperDeleteMeal(idx){
  const today=toISO();
  const entry=jasperDiary[today]||stData[jasperDiaryKey(today)]||{};
  const sorted=(entry.meals||[]).slice().sort((a,b)=>(b.hhmm||'').localeCompare(a.hhmm||''));
  const target=sorted[idx];
  if(!target) return;
  _jasperRemoveFromDay(today, 'meals', m => m && m.hhmm === target.hhmm, 'Pasto rimosso');
}
/* Rimozione dal diario con ANNULLA (pasti, pisolini, note) */
function _jasperRemoveFromDay(iso, field, match, msg){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      let removed = null;
      await jasperMutateDay(iso, e => {
        const i = e[field].findIndex(match);
        if(i < 0) return false;
        removed = e[field].splice(i, 1)[0];
        if(field === 'meals'){
          const latest = e.meals.map(m => m && m.hhmm).filter(Boolean).sort().pop();
          e.lastMeal = latest || null;
        }
      });
      _jasperAfterDayChange(iso);
      if(!removed) return;
      toast(msg, 'info', {label:'ANNULLA', timeout:5000, callback:() => {
        _jasperOpQueue = _jasperOpQueue.then(async () => {
          await jasperMutateDay(iso, e => {
            const key = field === 'meals' ? 'hhmm' : field === 'sleeps' ? 'start' : null;
            if(key && e[field].some(x => x && x[key] === removed[key])) return false;
            e[field].push(removed);
            if(field === 'meals'){
              const latest = e.meals.map(m => m && m.hhmm).filter(Boolean).sort().pop();
              e.lastMeal = latest || null;
            }
          });
          _jasperAfterDayChange(iso);
          toast('Ripristinato ✓','success');
        }).catch(() => {});
      }});
    } catch(e) { console.error('jasperRemove:', e); toast('Errore','warn'); }
  }).catch(() => {});
}
/* Dopo una modifica: aggiorna la pagina di oggi e, se aperta, la scheda del giorno */
function _jasperAfterDayChange(iso){
  const pop = document.getElementById('jasperDayPopup');
  if(pop && pop.classList.contains('open')) openJasperDayPopup(iso);
  if(currentView === 'jasper') renderJasper();
}

/* ── Sleep tracking (pisolini) ── */
function jasperStartSleep(){
  // Orario del tocco, anche se il salvataggio arriva dopo (rete lenta)
  const today = toISO();
  const start = nowHHMMSwiss();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      let already = false;
      const res = await jasperMutateDay(today, e => {
        // Evita doppio start se c'e gia un pisolino aperto
        if(e.sleeps.some(s => s && s.start && !s.end)){ already = true; return false; }
        e.sleeps.push({start, end:null});
      });
      renderJasper();
      if(already){ toast('Jasper sta gia dormendo','warn'); return; }
      if(res) toast('💤 Dorme dalle '+start, 'success', {label:'CORREGGI', timeout:6000, callback:() => jasperOpenSleepEditor(today, start)});
    } catch(e) { console.error('jasperStartSleep:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperEndSleep(){
  // Orario del tocco, anche se il salvataggio arriva dopo (rete lenta)
  const today = toISO();
  const yesterday = dateToISO(new Date(Date.now() - 86400000));
  const end = nowHHMMSwiss();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      let closed = null;
      await jasperMutateDay(today, e => {
        const op = e.sleeps.find(s => s && s.start && !s.end);
        if(!op) return false;
        op.end = end;
        e.woke_at = end;
        closed = {start: op.start, day: today};
      });
      // Notte a cavallo della mezzanotte: il sonno aperto è sul giorno prima
      if(!closed){
        await jasperMutateDay(yesterday, e => {
          const op = e.sleeps.find(s => s && s.start && !s.end);
          if(!op) return false;
          op.end = end;
          closed = {start: op.start, day: yesterday};
        });
        if(closed) await jasperMutateDay(today, e => { e.woke_at = end; });
      }
      renderJasper();
      if(!closed){ toast('Nessun pisolino in corso','warn'); return; }
      toast('☀️ Ha dormito '+formatMin(hhmmDiffMin(closed.start, end)), 'success', {label:'CORREGGI', timeout:6000, callback:() => jasperOpenSleepEditor(closed.day, closed.start)});
    } catch(e) { console.error('jasperEndSleep:',e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperDeleteSleep(startHHMM, event){
  event?.stopPropagation();
  _jasperRemoveFromDay(toISO(), 'sleeps', s => s && s.start === startHHMM, 'Pisolino rimosso');
}

function jasperShowManualSleepForm(){
  jasperOpenSleepEditor(toISO(), '');
}


/* ── Popup storico giorno (con edit/delete inline) ── */
let _popupEditingState = null; // {type: 'meal'|'note'|'weight'|'sleep', iso, data}

function openJasperDayPopup(iso){
  const entry=stData[jasperDiaryKey(iso)]||{};
  const meals=(entry.meals||[]).slice().sort((a,b)=>(a.hhmm||'').localeCompare(b.hhmm||''));
  const notes=entry.notes||[];
  const ws=(stData['jasper_weights']||{list:[]}).list||[];
  const dayWeights=ws.filter(w=>w&&w.date===iso);
  const dlbl=new Date(iso+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  let content=`<div class="jas-day-summary">${esc(jasperDaySummaryText(iso))}</div>`;

  // ── Pasti ──
  content+=`<div class="jas-popup-section">
    <div class="jas-popup-sec-lbl">🍼 Pasti (${meals.length})</div>
    ${meals.length
      ? meals.map(m=>`<div class="jas-popup-item-row">
          <div class="jas-popup-meal">🍼 ${esc(m.hhmm||'?')}${m.note?` <span class="jas-popup-meal-note">${esc(m.note)}</span>`:''}</div>
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

  // ── Sonno (notte e pisolini, segnati sul giorno in cui iniziano) ──
  const nightByStart={};
  jasperIntervals(iso,iso).forEach(x=>{ nightByStart[x.start]=x.night; });
  const sleepsDayList = (entry.sleeps||[]).filter(s=>s&&s.start).slice().sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  content+=`<div class="jas-popup-section">
    <div class="jas-popup-sec-lbl">💤 Sonno (${sleepsDayList.length})</div>
    ${sleepsDayList.length
      ? sleepsDayList.map(s=>`<div class="jas-popup-item-row">
          <div class="jas-popup-sleep">${nightByStart[s.start]?'🌙 Notte':'💤'} ${esc(s.start)} → ${s.end?esc(s.end)+' · '+formatMin(hhmmDiffMin(s.start,s.end)):'<em>in corso</em>'}</div>
          <button class="jas-popup-item-btn edit" onclick="jasperEditSleepFromDay('${iso}','${esc(s.start)}',event)" title="Modifica">✎</button>
          <button class="jas-popup-item-btn del" onclick="jasperDeleteSleepFromDay('${iso}','${esc(s.start)}',event)" title="Rimuovi">×</button>
        </div>`).join('')
      : '<div class="jas-popup-empty">Nessun sonno registrato</div>'}
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
  jasperSoftRefresh();
}

/* ── Popup edit form renderer ── */
function renderPopupEditForm(iso, state){
  if(!state) return '';
  const {type, data} = state;
  let body = '';
  if(type === 'meal'){
    body = `
      <div class="jas-popup-edit-lbl">Modifica pasto</div>
      ${hhmmPickerHTML('popupEditMeal', data.hhmm||'', {withNow:true})}
      <input type="text" id="popupEditMealNote" class="jas-popup-edit-inp" value="${esc(data.note||'')}" placeholder="nota (es. 120ml, pappa carne)" style="margin-top:8px">
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
    const creating = !data.originalStart;
    const shift = id => `<div class="jas-shift">${[-30,-15,-10,-5,5].map(d => `<button type="button" onclick="jasperShiftPicker('${id}',${d})">${d > 0 ? '+' + d : '−' + Math.abs(d)} min</button>`).join('')}</div>`;
    const dayToggle = creating ? `<div class="jas-day-toggle">
        <span>Iniziato</span>
        <button type="button" data-day="oggi" class="${data.day === 'ieri' ? '' : 'on'}" onclick="jasperSetEditDay('oggi')">Oggi</button>
        <button type="button" data-day="ieri" class="${data.day === 'ieri' ? 'on' : ''}" onclick="jasperSetEditDay('ieri')">Ieri</button>
      </div>` : '';
    body = `<div oninput="jasperSleepEditPreview()">
      <div class="jas-popup-edit-lbl">${creating ? 'Nuovo sonno' : 'Modifica orari'}</div>
      ${dayToggle}
      <div class="jas-sleep-manual-row">
        <label>Addormentato</label>
        ${hhmmPickerHTML('popupEditSleepStart', data.start||'', {withNow:true})}
      </div>
      ${shift('popupEditSleepStart')}
      <div class="jas-sleep-manual-row">
        <label>Svegliato</label>
        ${hhmmPickerHTML('popupEditSleepEnd', data.end||'', {withNow:true, allowEmpty:true})}
      </div>
      ${shift('popupEditSleepEnd')}
      <div class="jas-sleep-edit-preview" id="jasSleepEditPreview"></div>
      <div style="font-size:11px;color:#8a7ca0;margin-bottom:10px;font-style:italic">Lascia vuoto "Svegliato" se sta ancora dormendo</div>
      <div class="jas-popup-edit-btns">
        <button class="jas-popup-edit-save" onclick="jasperSaveSleepEdit('${iso}','${esc(data.originalStart||'')}',event)" type="button">✓ Salva</button>
        <button class="jas-popup-edit-cancel" onclick="jasperCancelPopupEdit('${iso}',event)" type="button">✗ Annulla</button>
      </div>
    </div>`;
  }
  return `<div class="jas-popup-edit-form">${body}</div>`;
}

/* ── Popup: delete functions (in queue per evitare race) ── */
function jasperDeleteMealFromDay(iso, hhmm, event){
  event?.stopPropagation();
  _jasperRemoveFromDay(iso, 'meals', m => m && m.hhmm === hhmm, 'Pasto rimosso');
}

function jasperDeleteNoteFromDay(iso, idx, event){
  event?.stopPropagation();
  const target=((stData[jasperDiaryKey(iso)]||{}).notes||[])[idx];
  if(!target) return;
  _jasperRemoveFromDay(iso, 'notes', n => n && n.text === target.text && (n.ts||'') === (target.ts||''), 'Nota rimossa');
}


function jasperDeleteWeightFromDay(iso, weightDate, event){
  event?.stopPropagation();
  const target=((stData['jasper_weights']||{list:[]}).list||[]).find(w => w && w.date === weightDate);
  if(!target) return;
  _jasperRemoveWeight(target, () => { openJasperDayPopup(iso); if(jasperTab==='crescita') renderJasperCrescita(); });
}

function jasperDeleteSleepFromDay(iso, startHHMM, event){
  event?.stopPropagation();
  _jasperRemoveFromDay(iso, 'sleeps', s => s && s.start === startHHMM, 'Pisolino rimosso');
}

/* ── Popup: edit triggers ── */
function jasperEditMealFromDay(iso, hhmm, event){
  event?.stopPropagation();
  const entry = stData[jasperDiaryKey(iso)];
  const meal = entry?.meals?.find(m => m.hhmm === hhmm);
  _popupEditingState = {type:'meal', iso, data:{hhmm, note: meal?.note || ''}};
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
/* ═══ EDITOR ORARI SONNO (pisolini e notte) ═══
   Si apre toccando un sonno in "Oggi", da "Si è svegliato prima?", da CORREGGI
   dopo Svegliato/Dorme ora, e da "+ Aggiungi sonno".
   La notte è salvata sul giorno in cui inizia (ieri): l'editor lavora sempre
   sul giorno giusto, anche quando la fine è dopo mezzanotte. */
function jasperOpenSleepEditor(iso, start, opts){
  const o = opts || {};
  let data;
  if(start){
    const e = stData[jasperDiaryKey(iso)] || {};
    const s = (e.sleeps || []).find(x => x && x.start === start);
    if(!s){ toast('Sonno non trovato','warn'); return; }
    data = {originalStart: s.start, start: s.start, end: o.endNow ? nowHHMMSwiss() : (s.end || '')};
  } else {
    data = {originalStart: '', start: nowHHMMSwiss(), end: '', day: 'oggi', dayManual: false};
  }
  _popupEditingState = {type:'sleep', iso, data, compact:true};
  const title = document.getElementById('jasDayPopupTitle');
  const body = document.getElementById('jasDayPopupContent');
  if(title) title.textContent = jasperSleepEditorTitle(iso, data);
  if(body) body.innerHTML = renderPopupEditForm(iso, _popupEditingState);
  const overlay = document.getElementById('jasperDayPopup');
  if(overlay) overlay.classList.add('open');
  jasperSleepEditPreview();
}
function jasperSleepEditorTitle(iso, data){
  if(!data.originalStart) return 'Aggiungi sonno';
  const x = jasperIntervals(iso, iso).find(i => i.start === data.originalStart);
  const night = x ? x.night : false;
  if(iso === toISO()) return night ? '🌙 Notte di stasera' : '💤 Pisolino di oggi';
  const d = new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'});
  return (night ? '🌙 Notte iniziata ' : '💤 Sonno del ') + (iso === dateToISO(new Date(Date.now() - 86400000)) ? 'ieri, ' : '') + d;
}
/* Sposta un orario di N minuti (bottoni −30 −15 −10 −5 +5) */
function jasperShiftPicker(prefix, delta){
  let v = readHHMMPicker(prefix);
  if(!v) v = nowHHMMSwiss();
  const [h, m] = v.split(':').map(Number);
  const t = ((h * 60 + m + delta) % 1440 + 1440) % 1440;
  const hEl = document.getElementById(prefix + 'H');
  const mEl = document.getElementById(prefix + 'M');
  if(hEl){ hEl.value = String(Math.floor(t / 60)).padStart(2,'0'); hEl.dataset.touched = '1'; }
  if(mEl){ mEl.value = String(t % 60).padStart(2,'0'); mEl.dataset.touched = '1'; }
  jasperSleepEditPreview();
}
/* Nuovo sonno: iniziato oggi o ieri sera */
function jasperSetEditDay(day){
  const st = _popupEditingState;
  if(!st || st.type !== 'sleep') return;
  st.data.day = day;
  st.data.dayManual = true;
  jasperSleepEditPreview();
}
/* Anteprima durata + scelta automatica oggi/ieri + controlli */
function jasperSleepEditPreview(){
  const st = _popupEditingState;
  if(!st || st.type !== 'sleep') return;
  const el = document.getElementById('jasSleepEditPreview');
  const s = readHHMMPicker('popupEditSleepStart');
  const e = readHHMMPicker('popupEditSleepEnd');
  const creating = !st.data.originalStart;
  if(creating){
    // Un sonno non può iniziare o finire nel futuro: se oggi non è possibile, è di ieri
    if(!st.data.dayManual && s){
      const today = toISO();
      const stT = jasAbs(today, s);
      let enT = null;
      if(e){ enT = jasAbs(today, e); if(enT <= stT) enT = new Date(enT.getTime() + 86400000); }
      const now = new Date(Date.now() + 60000);
      st.data.day = (stT > now || (enT && enT > now)) ? 'ieri' : 'oggi';
    }
    document.querySelectorAll('#jasDayPopupContent .jas-day-toggle button').forEach(b => b.classList.toggle('on', b.dataset.day === st.data.day));
  }
  if(!el) return;
  if(!s){ el.textContent = ''; return; }
  if(!e){ el.textContent = 'Sta ancora dormendo, dalle ' + s; return; }
  const d = hhmmDiffMin(s, e);
  if(d > 16 * 60){ el.innerHTML = '<span class="warn">Controlla: la fine sembra prima dell\'inizio</span>'; return; }
  el.textContent = 'Durata: ' + formatMin(d) + (e < s ? ' · finisce dopo mezzanotte' : '');
}

function jasperCancelPopupEdit(iso, event){
  event?.stopPropagation();
  const compact = !!(_popupEditingState && _popupEditingState.compact);
  _popupEditingState = null;
  if(compact){ closeJasperDayPopup(); return; }
  openJasperDayPopup(iso);
}

/* ── Popup: save edit functions (in queue per evitare race) ── */
function jasperSaveMealEdit(iso, oldHhmm, event){
  event?.stopPropagation();
  // Snapshot dei nuovi valori PRIMA di entrare in queue (evita problemi se popup re-rendered)
  const newHhmm = readHHMMPicker('popupEditMeal');
  if(!newHhmm){ toast('Seleziona un orario','warn'); return; }
  const newNote = (document.getElementById('popupEditMealNote')?.value || '').trim();
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      let problem = null;
      const res = await jasperMutateDay(iso, e => {
        const mealIdx = e.meals.findIndex(m => m && m.hhmm === oldHhmm);
        if(mealIdx < 0){ problem = 'Pasto non trovato'; return false; }
        if(e.meals.some((m,i) => m && m.hhmm === newHhmm && i !== mealIdx)){ problem = 'Pasto gia registrato a '+newHhmm; return false; }
        e.meals[mealIdx].hhmm = newHhmm;
        e.meals[mealIdx].note = newNote;
        const latest = e.meals.map(m => m && m.hhmm).filter(Boolean).sort().pop();
        e.lastMeal = latest || null;
      });
      if(problem){ toast(problem,'warn'); return; }
      if(!res) return;
      _popupEditingState = null;
      _jasperAfterDayChange(iso);
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
      let notFound = false;
      const res = await jasperMutateDay(iso, e => {
        const idx = e.notes.findIndex(n => n && n.text === originalText && (n.ts||'') === (originalTs||''));
        if(idx < 0){ notFound = true; return false; }
        e.notes[idx].text = newText;
      });
      if(notFound){ toast('Nota non trovata','warn'); return; }
      if(!res) return;
      _popupEditingState = null;
      _jasperAfterDayChange(iso);
      toast('Nota aggiornata ✓','success');
    } catch(e) { console.error('jasperSaveNoteEdit:', e); toast('Errore','warn'); }
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
      const res = await stMutate('jasper_weights', ws => {
        if(!Array.isArray(ws.list)) ws.list = [];
        const idx = ws.list.findIndex(w => w && w.date === oldDate);
        if(idx < 0) return false;
        ws.list[idx] = {kg:newKg, date:oldDate, note:newNote};
        ws.list.sort((a,b) => a.date.localeCompare(b.date));
      }, {list:[]});
      if(!res){ toast('Peso non trovato','warn'); return; }
      _popupEditingState = null;
      openJasperDayPopup(iso);
      if(jasperTab === 'crescita') renderJasperCrescita();
      toast('Peso aggiornato ✓','success');
    } catch(e) { console.error('jasperSaveWeightEdit:', e); toast('Errore','warn'); }
  }).catch(() => {});
}

function jasperSaveSleepEdit(iso, originalStart, event){
  event?.stopPropagation();
  const st = _popupEditingState;
  const compact = !!(st && st.compact);
  const newStart = readHHMMPicker('popupEditSleepStart');
  const newEnd = readHHMMPicker('popupEditSleepEnd');
  if(!newStart){ toast('Inserisci almeno l\'ora in cui si è addormentato','warn'); return; }
  if(newEnd && newStart === newEnd){ toast('Inizio e fine coincidono','warn'); return; }
  if(newEnd && hhmmDiffMin(newStart, newEnd) > 16*60){ toast('Controlla gli orari: la fine sembra prima dell\'inizio','warn'); return; }
  const today = toISO();
  const yISO = dateToISO(new Date(Date.now() - 86400000));
  // Nuovo sonno: il giorno è quello in cui inizia (oggi o ieri)
  const dayISO = (!originalStart && st && st.data && st.data.day === 'ieri') ? yISO : iso;
  // Mai nel futuro
  const stT = jasAbs(dayISO, newStart);
  let enT = null;
  if(newEnd){ enT = jasAbs(dayISO, newEnd); if(enT <= stT) enT = new Date(enT.getTime() + 86400000); }
  const nowT = new Date(Date.now() + 60000);
  if(stT > nowT || (enT && enT > nowT)){ toast('Quell\'orario è nel futuro: controlla gli orari (o oggi/ieri)','warn'); return; }
  // Un solo sonno in corso alla volta
  if(!newEnd){
    const otherOpen = jasperIntervals(yISO, today).some(x => !x.en && !(x.day === dayISO && x.start === originalStart));
    if(otherOpen){ toast('C\'è già un sonno in corso: chiudi prima quello','warn'); return; }
  }
  // Niente sovrapposizioni con un altro sonno registrato
  const enEff = enT || nowT;
  const clash = jasperIntervals(dateToISO(new Date(stT.getTime() - 86400000)), today)
    .find(x => !(x.day === dayISO && x.start === originalStart) && x.st < enEff && (x.en || nowT) > stT);
  if(clash){ toast('Si sovrappone a un altro sonno (' + clash.start + (clash.end ? '→' + clash.end : ', in corso') + ')','warn'); return; }
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      let problem = null, oldEnd = null;
      const res = await jasperMutateDay(dayISO, e => {
        if(originalStart){
          const idx = e.sleeps.findIndex(s => s && s.start === originalStart);
          if(idx < 0){ problem = 'Sonno non trovato'; return false; }
          // Evita collisione con altro sonno che ha gia quell'inizio
          if(newStart !== originalStart && e.sleeps.some((s,i) => i !== idx && s && s.start === newStart)){
            problem = 'Esiste gia un sonno a '+newStart; return false;
          }
          oldEnd = e.sleeps[idx].end || null;
          e.sleeps[idx] = {start:newStart, end:newEnd || null};
        } else {
          if(e.sleeps.some(s => s && s.start === newStart)){ problem = 'Esiste gia un sonno che inizia alle '+newStart; return false; }
          e.sleeps.push({start:newStart, end:newEnd || null});
        }
      });
      if(problem){ toast(problem,'warn'); return; }
      if(!res) return;
      // Orario di sveglia di oggi allineato (notte di ieri che finisce stamattina, o ultimo sonno di oggi)
      if(newEnd && enT && dateToISO(enT) === today && (dayISO === yISO || dayISO === today)){
        await jasperMutateDay(today, e => {
          if(e.woke_at && e.woke_at !== oldEnd) return false;
          e.woke_at = newEnd;
        });
      }
      _popupEditingState = null;
      if(compact){
        const overlay = document.getElementById('jasperDayPopup');
        if(overlay) overlay.classList.remove('open');
        if(currentView === 'jasper') renderJasper();
      } else {
        _jasperAfterDayChange(dayISO);
      }
      toast(originalStart ? 'Orari aggiornati ✓' : 'Sonno aggiunto ✓', 'success');
    } catch(e) { console.error('jasperSaveSleepEdit:', e); toast('Errore','warn'); }
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
      const ts=new Date().toLocaleString('it-IT',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'});
      await jasperMutateDay(today, e => { e.notes.push({text:noteText,ts}); });
      renderJasper();
      toast('Nota salvata ✓','success');
    } catch(e) { console.error('jasperSaveNote:', e); toast('Errore salvataggio nota','warn'); }
  }).catch(() => {});
}

function jasperDeleteNote(idx, _ignore){
  const today=toISO();
  const entry=jasperDiary[today]||stData[jasperDiaryKey(today)]||{};
  const target=(entry.notes||[])[idx];
  if(!target) return;
  _jasperRemoveFromDay(today, 'notes', n => n && n.text === target.text && (n.ts||'') === (target.ts||''), 'Nota rimossa');
}


