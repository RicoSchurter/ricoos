
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

function startupContext() {
  return `STARTUP di Rico (4 progetti attivi):
- RemyChef: ${STS.remychef.d}
- ZodAI: ${STS.zodai.d}
- PaintQuote: ${STS.paintquote.d}
- FreelancerAI: ${STS.freelance.d}`;
}

function anissaContext() {
  const jm = jasperMonths();
  // 20 domande rotanti, basso costo cognitivo, zero performative.
  // Ruotano per area: sonno/corpo, umore, Jasper, relazionale, piccoli piaceri,
  // casa/cucina, apertura giornata. Vedi design note nei commit.
  const questions = [
    "Com'è andata la notte?",
    'Sei stanca stanca, o stanca ma ok?',
    'Il corpo come sta stamattina?',
    'Hai dormito almeno un pezzetto di fila?',
    'Come ti sei svegliata dentro?',
    'Hai lasciato qualcosa in sospeso da ieri?',
    'Di che umore sei, sincera?',
    'Come stai davvero, oggi?',
    'Che Jasper hai oggi, dolce o impegnativo?',
    "Com'è stato il suo risveglio?",
    'Jasper ha fatto qualcosa che ti ha fatto ridere?',
    'Rico è presente in questi giorni o lontano?',
    'Con chi avresti voglia di fare due chiacchiere oggi?',
    'Come sta oggi la tua mamma?',
    'Cosa ti farebbe bene oggi, anche piccolissimo?',
    'Oggi hai già riso, anche poco?',
    'Che cosa avresti voglia di mangiare oggi?',
    'La casa è in ordine o è esploso tutto?',
    "C'è qualcosa che hai voglia di cucinare oggi?",
    'Cosa ti farebbe dire stasera "oggi è stata una giornata ok"?'
  ];
  const q = questions[new Date().getDate() % questions.length];
  return { jm, q };
}

function swissNow() {
  const now = new Date();
  const swissH = parseInt(now.toLocaleString('en-US', {timeZone:'Europe/Zurich', hour:'2-digit', hour12:false}));
  const swissTime = now.toLocaleString('it-IT', {timeZone:'Europe/Zurich', hour:'2-digit', minute:'2-digit', hour12:false});
  const part = swissH < 12 ? 'mattina' : swissH < 17 ? 'pomeriggio' : swissH < 21 ? 'sera' : 'notte';
  return { h: swissH, time: swissTime, part };
}

// ═══ PROFILO ATTIVO ═══
let currentProfile = sessionStorage.getItem('rico_profile') || 'rico';

let items    = [];
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
let chatHistory = []; // chat session memory

// Form state
let fS = {tipo:'task', area:'lavoro', st:'remychef', cpc:'CCOA', prio:'media'};
let pendingChatAction = null; // pending calendar action awaiting confirmation

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
   Regola: Anissa vede tutto tranne startup. Rico vede tutto. */
function isProfileArea(area) {
  if (currentProfile === 'anissa') return area !== 'startup';
  return true;
}
