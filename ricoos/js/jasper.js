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

const SLEEP_EMOJIS  = ['','😩','😪','😐','😊','🌟'];
const SLEEP_LABELS  = ['','<2h','3-4h','5-6h','7h','8h+'];
const FEED_EMOJIS   = ['','😟','😐','🍼','😊','🌟'];
const FEED_LABELS   = ['','Male','Poco','OK','Bene','Ottimo'];
const MOOD_EMOJIS   = ['','😩','😐','😌','😊','🌟'];
const MOOD_LABELS   = ['','Agitato','Irrequieto','Tranquillo','Felice','Raggiante'];

/* ═══ JASPER — mini-app per Anissa ═══ */
let jasperTab = 'oggi';
let jasperCalMonth = null; // {year, month} per il calendario
let jasperSelDay = null;   // giorno selezionato nello storico

function jasperSetTab(tab) {
  jasperTab = tab;
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
  if(stData[key]) return JSON.parse(JSON.stringify(stData[key]));
  return{sleep:0,feed:0,mood:0,anissa_mood:0,note:'',notes:[],meals:[],foods:[],lastMeal:null,lastMealMl:null,weight:null,sleep_start:'',sleep_end:'',sleep_wakes:''};
}

async function saveJasperEntry(date,data){
  const key=jasperDiaryKey(date);
  stData[key]=data;
  localStorage.setItem('rico_st',JSON.stringify(stData));
  sbFetch('startup_data',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},body:JSON.stringify({id:key,data})}).catch(()=>{});
}

