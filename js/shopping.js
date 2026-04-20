/* ═══ LISTA SPESA — catalogo permanente + flag attivo per settimana ═══
   Item condivisi Rico+Anissa (nessun filtro profilo).
   Storage: tabella items esistente con tipo:'spesa', area:'coppia'.
   Shape item spesa:
     {id, tipo:'spesa', area:'coppia', nome, qty, unit, note, order,
      active, bought, readyAt, readySeenBy, createdAt, deleted_at}
*/

let shoppingView = 'catalog'; // 'catalog' | 'active'
let _shopDragId = null;
let _shopLongPressTimer = null;

/* ── Helpers container attivo (pattern jasper) ── */
function shoppingActive() {
  return document.getElementById(isMob() ? 'mv-spesa' : 'dv-spesa');
}
function shoppingInactive() {
  return document.getElementById(isMob() ? 'dv-spesa' : 'mv-spesa');
}

/* ── Lista filtrata degli item spesa ── */
function shoppingItems() {
  return items
    .filter(i => i.tipo === 'spesa' && !i.deleted_at)
    .sort((a,b) => (a.order||0) - (b.order||0));
}

/* ── Badge count: item attivi non ancora comprati ── */
function shoppingBadgeCount() {
  return shoppingItems().filter(i => i.active && !i.bought).length;
}

/* ── Notifica Rico quando Anissa segna lista pronta ── */
function checkShoppingReadyNotification() {
  updateShoppingBadge();
  if (currentProfile !== 'rico') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const ready = shoppingItems().filter(i =>
    i.active && i.readyAt && !(i.readySeenBy||[]).includes('rico')
  );
  if (!ready.length) return;

  new Notification('🛒 Rico OS', {
    body: `Anissa: spesa pronta — ${ready.length} item`,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="80">🛒</text></svg>'
  });

  // Marca come "vista da Rico" per evitare re-notifica ogni reload
  ready.forEach(it => {
    it.readySeenBy = [...(it.readySeenBy||[]), 'rico'];
  });
  saveItems();
}

/* ── Aggiorna badge nel menu ── */
function updateShoppingBadge() {
  const n = shoppingBadgeCount();
  ['sbBadgeSpesa', 'botBadgeSpesa'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 0 ? n : '';
    el.style.display = n > 0 ? '' : 'none';
  });
}

/* ═══ RENDER ═══ */
function renderShopping() {
  const host = shoppingActive();
  const other = shoppingInactive();
  if (other) other.innerHTML = '';
  if (!host) return;

  const all = shoppingItems();
  const actives = all.filter(i => i.active);
  const isAnissa = currentProfile === 'anissa';

  // Lista da mostrare in base alla vista
  const list = shoppingView === 'active' ? actives : all;

  const header = `
    <div class="sp-hdr">
      <div class="sp-ttl">🛒 Lista Spesa</div>
      <div class="sp-sub">${all.length} nel catalogo · ${actives.length} da comprare</div>
    </div>

    <div class="sp-toolbar">
      <div class="sp-tabs">
        <button class="sp-tab ${shoppingView==='catalog'?'on':''}" onclick="shoppingSetView('catalog')">📋 Catalogo</button>
        <button class="sp-tab ${shoppingView==='active'?'on':''}" onclick="shoppingSetView('active')">🛒 Solo attivi (${actives.length})</button>
      </div>
      <div class="sp-actions">
        <button class="sp-btn-voice" id="spVoiceBtn" onclick="startVoiceShopping()" title="Dettatura">🎤</button>
        <button class="sp-btn-add" onclick="shoppingOpenAdd()">+ Aggiungi</button>
      </div>
    </div>

    <div class="sp-add-row" id="spAddRow" style="display:none">
      <input type="text" id="spAddNome" placeholder="Nome prodotto..." onkeydown="if(event.key==='Enter') shoppingSubmitAdd(); if(event.key==='Escape') shoppingCancelAdd()">
      <input type="number" id="spAddQty" value="1" step="0.5" min="0" style="width:70px">
      <select id="spAddUnit">
        ${(typeof SHOPPING_UNITS!=='undefined'?SHOPPING_UNITS:['pz','kg','g','L','ml']).map(u=>`<option value="${u}">${u}</option>`).join('')}
      </select>
      <button class="sp-submit" onclick="shoppingSubmitAdd()">✓</button>
      <button class="sp-cancel" onclick="shoppingCancelAdd()">✗</button>
    </div>
  `;

  let body = '';
  if (!list.length) {
    body = `<div class="sp-empty">
      <div class="sp-empty-sym">🛒</div>
      <div class="sp-empty-msg">${shoppingView==='active' ? 'Nessun item attivo. Vai al <b>Catalogo</b> e attivane qualcuno.' : 'Catalogo vuoto. Aggiungi il primo prodotto con <b>+ Aggiungi</b> o con la <b>voce</b> 🎤.'}</div>
    </div>`;
  } else {
    body = '<div class="sp-list" id="spList">' +
      list.map((it, idx) => shoppingRow(it, idx, list.length)).join('') +
    '</div>';
  }

  // Footer con azioni contestuali
  let footer = '';
  if (actives.length > 0) {
    const anyReady = actives.some(i => i.readyAt);
    if (isAnissa && !anyReady) {
      footer = `<div class="sp-footer">
        <button class="sp-ready-btn" onclick="shoppingMarkReady()">✓ Lista pronta · notifica Rico</button>
      </div>`;
    } else if (!isAnissa) {
      footer = `<div class="sp-footer">
        <button class="sp-finish-btn" onclick="shoppingFinish()">✓ Spesa finita · svuota attivi</button>
      </div>`;
    } else if (isAnissa && anyReady) {
      footer = `<div class="sp-footer">
        <div class="sp-ready-info">✓ Lista inviata a Rico · in attesa della spesa</div>
        <button class="sp-finish-btn" onclick="shoppingFinish()">Annulla invio / reset</button>
      </div>`;
    }
  }

  host.innerHTML = `<div class="sp-page">${header}${body}${footer}</div>`;
  _shopBindDrag();
}

