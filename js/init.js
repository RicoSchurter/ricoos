/* Stato aggiornamento dati (usato da init e refreshData) */
let _lastLoadAt = 0;
let _loadedDay  = null;
let _refreshing = false;

(async function init() {
  // Cleanup: rimuovi marker vecchio backup client-side (sostituito da GitHub Actions)
  try {
    localStorage.removeItem('rico_last_backup_rico');
    localStorage.removeItem('rico_last_backup_anissa');
  } catch(e) { /* ignora */ }

  try { await loadAll(); } catch(e) {
    console.warn('loadAll failed, using localStorage:', e.message);
  }
  _lastLoadAt = Date.now();
  _loadedDay  = toISO();
  agDay = toISO();
  _dataReadyResolve();

  applyProfileTheme(currentProfile);
  document.querySelector('.app')?.setAttribute('data-view', 'oggi');
  initVoice(); // Attiva microfono se disponibile
  loadMIT();   // Carica MIT del giorno
  updateHeader();
  $('fData').value = toISO();

  updateKeyUI();
  renderAll();
  checkSmartNotifs();
  scheduleNotifs();
  // Anissa: l'app si apre direttamente su Jasper (se già sbloccata in questa sessione)
  if (sessionStorage.getItem('rico_unlocked') === '1' && currentProfile === 'anissa') setView('jasper');

  // Drag & drop upload
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) processFile(f);
  });

  // Click outside overlays to close
  $('addOverlay').addEventListener('click', e => { if (e.target === $('addOverlay')) closeModal(); });
  $('settingsOverlay').addEventListener('click', e => { if (e.target === $('settingsOverlay')) closeSettings(); });

  // Aggiornamento automatico: quando riapri l'app, quando torna la rete, a cambio giorno
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - _lastLoadAt > 30000) refreshData();
  });
  window.addEventListener('online', () => flushPending());
  setInterval(() => { if (toISO() !== _loadedDay) refreshData(); }, 60000);
})();

/* ═══════════════════════════════════════
   AGGIORNAMENTO DATI (focus / nuovo giorno)
═══════════════════════════════════════ */
async function refreshData() {
  if (_refreshing) return;
  _refreshing = true;
  try {
    const dayChanged = toISO() !== _loadedDay;
    await loadAll();
    _lastLoadAt = Date.now();
    _loadedDay  = toISO();
    if (dayChanged) { agDay = toISO(); $('fData').value = toISO(); }
    updateHeader();
    loadMIT();
    renderAll();
    if (currentView === 'agenda') renderAgenda();
    if (currentView === 'jasper' && typeof jasperSoftRefresh === 'function') jasperSoftRefresh();
    checkSmartNotifs();
    scheduleNotifs();
  } catch(e) {
    console.warn('refreshData:', e);
  } finally {
    _refreshing = false;
  }
}
