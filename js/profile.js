function applyProfileTheme(profile) {
  document.documentElement.setAttribute('data-profile', profile);
  const appName = profile === 'anissa' ? 'Anissa OS' : 'Rico OS';
  const sbName = document.querySelector('.sb-name');
  const mobLogo = document.querySelector('.mob-logo');
  if (sbName)  sbName.textContent = appName;
  if (mobLogo) mobLogo.textContent = appName;
}

function selectProfile(profile) {
  currentProfile = profile;
  document.getElementById('profileSelect').style.display = 'none';
  document.getElementById('pinEntry').style.display     = 'block';
  document.getElementById('pinProfileName').textContent  = profile === 'rico' ? '👨 Rico' : '🌸 Anissa';
  document.getElementById('pinSubText').textContent      = 'Inserisci il PIN';
  pinVal = '';
  updatePinDots();
  document.getElementById('pinError').textContent = '';
}

function backToProfiles() {
  document.getElementById('pinEntry').style.display      = 'none';
  document.getElementById('profileSelect').style.display = 'block';
  pinVal = '';
  updatePinDots();
  document.getElementById('pinError').textContent = '';
}

(function initPin() {
  const saved = sessionStorage.getItem('rico_unlocked');
  const savedProfile = sessionStorage.getItem('rico_profile');
  if (saved === '1' && savedProfile) {
    currentProfile = savedProfile;
    applyProfileTheme(currentProfile);
    updateHeader();
    // Ricarica MIT per il profilo corretto
    loadMIT();
    renderAll();
    document.getElementById('pinScreen').classList.add('hidden');
    return;
  }
  document.addEventListener('keydown', e => {
    if (!document.getElementById('pinScreen').classList.contains('hidden')) {
      if (e.key >= '0' && e.key <= '9') pinPress(e.key);
      if (e.key === 'Backspace') pinDel();
      e.stopPropagation();
    }
  }, true);
})();

let pinVal = '';
const PINS = { rico: '3557', anissa: '1999' };

function pinPress(d) {
  if (pinVal.length >= 4) return;
  // Se siamo ancora sulla scelta profilo, ignora
  if (document.getElementById('pinEntry').style.display === 'none') return;
  pinVal += d;
  updatePinDots();
  if (pinVal.length === 4) setTimeout(checkPin, 120);
}

function pinDel() {
  pinVal = pinVal.slice(0, -1);
  updatePinDots();
  document.getElementById('pinError').textContent = '';
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById('pd' + i).classList.toggle('filled', i < pinVal.length);
  }
}

async function checkPin() {
  if (pinVal === PINS[currentProfile]) {
    sessionStorage.setItem('rico_unlocked', '1');
    sessionStorage.setItem('rico_profile', currentProfile);
    applyProfileTheme(currentProfile);
    // Aggiorna greeting, apiKey e render con il profilo corretto
    apiKey = localStorage.getItem('rico_apikey_'+currentProfile) || localStorage.getItem('rico_apikey') || '';
    // Aspetta che i dati siano caricati: niente schermate vuote, niente scritture su dati vuoti
    await _dataReady;
    updateHeader();
    updateKeyUI();
    loadMIT();
    renderAll();
    setView(currentProfile === 'anissa' ? 'jasper' : 'oggi');
    document.getElementById('pinScreen').classList.add('hidden');
  } else {
    document.getElementById('pinError').textContent = 'PIN errato — riprova';
    pinVal = '';
    updatePinDots();
    const box = document.querySelector('.pin-box');
    box.style.animation = 'shake .3s ease';
    setTimeout(() => box.style.animation = '', 300);
  }
}

function openPDFModal() {
  const m = document.getElementById('pdfModal');
  if (m) { m.style.display = 'flex'; }
}

function closePDFModal() {
  const m = document.getElementById('pdfModal');
  if (m) { m.style.display = 'none'; }
}

function switchProfile() {
  // Ricarica pulita: il nuovo profilo parte sempre dai dati aggiornati del server.
  // (Prima i dati venivano svuotati in memoria e un salvataggio poteva sovrascrivere lo storico.)
  sessionStorage.removeItem('rico_unlocked');
  sessionStorage.removeItem('rico_profile');
  location.reload();
}

