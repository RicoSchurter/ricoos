/* ═══ MIT — Most Important Task ═══ */
function mitKey() { return 'mit_' + currentProfile + '_' + toISO(); }

async function loadMIT() {
  const key = mitKey();
  // Prima cerca in stData (già caricato da Supabase)
  if (stData[key]) { mitData = stData[key]; }
  else { mitData = {text:'', done:false}; }
  renderMIT();
}

async function saveMIT() {
  const key = mitKey();
  stData[key] = {...mitData};
  // Persisti su localStorage immediatamente (fallback offline)
  localStorage.setItem('rico_st', JSON.stringify(stData));
  // Poi su Supabase in background
  sbFetch('startup_data', {
    method:'POST',
    prefer:'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({id: key, data: stData[key]})
  }).catch(e => console.warn('mit sync failed:', e));
}

function renderMIT() {
  const hasMIT = mitData.text && mitData.text.trim();
  ['d','m'].forEach(p => {
    const wrap = $(p + 'MitWrap');
    if (!wrap) return;
    if (!hasMIT) {
      wrap.innerHTML = `<div class="mit-empty" onclick="promptMIT()">
        <div class="mit-empty-ico">◈</div>
        <div class="mit-empty-txt">
          <strong>Imposta il focus di oggi</strong><br>
          Una sola cosa che farà la differenza
        </div>
      </div>`;
    } else {
      const doneClass = mitData.done ? 'done-card' : '';
      wrap.innerHTML = `<div class="mit-card ${doneClass}">
        <div class="mit-lbl">◈ Focus di oggi</div>
        <div class="mit-row">
          <button class="mit-chk ${mitData.done?'on':''}" onclick="toggleMIT()" title="${mitData.done?'Segna come aperto':'Segna come fatto'}">
            ${mitData.done?'✓':''}
          </button>
          <textarea class="mit-text" rows="1" onblur="onMITTextBlur(this.value)"
            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
            ${mitData.done?'disabled':''}>${esc(mitData.text)}</textarea>
        </div>
        <div class="mit-actions">
          <button class="mit-action-btn" onclick="suggestMIT()">
            <span class="mit-suggest-spin" id="${p}MitSpin"></span>
            ✦ Suggerisci
          </button>
          <button class="mit-action-btn" onclick="clearMIT()">✗ Rimuovi</button>
        </div>
      </div>`;
      // Auto-resize textarea
      setTimeout(()=>{
        wrap.querySelectorAll('.mit-text').forEach(el=>{el.style.height='auto';el.style.height=el.scrollHeight+'px';});
      },0);
    }
  });
}

function promptMIT() {
  // Niente prompt() — non funziona su iOS Safari PWA
  // Mostra invece un input inline direttamente nella card
  ['d','m'].forEach(p => {
    const wrap = $(p + 'MitWrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="mit-card" style="border-color:var(--gold3)">
      <div class="mit-lbl">◈ Focus di oggi</div>
      <div style="font-size:13px;color:var(--dim);margin-bottom:10px">
        Una sola cosa che farà la differenza oggi
      </div>
      <input class="mit-inline-input" id="${p}MitInput"
        placeholder='es. "Completare il test CCOA"'
        maxlength="80"
        onkeydown="if(event.key==='Enter'){event.preventDefault();confirmMITInput('${p}')}"
      >
      <div class="mit-inline-row">
        <button class="mit-inline-btn confirm" onclick="confirmMITInput('${p}')">✓ Imposta</button>
        <button class="mit-inline-btn cancel"  onclick="renderMIT()">✗ Annulla</button>
        <button class="mit-action-btn" onclick="suggestMIT()" style="margin-left:auto">✦ Suggerisci</button>
      </div>
    </div>`;
    setTimeout(() => { const inp = $(p+'MitInput'); if(inp) inp.focus(); }, 80);
  });
}

function confirmMITInput(pfx) {
  const inp = $(pfx + 'MitInput');
  if (!inp || !inp.value.trim()) return;
  mitData = {text: inp.value.trim(), done: false};
  saveMIT();
  renderMIT();
  toast('◈ Focus impostato ✓', 'success');
}

function onMITTextBlur(val) {
  if (val.trim() === mitData.text) return;
  mitData.text = val.trim();
  if (!mitData.text) mitData = {text:'', done:false};
  saveMIT();
  renderMIT();
}

function toggleMIT() {
  mitData.done = !mitData.done;
  saveMIT();
  renderMIT();
  if (mitData.done) {
    toast('◈ Focus completato — ottimo lavoro!', 'success');
    // Confetti se tutto il giorno è anche completato
    const todayAll = expand().filter(i => i.data === toISO() && (currentProfile !== 'anissa' || i.area !== 'startup'));
    if (todayAll.length && todayAll.every(i => i.done)) {
      if (typeof confetti === 'function') confetti({particleCount:80,spread:60,origin:{y:.6}});
    }
  }
}

function clearMIT() {
  // Nessun confirm() — non affidabile su iOS Safari PWA
  // Usa doppio tap: primo tap mostra toast con undo, secondo esegue
  mitData = {text:'', done:false};
  saveMIT();
  renderMIT();
  // Toast con undo per 4 secondi
  const tid = Date.now();
  window._mitUndo = {id: tid, text: mitData.text};
  toast('Focus di oggi rimosso', 'info');
}


async function suggestMIT() {
  if (!apiKey) { openSettings(); return; }
  ['d','m'].forEach(p => {
    const sp = $(p+'MitSpin'); if(sp) sp.style.display='inline-block';
  });
  const t = toISO();
  const tItems = expand().filter(i => i.data === t && !i.done && (currentProfile !== 'anissa' || i.area !== 'startup'));
  const pend   = items.filter(i => !i.done && i.data < t && !i.recur).slice(0,3);
  const oggi   = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});

  const prompt = currentProfile === 'anissa'
    ? `Sei la coach di Anissa (mamma di Jasper ${jasperMonths()} mesi, Canton Ticino).
Oggi è ${oggi}. Ha questi impegni: ${tItems.length?tItems.map(i=>'"'+i.titolo+'"').join(', '):'agenda libera'}.
Proponi UNA sola cosa concreta e realizzabile che darebbe ad Anissa la sensazione di aver vissuto bene oggi.
Rispondi SOLO con il testo del focus (max 8 parole, senza virgolette, senza punto).`
    : `Sei il coach di Rico (27a, Canton Ticino, Easy Call + CPC + 4 startup + famiglia).
Oggi è ${oggi}. Impegni: ${tItems.length?tItems.map(i=>'"'+i.titolo+'"').join(', '):'agenda libera'}. ${pend.length?'Arretrati: '+pend.map(i=>'"'+i.titolo+'"').join(', '):''}.
Proponi UNA sola cosa concreta che farebbe la differenza oggi — non una lista, UNA cosa.
Rispondi SOLO con il testo (max 8 parole, senza virgolette, senza punto).`;

  try {
    const r = await apiCall([{role:'user', content:prompt}], 50);
    const suggested = r.trim().replace(/^["']|["']$/g,'');
    if (suggested) {
      mitData = {text: suggested, done: false};
      saveMIT();
      renderMIT();
    }
  } catch(e) {
    toast('Errore nella suggerisci MIT', 'warn');
  } finally {
    ['d','m'].forEach(p => {
      const sp = $(p+'MitSpin'); if(sp) sp.style.display='none';
    });
  }
}