/* ── Row HTML ── */
function shoppingRow(it, idx, total) {
  const activeCls = it.active ? 'sp-active' : '';
  const boughtCls = it.bought ? 'sp-bought' : '';
  const readyCls  = it.readyAt ? 'sp-ready' : '';
  const nome = esc(it.nome || '');
  const unit = esc(it.unit || 'pz');
  const note = esc(it.note || '');
  const qtyStr = _formatQty(it.qty, it.unit);
  const isMobile = isMob();
  const safeId = esc(it.id);

  const handle = isMobile
    ? `<div class="sp-mov">
        <button class="sp-mov-btn" onclick="shoppingMove('${safeId}',-1)" ${idx===0?'disabled':''}>▲</button>
        <button class="sp-mov-btn" onclick="shoppingMove('${safeId}',1)" ${idx===total-1?'disabled':''}>▼</button>
       </div>`
    : `<div class="sp-handle" title="Trascina">☰</div>`;

  // Per Rico in vista attiva: checkbox "preso" al posto di active
  const showBought = (currentProfile === 'rico' && shoppingView === 'active');
  const mainCheck = showBought
    ? `<button class="sp-check ${it.bought?'on':''}" onclick="shoppingToggleBought('${safeId}')" title="Preso">
         ${it.bought ? '✓' : ''}
       </button>`
    : `<button class="sp-check ${it.active?'on':''}" onclick="shoppingToggleActive('${safeId}')" title="Da comprare">
         ${it.active ? '✓' : ''}
       </button>`;

  return `<div class="sp-row ${activeCls} ${boughtCls} ${readyCls}" data-id="${safeId}"
      ${isMobile?'':`draggable="true" ondragstart="shopDragStart(event,'${safeId}')" ondragover="shopDragOver(event)" ondragleave="shopDragLeave(event)" ondrop="shopDrop(event,'${safeId}')" ondragend="shopDragEnd(event)"`}>
    ${handle}
    ${mainCheck}
    <div class="sp-body">
      <div class="sp-name" onclick="shoppingEditName('${safeId}')">${nome || '<i>(senza nome)</i>'}</div>
      <div class="sp-qty-wrap">
        <button class="sp-qty-btn" onclick="shoppingAdjustQty('${safeId}',-1)">−</button>
        <span class="sp-qty" onclick="shoppingEditQty('${safeId}')">${qtyStr} ${unit}</span>
        <button class="sp-qty-btn" onclick="shoppingAdjustQty('${safeId}',1)">+</button>
        <button class="sp-unit-btn" onclick="shoppingCycleUnit('${safeId}')" title="Cambia unità">${unit}</button>
      </div>
      ${note ? `<div class="sp-note" onclick="shoppingEditNote('${safeId}')">📝 ${note}</div>` : `<button class="sp-add-note" onclick="shoppingEditNote('${safeId}')">+ nota</button>`}
    </div>
    <button class="sp-del" onclick="shoppingDelete('${safeId}')" title="Elimina">×</button>
  </div>`;
}

