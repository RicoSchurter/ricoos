/* ═══ STARTUP VISTA ═══ */
function renderStartup() {
  const today = toISO();
  const weekAgo = dateToISO(new Date(Date.now() - 7*86400000));

  // ── Carico settimanale per area ──
  const weekStart = dateToISO(new Date(Date.now() - 6*86400000));
  const weekItems = items.filter(i => i.data >= weekStart && i.data <= today);
  const areaCount = {};
  weekItems.forEach(i => { areaCount[i.area] = (areaCount[i.area]||0) + 1; });
  const maxCount = Math.max(1, ...Object.values(areaCount));

  const AREA_ORDER_DISPLAY = ['lavoro','cpc','formatore','startup','famiglia','coppia','vacanza','personale_rico','personale_anissa','jasper'];
  const loadBars = AREA_ORDER_DISPLAY
    .filter(k => areaCount[k] > 0)
    .map(k => {
      const a = AREAS[k];
      const cnt = areaCount[k] || 0;
      const pct = Math.round((cnt / maxCount) * 100);
      return `<div class="load-row">
        <span class="load-area-ico">${a.e}</span>
        <span class="load-area-name">${a.l}</span>
        <div class="load-bar-bg"><div class="load-bar-fill" style="width:${pct}%;background:${a.c}"></div></div>
        <span class="load-count">${cnt}</span>
      </div>`;
    }).join('');

  const noLoad = weekItems.length === 0
    ? '<div style="color:var(--dim);font-size:13px;padding:8px 0">Nessun impegno questa settimana</div>'
    : '';

  // ── Card startup ──
  function semaforo(stKey) {
    const stItems = items.filter(i => i.area === 'startup' && i.startupTag === stKey);
    if (!stItems.length) return {cls:'red', lbl:'Nessuna attività'};
    const lastDate = stItems.map(i=>i.data).sort().reverse()[0];
    const daysDiff = Math.floor((new Date() - new Date(lastDate+'T12:00:00')) / 86400000);
    if (daysDiff <= 7)  return {cls:'green',  lbl:'Attiva'};
    if (daysDiff <= 14) return {cls:'yellow', lbl:'In pausa'};
    return {cls:'red', lbl:'Inattiva da ' + daysDiff + 'gg'};
  }

  function nextTask(stKey) {
    const open = items
      .filter(i => i.area === 'startup' && i.startupTag === stKey && !i.done && i.data >= today)
      .sort((a,b) => a.data.localeCompare(b.data));
    return open[0] || null;
  }

  function completedCount(stKey) {
    return items.filter(i => i.area === 'startup' && i.startupTag === stKey && i.done).length;
  }

  const ST_KEYS = ['remychef','zodai','paintquote','freelance'];
  const stCards = ST_KEYS.map(key => {
    const st  = STS[key];
    const sem = semaforo(key);
    const next = nextTask(key);
    const done = completedCount(key);
    const total = items.filter(i => i.area === 'startup' && i.startupTag === key).length;
    const pct = total > 0 ? Math.round((done/total)*100) : 0;

    return `<div class="st-card">
      <div class="st-card-hdr">
        <div class="st-ico">${st.e}</div>
        <div>
          <div class="st-card-name">${esc(st.n)}</div>
          <div class="st-card-desc">${esc(st.d.slice(0,80))}…</div>
        </div>
        <div class="st-semaforo ${sem.cls}" title="${sem.lbl}"></div>
      </div>
      <div class="st-meta">
        <span class="st-meta-pill">${sem.lbl}</span>
        <span class="st-meta-pill">${total} task · ${pct}% completati</span>
        ${done > 0 ? `<span class="st-meta-pill active">✓ ${done} fatti</span>` : ''}
      </div>
      ${next
        ? `<div class="st-next">
            <div class="st-next-lbl">Prossimo task</div>
            ${esc(next.titolo)} · ${next.data.slice(5)}${next.ora?' alle '+esc(next.ora):''}
           </div>`
        : `<div class="st-next" style="color:var(--dim);font-style:italic">Nessun task futuro — aggiungine uno</div>`
      }
      <button class="st-add-btn" onclick="openStartupModal('${key}')">+ Aggiungi task</button>
    </div>`;
  }).join('');

  const html = `<div class="startup-page">
    <div class="startup-section-lbl">📊 Distribuzione settimanale</div>
    <div class="load-grid">${loadBars}${noLoad}</div>
    <div class="startup-section-lbl" style="margin-top:24px">🚀 Startup attive</div>
    ${stCards}
  </div>`;

  const ds = document.getElementById('dv-startup');
  const ms = document.getElementById('mv-startup');
  if (ds) ds.innerHTML = html;
  if (ms) ms.innerHTML = html;
}

function openStartupModal(stKey) {
  // Apre il modal aggiunta con startup preselezionata
  openModal();
  // Imposta area=startup e st=stKey
  fS.area = 'startup';
  fS.st   = stKey;
  setOnePill('gArea', 'startup', 'area');
  setOnePill('gSt',   stKey,    'st');
  document.getElementById('fStField').style.display = 'block';
}

