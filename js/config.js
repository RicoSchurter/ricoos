
/* ═══════════════════════════════════════
   DATA & CONFIG
═══════════════════════════════════════ */
const AREAS = {
  lavoro:           {l:'Lavoro',           e:'💼', c:'#d4a843'},
  cpc:              {l:'CPC',              e:'📚', c:'#4db8f0'},
  formatore:        {l:'Formatore',        e:'🎓', c:'#3ecfa0'},
  startup:          {l:'Startup',          e:'🚀', c:'#b088f0'},
  famiglia:         {l:'Famiglia',         e:'👨‍👩‍👧', c:'#f07878'},
  coppia:           {l:'Coppia',           e:'💑', c:'#f4a0c0'},
  vacanza:          {l:'Vacanza',          e:'🏖', c:'#ffa040'},
  personale_rico:   {l:'Personale Rico',   e:'👨', c:'#60d080'},
  personale_anissa: {l:'Personale Anissa', e:'🌸', c:'#e88fc0'},
  jasper:           {l:'Jasper',           e:'👶', c:'#80c8f0'},
};
const STS = {
  remychef:   {n:'RemyChef',   e:'🍽', d:'SaaS per ristoratori Ticino: ricette AI svuota-frigo, menù del giorno con QR code, programmazione settimanale/mensile, ricettario chef'},
  zodai:      {n:'ZodAI',      e:'♊', d:'App astrologia iOS+Android mercato USA: chat AI, scritto del giorno, carte natali, moduli AI personalizzati'},
  paintquote: {n:'PaintQuote', e:'🎨', d:'SaaS per pittori: preventivi e fatture AI via voce/testo sul cantiere, firma digitale cliente'},
  freelance:  {n:'FreelancerAI',e:'💻', d:'SaaS per freelancer (dopo chiusura sezione Fiverr): preventivi automatici AI, firma digitale, fatturazione integrata'},
};
const STAGES     = ['Idea','Building','Testing','Live','Growing'];
const STAGE_CLR  = {Idea:'#706050',Building:'#4db8f0',Testing:'#d4a843',Live:'#3ecfa0',Growing:'#b088f0'};
const PRIO_CLR   = {alta:'#f07878', media:'#d4a843', bassa:'#6a5a48'};

/* ═══ FAMIGLIA ═══ */
const RICO_BD   = new Date('1998-10-10');
const ANISSA_BD = new Date('1999-03-02');
const JASPER_BD = new Date('2025-09-12');

function calcAge(bd) {
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now < new Date(now.getFullYear(), bd.getMonth(), bd.getDate())) age--;
  return age;
}
function jasperMonths() {
  const now = new Date();
  return (now.getFullYear() - JASPER_BD.getFullYear()) * 12
       + (now.getMonth() - JASPER_BD.getMonth())
       + (now.getDate() < JASPER_BD.getDate() ? -1 : 0);
}

function familyContext() {
  return `FAMIGLIA: Rico (${calcAge(RICO_BD)} anni, nato 10/10/1998), moglie Anissa (${calcAge(ANISSA_BD)} anni, nata 02/03/1999), figlio Jasper (${jasperMonths()} mesi, nato 12/09/2025).`;
}



// ═══ PROFILO ATTIVO ═══
let currentProfile = sessionStorage.getItem('rico_profile') || 'rico';

let items    = [];
// Si risolve quando loadAll() ha finito: nessuna scrittura parte da dati vuoti
let _dataReadyResolve;
const _dataReady = new Promise(r => { _dataReadyResolve = r; });
let stData   = {};
// MIT — Most Important Task
let mitData  = {}; // cache locale {text, done} per profilo+data
let jasperDiary = {}; // cache locale diario Jasper per data
let weekOff     = 0;
let agDay       = null;
let filter      = null;
let currentView = 'oggi'; // traccia vista attiva per comportamento chip
let upB64    = null;
let upMime   = null;
let extEvs   = [];
let qaRes    = null;
let qaMove   = null; // stato per flusso spostamento QA
let apiKey   = '';

// Form state
let fS = {tipo:'task', area:'lavoro', st:'remychef', cpc:'CCOA', prio:'media'};

function toISO() {
  // Use local date components — NOT toISOString() which returns UTC
  // In Switzerland (UTC+1/+2) toISOString() returns yesterday between midnight and 01:00/02:00
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function uid()    { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function gc(a)    { return AREAS[a]?.c || '#d4a843'; }


/* ═══ SUPABASE CONFIG ═══ */
const SB_URL = 'https://jjqqsdizmgfjmlsixtmj.supabase.co';
const SB_KEY = 'sb_publishable_1Wtc1fnI4Q-b2-y6HGJ-cg_fW4DD0EM';

/* ═══ HELPER GLOBALI ═══ */


function isMob() { return window.innerWidth < 768; }

/* ═══ HELPER GLOBALI ═══ */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function isValidDate(s) {
  if (!s || typeof s !== 'string') return false;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const d = new Date(+m[1], +m[2]-1, +m[3]);
  return d.getFullYear()===+m[1] && d.getMonth()===+m[2]-1 && d.getDate()===+m[3];
}

/* ═══ AREA FILTERING PER PROFILO ═══
   Regola UI (calendario, agenda, badge, banner):
     Anissa vede tutto tranne startup. Rico vede tutto. */
function personalArea() {
  return currentProfile === 'anissa' ? 'personale_anissa' : 'personale_rico';
}
function defaultArea() {
  return currentProfile === 'anissa' ? 'personale_anissa' : 'lavoro';
}
function isProfileArea(area) {
  if (currentProfile === 'anissa') return area !== 'startup';
  return true;
}

/* Aree personali di Rico — restano visibili nel calendario di Anissa
   (contesto familiare: deve sapere quando Rico è impegnato) ma NON devono
   finire nei prompt AI/coach di Anissa, perché il coach deve parlare SOLO
   della vita di Anissa, mai attribuirle impegni di Rico (scuola, lavoro,
   formatore, personale Rico). */
const RICO_PERSONAL_AREAS = ['lavoro','cpc','formatore','personale_rico'];
function isAnissaAiArea(area) {
  if (currentProfile !== 'anissa') return true;
  return area !== 'startup' && !RICO_PERSONAL_AREAS.includes(area);
}