function _formatQty(q, unit) {
  if (q == null) return '1';
  const n = Number(q);
  if (isNaN(n)) return String(q);
  // Mostra decimale solo se necessario
  return n % 1 === 0 ? String(n) : n.toFixed(1).replace(/\.0$/,'');
}

/* ═══ VIEW SWITCH ═══ */
function shoppingSetView(v) {
  shoppingView = v;
  renderShopping();
}

/* ═══ ADD ITEM ═══ */
function shoppingOpenAdd() {
  const row = document.getElementById('spAddRow');
  if (row) {
    row.style.display = 'flex';
    setTimeout(() => document.getElementById('spAddNome')?.focus(), 50);
  }
}
function shoppingCancelAdd() {
  const row = document.getElementById('spAddRow');
  if (row) {
    row.style.display = 'none';
    document.getElementById('spAddNome').value = '';
    document.getElementById('spAddQty').value = '1';
  }
}
function shoppingSubmitAdd() {
  const nome = document.getElementById('spAddNome')?.value.trim();
  const qty  = parseFloat(document.getElementById('spAddQty')?.value) || 1;
  const unit = document.getElementById('spAddUnit')?.value || 'pz';
  if (!nome) { toast('Inserisci un nome', 'warn'); return; }
  shoppingAddItem({ nome, qty, unit, active: true });
  shoppingCancelAdd();
  toast(`+ ${nome}`, 'success');
}

function shoppingAddItem({ nome, qty, unit, note, active }) {
  const maxOrder = shoppingItems().reduce((m,i) => Math.max(m, i.order||0), 0);
  const it = {
    id: 'sp_' + uid(),
    tipo: 'spesa',
    area: 'coppia',
    nome: nome,
    qty: qty != null ? qty : 1,
    unit: unit || 'pz',
    note: note || '',
    order: maxOrder + 10,
    active: active === true,
    bought: false,
    readyAt: null,
    readySeenBy: [],
    createdAt: new Date().toISOString(),
  };
  items.push(it);
  saveItems();
  renderShopping();
  updateShoppingBadge();
  return it;
}

/* ═══ TOGGLES ═══ */
function shoppingToggleActive(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  it.active = !it.active;
  if (!it.active) { it.bought = false; it.readyAt = null; it.readySeenBy = []; }
  saveItems();
  renderShopping();
  updateShoppingBadge();
}
function shoppingToggleBought(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  it.bought = !it.bought;
  saveItems();
  renderShopping();
  updateShoppingBadge();
}

/* ═══ QTY / UNIT / NOTE / NAME ═══ */
function shoppingAdjustQty(id, delta) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const step = (typeof SHOPPING_UNIT_STEPS !== 'undefined' && SHOPPING_UNIT_STEPS[it.unit]) || 1;
  const next = Math.max(0, (Number(it.qty)||0) + delta*step);
  it.qty = Math.round(next*100)/100;
  saveItems();
  renderShopping();
}
function shoppingEditQty(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const v = prompt(`Quantità di "${it.nome}" (${it.unit}):`, it.qty);
  if (v === null) return;
  const n = parseFloat(v.replace(',', '.'));
  if (isNaN(n) || n < 0) { toast('Numero non valido', 'warn'); return; }
  it.qty = n;
  saveItems();
  renderShopping();
}
function shoppingCycleUnit(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const units = (typeof SHOPPING_UNITS !== 'undefined') ? SHOPPING_UNITS : ['pz','kg','g','L','ml'];
  const idx = units.indexOf(it.unit);
  it.unit = units[(idx + 1) % units.length];
  saveItems();
  renderShopping();
}
function shoppingEditName(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const v = prompt('Nome:', it.nome);
  if (v === null) return;
  const nv = v.trim();
  if (!nv) { toast('Nome vuoto', 'warn'); return; }
  it.nome = nv;
  saveItems();
  renderShopping();
}
function shoppingEditNote(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const v = prompt('Nota (es. "bio", "solo Coop"):', it.note || '');
  if (v === null) return;
  it.note = v.trim();
  saveItems();
  renderShopping();
}

