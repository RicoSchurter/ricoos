(async function init() {
  try { await loadAll(); } catch(e) {
    console.warn('loadAll failed, using localStorage:', e.message);
  }
  agDay = toISO();

  const h  = new Date().getHours();
  const profileName = currentProfile === 'anissa' ? 'Anissa' : 'Rico';
  const gr = (h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera') + ', ' + profileName;
  const d  = new Date();
  const dl = d.toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const ds = d.toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'});

  applyProfileTheme(currentProfile);
  document.querySelector('.app')?.setAttribute('data-view', 'oggi');
  initVoice(); // Attiva microfono se disponibile
  loadMIT();   // Carica MIT del giorno
  $('sbDate').textContent  = ds;
  $('tbGreet').textContent = gr;
  $('tbDate').textContent  = dl;
  $('mobDate').textContent = d.toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'}).toUpperCase();
  $('mobGreet').textContent = gr;
  $('fData').value = toISO();

  updateKeyUI();
  checkNightReset(); // resetta chat se siamo dopo le 6:00 svizzere di un nuovo giorno
  renderAll();
  checkSmartNotifs();
  scheduleNotifs();

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
})();

/* ═══════════════════════════════════════
   RENDER ALL
═══════════════════════════════════════ */