/* ── Render principale ── */
async function renderJasper(){
  ['d','m'].forEach(p=>{
    const v=document.getElementById(p==='d'?'dv-jasper':'mv-jasper');
    if(v&&!v.querySelector('.jasper-page'))
      v.innerHTML='<div style="padding:40px;text-align:center;color:#6a5030;font-size:28px">🌿</div>';
  });
  try {
  const{months,days,totalD}=jasperAgeDetails();
  const today=toISO();
  const entry=await loadJasperDiary(today);
  jasperDiary[today]=entry;

  const phrase=JASPER_PHRASES[Math.floor(totalD/7)%JASPER_PHRASES.length];
  const ageEmoji=months<3?'👶':months<6?'🍼':months<9?'🧸':months<12?'🐣':'👦';
  const ageStr=months+' mes'+(months===1?'e':'i')+(days>0?' e '+days+' giorn'+(days===1?'o':'i'):'');

  const pct=Math.min(100,Math.round((months/24)*100));
  const futureMs=JASPER_MILESTONES.filter(m=>m.m>months);
  const nextMs=futureMs[0];
  const dotHtml=JASPER_MILESTONES.map(ms=>{
    const left=Math.round((ms.m/24)*100);
    const cls=ms.m<months?'past':ms.m===months?'current':'';
    return `<div class="jas-tl-dot ${cls}" style="left:${left}%" title="${ms.e} ${ms.l}"><div class="jas-tl-dot-circle"></div></div>`;
  }).join('');
  const pillsHtml=JASPER_MILESTONES.slice(0,8).map(ms=>{
    const cls=ms.m<months?'past':ms.m===months?'current':'';
    return `<span class="jas-ms-pill ${cls}">${ms.e} ${ms.l}</span>`;
  }).join('');

  const diaryDate=new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});

  // Timer pasto
  function jasperTimerAgo_l(isoTs){
    if(!isoTs)return null;
    const diff=Math.floor((Date.now()-new Date(isoTs).getTime())/60000);
    if(diff<1)return'adesso';
    if(diff<60)return diff+'min fa';
    const h=Math.floor(diff/60),m=diff%60;
    return h+'h'+(m>0?' '+m+'min':'')+'fa';
  }
  const timerAgo=entry.lastMeal?jasperTimerAgo_l(entry.lastMeal):null;
  const meals=entry.meals||[];
  const todayMeals=meals.slice(0,4);

  // Tile helper
  function tileHtml(type,ico,name,val,emojis,labels){
    const filled=val>0?'filled':'';
    return `<div class="jas-tile ${filled}" onclick="jasperSetValue('${type}',${val===0?1:val<5?val+1:1})">
      <span class="jas-tile-ico">${ico}</span>
      <div class="jas-tile-name">${name}</div>
      <div class="jas-tile-val">${val>0?emojis[val]:'—'}</div>
      <div class="jas-tile-sub">${val>0?labels[val]:''}</div>
    </div>`;
  }

  // Grafico 7gg
  const days7=[];
  for(let i=6;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const iso=dateToISO(d);
    const e=stData[jasperDiaryKey(iso)]||{};
    days7.push({day:d.toLocaleDateString('it-IT',{weekday:'short'}).slice(0,2).toUpperCase(),sleep:e.sleep||0,mood:e.mood||0,iso});
  }
  const chartHtml=days7.map(d=>{
    const sh=d.sleep>0?Math.round((d.sleep/5)*100):0;
    const mh=d.mood>0?Math.round((d.mood/5)*100):0;
    const isToday=d.iso===today;
    return `<div class="jas-chart-col">
      <div class="jas-chart-bar-wrap">
        <div style="display:flex;gap:2px;height:100%;align-items:flex-end">
          <div class="jas-chart-bar" style="height:${sh}%;background:#6a5030;flex:1"></div>
          <div class="jas-chart-bar" style="height:${mh}%;background:#d4a843;flex:1"></div>
        </div>
      </div>
      <div class="jas-chart-day" style="${isToday?'color:#f0c860;font-weight:bold':''}">${d.day}</div>
    </div>`;
  }).join('');

  // Note oggi + storiche
  const notesHtml=(entry.notes||[]).slice().reverse().slice(0,5).map((n,i)=>
    `<div class="jas-note-item">
      <span class="jas-note-ts">${n.ts}</span>${esc(n.text)}
      <button class="jas-note-del" onclick="jasperDeleteNote(${entry.notes.length-1-i},'today')">×</button>
    </div>`
  ).join('');
  const histNotes=[];
  for(let di=1;di<=2;di++){
    const pd=new Date();pd.setDate(pd.getDate()-di);
    const piso=dateToISO(pd);
    const pe=stData[jasperDiaryKey(piso)]||{};
    if(pe.notes&&pe.notes.length){
      const dlbl=di===1?'Ieri':pd.toLocaleDateString('it-IT',{weekday:'long'});
      histNotes.push('<div class="jas-notes-day-hdr">'+dlbl+'</div>'+
        pe.notes.slice(-2).reverse().map(n=>`<div class="jas-note-item" style="opacity:.55"><span class="jas-note-ts">${n.ts}</span>${esc(n.text)}</div>`).join(''));
    }
  }

  // Svezzamento oggi
  const foods=entry.foods||[];
  const foodsHtml=foods.length
    ?foods.map((f,i)=>`<div class="jas-food-tag ${f.reaction||'new'}">${esc(f.name)}<button onclick="jasperDeleteFood(${i})" style="background:none;border:none;color:inherit;cursor:pointer;padding:0;font-size:12px">×</button></div>`).join('')
    :'<span style="font-size:12px;color:#4a3820">Nessun alimento oggi</span>';

  // Umore Anissa
  const aEmojis=['','😩','😔','😐','😊','🌟'];
  const aLabels=['','Difficile','Faticoso','Nella norma','Bene','Benissimo'];
  const am=entry.anissa_mood||0;
  const anissaMoodHtml=aEmojis.slice(1).map((e,i)=>{
    const v=i+1;
    return `<div class="jas-anissa-emoji ${am===v?'selected':''}" onclick="jasperSetValue('anissa_mood',${v})" title="${aLabels[v]}">${e}</div>`;
  }).join('');

  // Milestone custom
  const cms=jasperCustomMilestones();
  const cmsHtml=cms.list.length
    ?cms.list.map((m,i)=>`<div class="jas-custom-ms-item"><span>✦</span><span>${esc(m.text)}</span><span class="jas-custom-ms-date">${m.label||m.date}</span><button class="jas-custom-ms-del" onclick="jasperDeleteMilestone(${i})">×</button></div>`).join('')
    :'<div style="font-size:12px;color:#4a3820;padding:8px 0">Nessuna milestone personale ancora</div>';

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
      <button class="jas-tab active" data-tab="oggi" onclick="jasperSetTab('oggi')">📅 Oggi</button>
      <button class="jas-tab" data-tab="storico" onclick="jasperSetTab('storico')">🗓 Storico</button>
      <button class="jas-tab" data-tab="crescita" onclick="jasperSetTab('crescita')">📊 Crescita</button>
    </div>

    <!-- TAB OGGI -->
    <div class="jas-tab-pane active" data-pane="oggi">
      <!-- Timeline -->
      <div class="jas-timeline">
        <div style="font-size:10px;letter-spacing:2px;color:#6a5030;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:8px">
          📍 Dove siamo <span style="font-size:11px;color:#a08040;letter-spacing:0;text-transform:none">→ ${nextMs?nextMs.e+' '+nextMs.l+' ('+nextMs.m+'m)':'🏆 2 anni!'}</span>
        </div>
        <div class="jas-tl-bar-wrap"><div class="jas-tl-bar-fill" style="width:${pct}%"></div></div>
        <div class="jas-tl-dots">${dotHtml}</div>
        <div class="jas-ms-list">${pillsHtml}</div>
      </div>

      <!-- Come sta Anissa -->
      <div class="jas-anissa-mood">
        <div class="jas-anissa-lbl">come stai tu oggi?</div>
        <div class="jas-anissa-emojis">${anissaMoodHtml}</div>
        ${am>0?`<div style="text-align:center;font-size:11px;color:#6a5030;margin-top:6px">${aLabels[am]}</div>`:''}
      </div>

      <!-- Diario -->
      <div class="jas-diary">
        <div class="jas-diary-date">${diaryDate}</div>

        <!-- Timer biberon -->
        <div class="jas-timer-strip">
          <div class="jas-timer-card" style="flex:1.4">
            <div class="jas-timer-lbl">⏱ Ultimo pasto</div>
            <div class="jas-timer-val">${timerAgo||'—'}</div>
            <div class="jas-timer-sub">${entry.lastMealMl?entry.lastMealMl+'ml · ':''} ${entry.lastMeal?new Date(entry.lastMeal).toLocaleTimeString('it-IT',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'}):'non registrato'}</div>
          </div>
          <div class="jas-timer-card" style="flex:1">
            <div class="jas-timer-lbl">🍼 Pasti oggi</div>
            <div class="jas-timer-val">${todayMeals.length||'—'}</div>
            <div class="jas-timer-sub">${todayMeals.length?todayMeals.reduce((s,m)=>s+(m.ml||0),0)+'ml tot':'nessuno'}</div>
          </div>
        </div>
        <div class="jas-ml-row">
          ${[120,150,180,200].map(ml=>`<button class="jas-ml-btn" onclick="jasperLogMeal(${ml})">${ml}ml</button>`).join('')}
          <button class="jas-ml-btn" onclick="jasperLogMealCustom()" style="margin-left:auto">+ altro</button>
        </div>

        <!-- Tile Jasper -->
        <div class="jas-tiles" style="margin-top:14px">
          ${tileHtml('sleep','😴','Sonno',entry.sleep||0,SLEEP_EMOJIS,SLEEP_LABELS)}
          ${tileHtml('feed','🍼','Pasto',entry.feed||0,FEED_EMOJIS,FEED_LABELS)}
          ${tileHtml('mood','☀️','Umore',entry.mood||0,MOOD_EMOJIS,MOOD_LABELS)}
        </div>

        <!-- Sonno notturno -->
        <div style="font-size:10px;letter-spacing:1.5px;color:#6a5030;text-transform:uppercase;margin:14px 0 8px">😴 Sonno di stanotte</div>
        <div class="jas-sleep-row">
          <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
            <span style="font-size:9px;color:#6a5030">Si è addormentato</span>
            <input class="jas-sleep-inp" type="time" id="jasSleepStart" value="${esc(entry.sleep_start||'')}"
              onchange="jasperSaveSleepField('sleep_start',this.value)">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
            <span style="font-size:9px;color:#6a5030">Si è svegliato</span>
            <input class="jas-sleep-inp" type="time" id="jasSleepEnd" value="${esc(entry.sleep_end||'')}"
              onchange="jasperSaveSleepField('sleep_end',this.value)">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
            <span style="font-size:9px;color:#6a5030">Risvegli</span>
            <input class="jas-sleep-inp" type="number" id="jasSleepWakes" min="0" max="20" inputmode="numeric"
              value="${entry.sleep_wakes!==''?entry.sleep_wakes:''}" placeholder="0"
              onchange="jasperSaveSleepField('sleep_wakes',this.value)"
              style="width:64px">
          </div>
        </div>
      </div>

      <!-- Svezzamento -->
      <div style="margin-bottom:16px">
        <div style="font-size:10px;letter-spacing:2px;color:#6a5030;text-transform:uppercase;margin-bottom:10px">🥕 Svezzamento oggi</div>
        <div class="jas-food-tags">${foodsHtml}</div>
        <div class="jas-ms-add-row">
          <input class="jas-ms-inp" id="jasFoodInp" autocomplete="off" autocorrect="off" autocapitalize="sentences" placeholder='es. "Carota" · "Broccoli" · "Mela"'
            onkeydown="if(event.key==='Enter'){event.preventDefault();jasperAddFood()}" maxlength="30">
          <select id="jasFoodReaction" style="background:#160f04;border:1px solid #3a2a10;border-radius:10px;color:#a08040;padding:8px;font-size:14px;font-family:inherit;outline:none">
            <option value="new">🆕 Nuovo</option>
            <option value="ok">✅ Mangiato</option>
            <option value="no">❌ Non gradito</option>
          </select>
          <button onclick="jasperAddFood()" style="padding:8px 12px;background:#221608;border:1px solid #6a5030;border-radius:10px;color:#a08040;font-size:12px;cursor:pointer;font-family:inherit">+</button>
        </div>
      </div>

      <!-- Grafico 7gg -->
      <div class="jas-chart" style="margin-bottom:16px">
        <div style="font-size:10px;letter-spacing:2px;color:#6a5030;text-transform:uppercase;margin-bottom:10px;display:flex;gap:12px;align-items:center">
          📊 Settimana
          <span style="display:flex;gap:8px;font-size:9px;letter-spacing:0;text-transform:none">
            <span><span style="display:inline-block;width:8px;height:8px;background:#6a5030;border-radius:1px;margin-right:3px"></span>Sonno</span>
            <span><span style="display:inline-block;width:8px;height:8px;background:#d4a843;border-radius:1px;margin-right:3px"></span>Umore</span>
          </span>
        </div>
        ${days7.every(d=>!d.sleep&&!d.mood)
          ?'<div style="text-align:center;padding:16px 0;color:#4a3820;font-size:13px;font-style:italic">Inizia oggi — il grafico prenderà forma 🌱</div>'
          :'<div class="jas-chart-grid">'+chartHtml+'</div>'
        }
      </div>

      <!-- Milestone custom -->
      <div class="jas-custom-ms">
        <div style="font-size:10px;letter-spacing:2px;color:#6a5030;text-transform:uppercase;margin-bottom:10px">✦ Le tue milestone</div>
        <div class="jas-custom-ms-list">${cmsHtml}</div>
        <div class="jas-ms-add-row">
          <input class="jas-ms-inp" id="jasMsInp" autocomplete="off" autocorrect="off" autocapitalize="sentences" placeholder='es. "Prima volta che ha riso" · "Ha detto mamma"'
            onkeydown="if(event.key==='Enter'){event.preventDefault();jasperAddMilestone()}" maxlength="60">
          <button onclick="jasperAddMilestone()" style="padding:8px 14px;background:#221608;border:1px solid #6a5030;border-radius:10px;color:#a08040;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap">+ Aggiungi</button>
        </div>
      </div>

      <!-- Note -->
      <div>
        <div style="font-size:10px;letter-spacing:2px;color:#6a5030;text-transform:uppercase;margin-bottom:10px">📝 Note di oggi</div>
        <textarea class="jas-note-inp" id="jasNoteInp" rows="2"
          placeholder='es. "Ha riso tanto stamattina" · "Primo dentino!" · "Ha dormito 6h di fila"'
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();jasperSaveNote();}"
          oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:6px">
          <button onclick="jasperSaveNote()" style="padding:7px 16px;background:#221608;border:1px solid #6a5030;border-radius:20px;color:#a08040;font-size:12px;cursor:pointer;font-family:inherit">Salva nota</button>
        </div>
        <div class="jas-note-saved">${notesHtml}</div>
        ${histNotes.join('')}
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

  ['d','m'].forEach(p=>{
    const v=document.getElementById(p==='d'?'dv-jasper':'mv-jasper');
    if(v) v.innerHTML=html;
  });
  // Ripristina tab attivo
  if(jasperTab!=='oggi') setTimeout(()=>jasperSetTab(jasperTab),0);
  } catch(err) {
    console.error('renderJasper error:', err);
    ['d','m'].forEach(p=>{
      const v=document.getElementById(p==='d'?'dv-jasper':'mv-jasper');
      if(v) v.innerHTML='<div style="padding:20px;color:#e06060;font-size:13px">Errore caricamento: '+err.message+'</div>';
    });
  }
}