/* ═══ DELETE ═══ */
function shoppingDelete(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  softDeleteItem(id);
  renderShopping();
  updateShoppingBadge();
  toast(`"${it.nome.slice(0,20)}" eliminato`, 'info', {
    label: 'ANNULLA',
    timeout: 5000,
    callback: () => { restoreItem(id); renderShopping(); updateShoppingBadge(); }
  });
}

/* ═══ MOVE (mobile) / DRAG (desktop) ═══ */
function shoppingMove(id, dir) {
  const list = shoppingItems();
  const idx = list.findIndex(i => i.id === id);
  if (idx < 0) return;
  const swap = list[idx + dir];
  if (!swap) return;
  const it = list[idx];
  const tmp = it.order || 0;
  it.order = swap.order || 0;
  swap.order = tmp;
  // Se order è uguale, aggiusta
  if (it.order === swap.order) {
    it.order += dir;
  }
  saveItems();
  renderShopping();
}

function shopDragStart(e, id) {
  _shopDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', id); } catch(_){}
  e.currentTarget.classList.add('sp-dragging');
}
function shopDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const row = e.currentTarget;
  if (row && !row.classList.contains('sp-drag-over')) row.classList.add('sp-drag-over');
}
function shopDragLeave(e) {
  e.currentTarget?.classList.remove('sp-drag-over');
}
function shopDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget?.classList.remove('sp-drag-over');
  const fromId = _shopDragId;
  if (!fromId || fromId === targetId) return;
  const list = shoppingItems();
  const from = list.find(i => i.id === fromId);
  const target = list.find(i => i.id === targetId);
  if (!from || !target) return;
  const targetIdx = list.indexOf(target);
  const prev = list[targetIdx - 1];
  const next = list[targetIdx];
  // Inserisci prima del target
  if (!prev) {
    from.order = (target.order || 10) - 10;
  } else if (prev.id === from.id) {
    // dropping on sé stesso dopo (spostamento in basso)
    from.order = (next && next.order ? next.order : 9999) + 5;
  } else {
    from.order = ((prev.order || 0) + (target.order || 0)) / 2;
  }
  saveItems();
  renderShopping();
}
function shopDragEnd(e) {
  _shopDragId = null;
  document.querySelectorAll('.sp-row.sp-dragging').forEach(r => r.classList.remove('sp-dragging'));
  document.querySelectorAll('.sp-row.sp-drag-over').forEach(r => r.classList.remove('sp-drag-over'));
}
function _shopBindDrag() { /* no-op: handlers inline sulle row */ }

/* ═══ LIST READY / FINISH ═══ */
function shoppingMarkReady() {
  const actives = shoppingItems().filter(i => i.active);
  if (!actives.length) { toast('Nessun item attivo', 'warn'); return; }
  const now = new Date().toISOString();
  actives.forEach(it => {
    it.readyAt = now;
    it.readySeenBy = [];
  });
  saveItems();
  renderShopping();
  updateShoppingBadge();
  toast(`✓ Lista inviata a Rico (${actives.length} item)`, 'success');
}

function shoppingFinish() {
  const actives = shoppingItems().filter(i => i.active);
  if (!actives.length) { toast('Nessun item attivo', 'warn'); return; }
  if (!confirm(`Confermi? I ${actives.length} item attivi torneranno al catalogo.`)) return;
  actives.forEach(it => {
    it.active = false;
    it.bought = false;
    it.readyAt = null;
    it.readySeenBy = [];
  });
  saveItems();
  shoppingView = 'catalog';
  renderShopping();
  updateShoppingBadge();
  toast('✓ Spesa archiviata · catalogo pronto per la prossima', 'success');
}

