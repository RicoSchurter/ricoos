/* ═══════════════════════════════════════
   FESTIVITÀ TICINO (CH)
   Date fisse + mobili (legate alla Pasqua)
   Calcolate on-demand per qualsiasi anno.
═══════════════════════════════════════ */

const _holidayCache = {};

// Computus (Meeus/Jones/Butcher) → data della Pasqua gregoriana
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function _isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getTicinoHolidays(year) {
  if (_holidayCache[year]) return _holidayCache[year];

  const map = new Map();

  // Date fisse
  map.set(`${year}-01-01`, 'Capodanno');
  map.set(`${year}-01-06`, 'Epifania');
  map.set(`${year}-03-19`, 'San Giuseppe');
  map.set(`${year}-05-01`, 'Festa del Lavoro');
  map.set(`${year}-06-29`, 'SS. Pietro e Paolo');
  map.set(`${year}-08-01`, 'Festa nazionale');
  map.set(`${year}-08-15`, 'Assunzione');
  map.set(`${year}-11-01`, 'Ognissanti');
  map.set(`${year}-12-08`, 'Immacolata');
  map.set(`${year}-12-25`, 'Natale');
  map.set(`${year}-12-26`, 'Santo Stefano');

  // Date mobili
  const easter = easterSunday(year);
  map.set(_isoLocal(_addDays(easter, -2)), 'Venerdì Santo');
  map.set(_isoLocal(_addDays(easter,  1)), 'Lunedì di Pasqua');
  map.set(_isoLocal(_addDays(easter, 39)), 'Ascensione');
  map.set(_isoLocal(_addDays(easter, 50)), 'Lunedì di Pentecoste');
  map.set(_isoLocal(_addDays(easter, 60)), 'Corpus Domini');

  _holidayCache[year] = map;
  return map;
}

// Lookup O(1): 'YYYY-MM-DD' → label | null
function getHoliday(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 4) return null;
  const year = parseInt(iso.slice(0, 4), 10);
  if (!year) return null;
  return getTicinoHolidays(year).get(iso) || null;
}