/* ── Storico calendario ── */
async function renderJasperStorico(){
  const panes=document.querySelectorAll('[data-pane="storico"]');
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
    const hasData=!!(e.sleep||e.mood||e.feed||(e.notes&&e.notes.length)||(e.meals&&e.meals.length)||(e.foods&&e.foods.length));
    const hasMilestone=!!(e.notes&&e.notes.some(n=>n.milestone));
    const cms=jasperCustomMilestones();
    const hasCms=cms.list.some(m=>m.date===iso);
    const isToday=iso===today;
    const isSel=iso===jasperSelDay;
    const cls=[
      isFuture||isPast180?'future':'',
      hasData&&!isFuture&&!isPast180?'has-data':'',
      (hasMilestone||hasCms)?'has-milestone':'',
      isToday?'today':'',
      isSel?'selected':'',
    ].filter(Boolean).join(' ');
    const dot=hasData&&!isFuture?'<div class="jas-cal-dot '+(hasCms?'ms':'')+'"></div>':'';
    calHtml+=`<div class="jas-cal-day ${cls}" onclick="${isFuture||isPast180?'':`jasperSelCalDay('${iso}')`}">${d}${dot}</div>`;
  }
  calHtml+='</div>';

  // Dettaglio giorno selezionato
  let detailHtml='';
  if(jasperSelDay){
    const e=stData[jasperDiaryKey(jasperSelDay)]||{};
    const dlbl=new Date(jasperSelDay+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
    detailHtml=`<div class="jas-cal-day-detail">
      <div style="font-size:13px;font-weight:600;color:#d4a843;margin-bottom:12px">${dlbl}</div>
      <div class="jas-day-row">
        ${e.sleep?`<span class="jas-day-chip">😴 ${SLEEP_LABELS[e.sleep]||e.sleep}</span>`:''}
        ${e.sleep_start&&e.sleep_end?`<span class="jas-day-chip">${e.sleep_start}→${e.sleep_end}${e.sleep_wakes?' ('+e.sleep_wakes+' risvegli)':''}</span>`:''}
        ${e.mood?`<span class="jas-day-chip">☀️ ${MOOD_LABELS[e.mood]||e.mood}</span>`:''}
        ${e.anissa_mood?`<span class="jas-day-chip gold">Anissa: ${'😩😔😐😊🌟'.split('')[e.anissa_mood-1]}</span>`:''}
        ${e.feed?`<span class="jas-day-chip">🍼 ${FEED_LABELS[e.feed]||e.feed}</span>`:''}
        ${e.meals&&e.meals.length?`<span class="jas-day-chip">${e.meals.length} pasti · ${e.meals.reduce((s,m)=>s+(m.ml||0),0)}ml</span>`:''}
        ${e.weight?`<span class="jas-day-chip gold">⚖ ${e.weight}kg</span>`:''}
      </div>
      ${(e.foods&&e.foods.length)?`<div class="jas-day-row" style="margin-top:4px">${e.foods.map(f=>`<span class="jas-day-chip">${f.reaction==='ok'?'✅':f.reaction==='no'?'❌':'🆕'} ${esc(f.name)}</span>`).join('')}</div>`:''}
      ${(e.notes&&e.notes.length)?e.notes.slice(-3).map(n=>`<div style="font-size:12px;color:#c8b888;padding:4px 0;border-top:1px solid #1e1608;margin-top:6px">${esc(n.text)}</div>`).join(''):''}
      ${!(e.sleep||e.mood||e.notes&&e.notes.length)?'<div style="font-size:12px;color:#4a3820;font-style:italic">Nessun dato registrato per questo giorno</div>':''}
    </div>`;
  }

  const html=calHtml+detailHtml;
  panes.forEach(p=>p.innerHTML=html);
}