/* ═══ VOCE — riusa _voiceRecognition di ai.js ═══ */
function startVoiceShopping() {
  if (typeof _voiceRecognition === 'undefined' || !_voiceRecognition) {
    toast('Voce non supportata in questo browser', 'warn');
    return;
  }
  if (_voiceActive) { _voiceRecognition.stop(); return; }

  const btn = document.getElementById('spVoiceBtn');
  _voiceActive = true;
  if (btn) btn.classList.add('listening');

  _voiceRecognition.onresult = (e) => {
    const transcript = (e.results[0][0].transcript || '').trim();
    if (!transcript) return;
    const parsed = parseShoppingVoice(transcript);
    if (!parsed.nome) { toast('Non ho capito: "' + transcript + '"', 'warn'); return; }
    // Match fuzzy con catalogo esistente
    const existing = shoppingItems().find(i =>
      (i.nome||'').toLowerCase().trim() === parsed.nome.toLowerCase().trim()
    );
    if (existing) {
      existing.qty = parsed.qty != null ? parsed.qty : existing.qty;
      if (parsed.unit) existing.unit = parsed.unit;
      existing.active = true;
      saveItems();
      renderShopping();
      updateShoppingBadge();
      toast(`✓ ${existing.nome} (${existing.qty} ${existing.unit})`, 'success');
    } else {
      shoppingAddItem({
        nome: parsed.nome,
        qty: parsed.qty != null ? parsed.qty : 1,
        unit: parsed.unit || 'pz',
        active: true
      });
    }
  };
  _voiceRecognition.onerror = (e) => {
    toast('Errore microfono — ' + (e.error === 'not-allowed' ? 'abilita il microfono' : e.error), 'warn');
  };
  _voiceRecognition.onend = () => {
    _voiceActive = false;
    document.getElementById('spVoiceBtn')?.classList.remove('listening');
  };
  try { _voiceRecognition.start(); }
  catch(e) {
    _voiceActive = false;
    if (btn) btn.classList.remove('listening');
  }
}

/* ── Parser voce italiano ──
   Accetta: "tre chili di patate", "500 grammi pasta", "mezzo litro latte", "pane", "2 yogurt"
*/
function parseShoppingVoice(raw) {
  const t = (raw || '').toLowerCase().trim();
  if (!t) return { qty: null, unit: null, nome: '' };

  const numMap = { uno:1, una:1, un:1, due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7,
                   otto:8, nove:9, dieci:10, mezzo:0.5, mezza:0.5, 'mezzo chilo':0.5 };
  const unitMap = {
    chilo:'kg', chili:'kg', chilogrammo:'kg', chilogrammi:'kg', kilogrammo:'kg', kilogrammi:'kg', kg:'kg',
    grammo:'g', grammi:'g', g:'g', gr:'g',
    litro:'L', litri:'L', l:'L', ml:'ml', millilitro:'ml', millilitri:'ml',
    pezzo:'pz', pezzi:'pz', pz:'pz', 'pz.':'pz'
  };

  let qty = null, unit = null, rest = t;

  // 1) Cerca numero (cifra o parola) all'inizio
  const numWordRe = /^(mezzo|mezza|uno|una|un|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b\s*/i;
  const numDigitRe = /^(\d+(?:[.,]\d+)?)\s*/;
  let m = rest.match(numDigitRe);
  if (m) { qty = parseFloat(m[1].replace(',', '.')); rest = rest.slice(m[0].length); }
  else {
    m = rest.match(numWordRe);
    if (m) { qty = numMap[m[1].toLowerCase()]; rest = rest.slice(m[0].length); }
  }

  // 2) Cerca unità
  const unitRe = /^(chilogrammi|chilogrammo|kilogrammi|kilogrammo|chili|chilo|grammi|grammo|litri|litro|millilitri|millilitro|pezzi|pezzo|kg|gr|g|ml|l|pz)\b\s*/i;
  m = rest.match(unitRe);
  if (m) { unit = unitMap[m[1].toLowerCase()] || null; rest = rest.slice(m[0].length); }

  // 3) Rimuovi "di" / "d'" di collegamento
  rest = rest.replace(/^(di|d')\s+/i, '').trim();

  // 4) Capitalizza prima lettera del nome
  const nome = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';

  return { qty, unit, nome };
}
