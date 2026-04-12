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

function jasperSetTab(tab) {
  jasperTab = tab;
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
  if(stData[key]) return JSON.parse(JSON.stringify(stData[key]));
  return{notes:[],meals:[],lastMeal:null};
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
  ['d','m'].forEach(p=>{
    const v=document.getElementById(p==='d'?'dv-jasper':'mv-jasper');
    if(v&&!v.querySelector('.jasper-page'))
      v.innerHTML='<div style="padding:40px;text-align:center;color:#6a5030;font-size:28px">🌿</div>';
  });
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
          <input class="jas-meal-time-inp" type="time" id="jasMealTime" value="${nowHHMM}">
          <button class="jas-meal-save-btn" onclick="jasperLogMealTime()">+ Aggiungi</button>
        </div>
      </div>

      <!-- Lista pasti oggi -->
      <div class="jas-meals-list">
        <div class="jas-section-lbl">Pasti di oggi</div>
        <div class="jas-meals-rows">${mealsListHtml}</div>
      </div>

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
  // Restore scroll position after re-render
  requestAnimationFrame(() => { window.scrollTo(0, _scrollY); });
  // Ripristina tab attivo
  if(jasperTab!=='oggi') setTimeout(()=>jasperSetTab(jasperTab),0);
  } catch(err) {
    console.error('renderJasper error:', err);
    const active = jasperActive();
    if(active) active.innerHTML='<div style="padding:20px;color:#e06060;font-size:13px">Errore caricamento: '+err.message+'</div>';
  }
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

function jasperFoodsAll(){ return stData['jasper_foods']||{list:[]}; }

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
  try {
    const inp=document.getElementById('jasCiboName');
    if(!inp||!inp.value.trim()){toast('Scrivi il nome del cibo','warn');return;}
    const type=document.querySelector('input[name="ciboType"]:checked')?.value||'single';
    const note=(document.getElementById('jasCiboNote')?.value||'').trim();
    const foods=jasperFoodsAll();
    if(_editingFoodId){
      // Update esistente
      const idx=foods.list.findIndex(f=>f.id===_editingFoodId);
      if(idx>=0){
        foods.list[idx]={...foods.list[idx],name:inp.value.trim(),type,reaction:_selectedFoodFace,note};
        await saveJasperFoods(foods);
        toast('✓ Cibo aggiornato','success');
      }
      _editingFoodId=null;
    } else {
      // Nuovo
      foods.list.unshift({
        id:'food_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
        name:inp.value.trim(),
        type,
        reaction:_selectedFoodFace,
        date:toISO(),
        note
      });
      await saveJasperFoods(foods);
      toast('🥕 '+inp.value.trim()+' salvato','success');
    }
    inp.value='';
    document.getElementById('jasCiboNote').value='';
    _selectedFoodFace=3;
    renderJasperCibo();
  } catch(e) { console.error('jasperAddFoodEntry:', e); toast('Errore salvataggio cibo','warn'); }
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
  try {
    const foods=jasperFoodsAll();
    foods.list=foods.list.filter(f=>f.id!==id);
    await saveJasperFoods(foods);
    renderJasperCibo();
    toast('Cibo rimosso','info');
  } catch(e) { console.error('jasperDeleteFoodEntry:', e); toast('Errore','warn'); }
}

async function jasperLogWeight(){
  const raw=(document.getElementById('jasWeightKg')?.value||'').replace(',','.').trim();
  const kg=parseFloat(raw);
  const date=document.getElementById('jasWeightDate')?.value||toISO();
  const note=(document.getElementById('jasWeightNote')?.value||'').trim();
  if(isNaN(kg)||kg<0.5||kg>25){toast('Inserisci un peso valido (0.5 - 25 kg)','warn');return;}
  const ws=stData['jasper_weights']||{list:[]};
  ws.list=ws.list.filter(w=>w.date!==date);
  ws.list.push({kg,date,note});
  ws.list.sort((a,b)=>a.date.localeCompare(b.date));
  stData['jasper_weights']=ws;
  localStorage.setItem('rico_st',JSON.stringify(stData));
  sbFetch('startup_data',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},body:JSON.stringify({id:'jasper_weights',data:ws})}).catch(()=>{});
  toast('⚖ '+kg+'kg salvato ✓','success');
  renderJasperCrescita();
}

async function jasperDeleteWeight(idx){
  const ws=stData['jasper_weights']||{list:[]};
  ws.list.splice(idx,1);
  stData['jasper_weights']=ws;
  localStorage.setItem('rico_st',JSON.stringify(stData));
  sbFetch('startup_data',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},body:JSON.stringify({id:'jasper_weights',data:ws})}).catch(()=>{});
  renderJasperCrescita();
}

/* ── Actions ── */
let _jasperOpQueue = Promise.resolve();