function jasperCalNav(dir){
  if(!jasperCalMonth){const n=new Date();jasperCalMonth={year:n.getFullYear(),month:n.getMonth()};}
  jasperCalMonth.month+=dir;
  if(jasperCalMonth.month>11){jasperCalMonth.month=0;jasperCalMonth.year++;}
  if(jasperCalMonth.month<0){jasperCalMonth.month=11;jasperCalMonth.year--;}
  jasperSelDay=null;
  renderJasperStorico();
}

function jasperSelCalDay(iso){
  jasperSelDay=jasperSelDay===iso?null:iso;
  renderJasperStorico();
}

/* ── Crescita peso ── */
async function renderJasperCrescita(){
  const panes=document.querySelectorAll('[data-pane="crescita"]');
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

  const html=`<div>
    <div style="font-size:10px;letter-spacing:2px;color:#6a5030;text-transform:uppercase;margin-bottom:14px">⚖ Registra peso</div>
    <div class="jas-weight-inp-row">
      <input class="jas-weight-inp" type="number" id="jasWeightKg" step="0.01" min="2" max="30" placeholder="es. 7.25" inputmode="decimal"
        style="width:100px">
      <input class="jas-weight-inp" type="date" id="jasWeightDate" value="${toISO()}"
        max="${toISO()}">
      <input class="jas-weight-inp" id="jasWeightNote" placeholder="nota opzionale (es. Pediatra)" style="flex:1">
    </div>
    <button onclick="jasperLogWeight()" style="padding:9px 20px;background:#221608;border:1px solid #6a5030;border-radius:12px;color:#d4a843;font-size:13px;cursor:pointer;font-family:inherit;margin-bottom:20px">+ Salva peso</button>
    ${sorted.length>=2?`<div style="font-size:10px;letter-spacing:2px;color:#6a5030;text-transform:uppercase;margin-bottom:8px">📈 Curva di crescita</div>
    <div class="jas-weight-bar-wrap">${barHtml}</div>`:''}
    <div style="font-size:10px;letter-spacing:2px;color:#6a5030;text-transform:uppercase;margin-bottom:8px">📋 Storico pesi</div>
    ${listHtml||'<div style="font-size:13px;color:#4a3820;font-style:italic;padding:8px 0">Nessun peso registrato ancora</div>'}
  </div>`;
  panes.forEach(p=>p.innerHTML=html);
}

async function jasperLogWeight(){
  const kg=parseFloat(document.getElementById('jasWeightKg')?.value);
  const date=document.getElementById('jasWeightDate')?.value||toISO();
  const note=(document.getElementById('jasWeightNote')?.value||'').trim();
  if(!kg||kg<1||kg>30){toast('Inserisci un peso valido (es. 7.25)','warn');return;}
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
async function jasperSetValue(type,val){
  try {
    const today=toISO();
    const entry=jasperDiary[today]||(await loadJasperDiary(today));
    entry[type]=val;
    jasperDiary[today]=entry;
    document.querySelectorAll('.jas-tile,.jas-anissa-emoji').forEach(t=>t.style.opacity='.6');
    await saveJasperEntry(today,entry);
    await renderJasper();
  } catch(e) { console.error('jasperSetValue:', e); toast('Errore salvataggio','warn'); renderJasper(); }
}

async function jasperSaveSleepField(field,val){
  try {
    const today=toISO();
    const entry=jasperDiary[today]||(await loadJasperDiary(today));
    entry[field]=val;
    jasperDiary[today]=entry;
    await saveJasperEntry(today,entry);
  } catch(e) { console.error('jasperSaveSleepField:', e); }
}

function jasperTimerAgo(isoTs){
  if(!isoTs)return null;
  const diff=Math.floor((Date.now()-new Date(isoTs).getTime())/60000);
  if(diff<1)return'adesso';
  if(diff<60)return diff+'min fa';
  const h=Math.floor(diff/60),m=diff%60;
  return h+'h'+(m>0?' '+m+'min':'')+'fa';
}

function jasperLogMealCustom(){
  const btns=document.querySelectorAll('.jas-ml-row');
  btns.forEach(row=>{
    if(row.querySelector('.jas-ml-custom-inp'))return;
    const inp=document.createElement('input');
    inp.className='jas-sleep-inp jas-ml-custom-inp';
    inp.placeholder='ml';inp.type='number';inp.min='1';inp.max='500';
    inp.style.cssText='width:64px;font-size:16px;padding:6px 8px;margin-left:4px';
    inp.onkeydown=e=>{if(e.key==='Enter'){const v=parseInt(inp.value);if(v>0)jasperLogMeal(v);}};
    row.appendChild(inp);setTimeout(()=>inp.focus(),50);
  });
}

async function jasperLogMeal(ml){
  try {
    const today=toISO();
    const entry=jasperDiary[today]||(await loadJasperDiary(today));
    if(!entry.meals)entry.meals=[];
    const ts=new Date().toISOString();
    const hhmm=new Date().toLocaleTimeString('it-IT',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'});
    entry.meals.unshift({ml,ts,hhmm});
    entry.lastMeal=ts;entry.lastMealMl=ml;
    jasperDiary[today]=entry;
    await saveJasperEntry(today,entry);
    renderJasper();
    toast('🍼 '+ml+'ml · '+hhmm,'success');
  } catch(e) { console.error('jasperLogMeal:', e); toast('Errore registrazione pasto','warn'); }
}

async function jasperAddFood(){
  try {
    const inp=document.getElementById('jasFoodInp');
    const sel=document.getElementById('jasFoodReaction');
    if(!inp||!inp.value.trim())return;
    const today=toISO();
    const entry=jasperDiary[today]||(await loadJasperDiary(today));
    if(!entry.foods)entry.foods=[];
    entry.foods.unshift({name:inp.value.trim(),reaction:sel?.value||'new'});
    jasperDiary[today]=entry;
    inp.value='';
    await saveJasperEntry(today,entry);
    renderJasper();
    toast('🥕 Alimento salvato ✓','success');
  } catch(e) { console.error('jasperAddFood:', e); toast('Errore salvataggio alimento','warn'); }
}

async function jasperDeleteFood(idx){ try {
  const today=toISO();
  const entry=jasperDiary[today]||(await loadJasperDiary(today));
  if(!entry.foods)return;
  entry.foods.splice(idx,1);
  jasperDiary[today]=entry;
  await saveJasperEntry(today,entry);
  renderJasper();

  } catch(e){ console.error("jasperDeleteFood:",e); toast("Errore","warn"); }
}

function jasperCustomMilestones(){return stData['jasper_milestones']||{list:[]};}

async function jasperAddMilestone(){
  const inp=document.getElementById('jasMsInp');
  if(!inp||!inp.value.trim())return;
  const ms=jasperCustomMilestones();
  const today=toISO();
  const hhmm=new Date().toLocaleDateString('it-IT',{day:'numeric',month:'short'});
  ms.list.unshift({text:inp.value.trim(),date:today,label:hhmm});
  if(ms.list.length>20)ms.list=ms.list.slice(0,20);
  stData['jasper_milestones']=ms;
  localStorage.setItem('rico_st',JSON.stringify(stData));
  sbFetch('startup_data',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},body:JSON.stringify({id:'jasper_milestones',data:ms})}).catch(()=>{});
  inp.value='';
  renderJasper();
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