// Registra un pasto con ora custom (default: ora corrente)
async function jasperLogMealTime(){
  _jasperOpQueue = _jasperOpQueue.then(async () => {
    try {
      const inp=document.getElementById('jasMealTime');
      if(!inp||!inp.value){toast('Seleziona un orario','warn');return;}
      const hhmm=inp.value;
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

async function jasperDeleteMeal(idx){
  try {
    const today=toISO();
    const entry=jasperDiary[today]||(await loadJasperDiary(today));
    if(!entry.meals||idx<0)return;
    // Sort indice: l'indice e riferito alla lista ordinata discendente per hhmm
    const sorted=entry.meals.slice().sort((a,b)=>(b.hhmm||'').localeCompare(a.hhmm||''));
    const toRemove=sorted[idx];
    if(!toRemove)return;
    entry.meals=entry.meals.filter(m=>m!==toRemove);
    // Aggiorna lastMeal al prossimo piu recente
    if(entry.meals.length){
      const latest=entry.meals.slice().sort((a,b)=>(b.hhmm||'').localeCompare(a.hhmm||''))[0];
      entry.lastMeal=latest.hhmm;
    } else { entry.lastMeal=null; }
    jasperDiary[today]=entry;
    await saveJasperEntry(today,entry);
    renderJasper();
    toast('Pasto rimosso','info');
  } catch(e) { console.error('jasperDeleteMeal:', e); toast('Errore','warn'); }
}

/* ── Popup storico giorno ── */
function openJasperDayPopup(iso){
  const entry=stData[jasperDiaryKey(iso)]||{};
  const meals=(entry.meals||[]).slice().sort((a,b)=>(a.hhmm||'').localeCompare(b.hhmm||''));
  const notes=entry.notes||[];
  const dlbl=new Date(iso+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  let content='';
  content+=`<div class="jas-popup-section">
    <div class="jas-popup-sec-lbl">🍼 Pasti (${meals.length})</div>
    ${meals.length
      ? '<div class="jas-popup-meals">'+meals.map(m=>`<div class="jas-popup-meal">🍼 ${esc(m.hhmm||'?')}</div>`).join('')+'</div>'
      : '<div class="jas-popup-empty">Nessun pasto registrato</div>'}
  </div>`;

  content+=`<div class="jas-popup-section">
    <div class="jas-popup-sec-lbl">📝 Note (${notes.length})</div>
    ${notes.length
      ? '<div class="jas-popup-notes">'+notes.map(n=>`<div class="jas-popup-note"><span class="jas-popup-note-ts">${esc(n.ts||'')}</span>${esc(n.text||'')}</div>`).join('')+'</div>'
      : '<div class="jas-popup-empty">Nessuna nota</div>'}
  </div>`;

  const title=document.getElementById('jasDayPopupTitle');
  const body=document.getElementById('jasDayPopupContent');
  if(title) title.textContent=dlbl;
  if(body) body.innerHTML=content;
  const overlay=document.getElementById('jasperDayPopup');
  if(overlay) overlay.classList.add('open');
}

function closeJasperDayPopup(){
  const overlay=document.getElementById('jasperDayPopup');
  if(overlay) overlay.classList.remove('open');
}

function jasperCustomMilestones(){return stData['jasper_milestones']||{list:[]};}

async function jasperAddMilestone(){
  const inp=document.getElementById('jasMsInp');
  const dateInp=document.getElementById('jasMsDate');
  if(!inp||!inp.value.trim()){toast('Scrivi la milestone','warn');return;}
  const ms=jasperCustomMilestones();
  const date=(dateInp?.value)||toISO();
  const label=new Date(date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
  ms.list.unshift({text:inp.value.trim(),date,label});
  if(ms.list.length>50)ms.list=ms.list.slice(0,50);
  stData['jasper_milestones']=ms;
  localStorage.setItem('rico_st',JSON.stringify(stData));
  sbFetch('startup_data',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:JSON.stringify({id:'jasper_milestones',data:ms})}).catch(e=>console.warn('milestone sync:',e));
  inp.value='';
  renderJasperCrescita();
  toast('✦ Milestone salvata!','success');
}

async function jasperDeleteMilestone(idx){
  const ms=jasperCustomMilestones();
  ms.list.splice(idx,1);
  stData['jasper_milestones']=ms;
  localStorage.setItem('rico_st',JSON.stringify(stData));
  sbFetch('startup_data',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},body:JSON.stringify({id:'jasper_milestones',data:ms})}).catch(()=>{});
  renderJasper();
}

async function jasperSaveNote(){
  try {
    const inp=document.getElementById('jasNoteInp');
    if(!inp||!inp.value.trim())return;
    const today=toISO();
    const entry=jasperDiary[today]||(await loadJasperDiary(today));
    if(!entry.notes)entry.notes=[];
    const ts=new Date().toLocaleString('it-IT',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'});
    entry.notes.push({text:inp.value.trim(),ts});
    jasperDiary[today]=entry;
    inp.value='';
    await saveJasperEntry(today,entry);
    renderJasper();
    toast('Nota salvata ✓','success');
  } catch(e) { console.error('jasperSaveNote:', e); toast('Errore salvataggio nota','warn'); }
}

async function jasperDeleteNote(idx, _ignore){
  try {
    const today=toISO();
    const entry=jasperDiary[today]||(await loadJasperDiary(today));
    if(!entry.notes||idx<0||idx>=entry.notes.length)return;
    entry.notes.splice(idx,1);
    jasperDiary[today]=entry;
    await saveJasperEntry(today,entry);
    renderJasper();
  } catch(e){ console.error('jasperDeleteNote:',e); }
}



