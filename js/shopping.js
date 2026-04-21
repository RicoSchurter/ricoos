/* ═══ LISTA SPESA ═══
   Due modalità:
    - EDIT:  Anissa compila catalogo. Drag&drop (mouse+touch), qty +/-, note.
    - SHOP:  Rico al supermercato. Solo checkbox gigante "preso", zero edit.
             Attiva auto quando Rico apre la vista "Solo attivi" con item readyAt.
   Storage: tabella items esistente con tipo:'spesa', area:'coppia'.
*/

let shoppingView = 'catalog';       // 'catalog' | 'active'
let shoppingModeOverride = null;    // null | 'edit' | 'shop' (forza manuale)
let _shopDragId = null;             // drag desktop
let _shopTouchDrag = null;          // stato drag mobile

/* ── Helpers container attivo (pattern jasper) ── */
function shoppingActive() {
  return document.getElementById(isMob() ? 'mv-spesa' : 'dv-spesa');
}
function shoppingInactive() {
  return document.getElementById(isMob() ? 'dv-spesa' : 'mv-spesa');
}

/* ── Lista ordinata degli item spesa ── */
function shoppingItems() {
  return items
    .filter(i => i.tipo === 'spesa' && !i.deleted_at)
    .sort((a,b) => (a.order||0) - (b.order||0));
}

function shoppingBadgeCount() {
  return shoppingItems().filter(i => i.active && !i.bought).length;
}

/* ── Mode detection: edit (default) o shop (chiunque in active view con readyAt) ── */
function shoppingMode() {
  if (shoppingModeOverride) return shoppingModeOverride;
  const actives = shoppingItems().filter(i => i.active);
  const hasReady = actives.some(i => i.readyAt);
  // "Solo attivi" con almeno un item readyAt → shop mode automatica (Rico o Anissa)
  if (shoppingView === 'active' && hasReady) return 'shop';
  return 'edit';
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
  ready.forEach(it => { it.readySeenBy = [...(it.readySeenBy||[]), 'rico']; });
  saveItems();
}

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
  const bought  = actives.filter(i => i.bought);
  const isAnissa = currentProfile === 'anissa';
  const mode = shoppingMode();
  const isShop = mode === 'shop';

  // Lista da mostrare
  let list = shoppingView === 'active' ? actives : all;
  if (isShop) {
    // In shop mode: item comprati scendono in fondo
    list = list.slice().sort((a,b) => {
      if (!!a.bought !== !!b.bought) return a.bought ? 1 : -1;
      return (a.order||0) - (b.order||0);
    });
  }

  // HEADER
  const header = isShop ? _shopHeader(actives, bought) : _editHeader(all, actives);

  // TOOLBAR (solo in edit mode, o toggle mode in shop)
  const toolbar = isShop ? _shopToolbar() : _editToolbar(actives);

  // BODY
  let body = '';
  if (!list.length) {
    body = `<div class="sp-empty">
      <div class="sp-empty-sym">🛒</div>
      <div class="sp-empty-msg">${shoppingView==='active'
        ? 'Nessun item attivo. Vai al <b>Catalogo</b> e attivane qualcuno.'
        : 'Catalogo vuoto. Aggiungi con <b>+ Aggiungi</b> o con la <b>voce</b> 🎤.'}</div>
    </div>`;
  } else {
    body = `<div class="sp-list" id="spList" data-mode="${mode}">` +
      list.map((it, idx) => isShop ? shoppingRowShop(it) : shoppingRowEdit(it, idx, list.length)).join('') +
      '</div>';
  }

  // FOOTER
  const footer = _footer(actives, isAnissa, isShop);

  host.innerHTML = `<div class="sp-page" data-mode="${mode}">${header}${toolbar}${body}${footer}</div>`;
  _shopInstallTouchDrag(host);
}

/* ── Header EDIT ── */
function _editHeader(all, actives) {
  return `
    <div class="sp-hdr">
      <div class="sp-ttl">🛒 Lista Spesa</div>
      <div class="sp-sub">${all.length} nel catalogo · ${actives.length} da comprare</div>
    </div>`;
}

/* ── Header SHOP: grande, con progress bar ── */
function _shopHeader(actives, bought) {
  const total = actives.length;
  const done = bought.length;
  const pct = total > 0 ? Math.round(done/total*100) : 0;
  const allDone = total > 0 && done === total;
  return `
    <div class="sp-hdr sp-hdr-shop">
      <div class="sp-shop-top">
        <div class="sp-shop-ttl">🛒 Al supermercato</div>
        <div class="sp-shop-count ${allDone?'done':''}">${done}/${total}</div>
      </div>
      <div class="sp-shop-progress">
        <div class="sp-shop-progress-fill ${allDone?'done':''}" style="width:${pct}%"></div>
      </div>
      ${allDone ? '<div class="sp-shop-allgood">✓ Tutto preso — tap "Spesa finita" sotto</div>' : ''}
    </div>`;
}

/* ── Toolbar EDIT ── */
function _editToolbar(actives) {
  return `
    <div class="sp-toolbar">
      <div class="sp-tabs">
        <button class="sp-tab ${shoppingView==='catalog'?'on':''}" onclick="shoppingSetView('catalog')">📋 Catalogo</button>
        <button class="sp-tab ${shoppingView==='active'?'on':''}" onclick="shoppingSetView('active')">🛒 Solo attivi${actives.length?' ('+actives.length+')':''}</button>
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
    </div>`;
}

/* ── Toolbar SHOP: solo toggle indietro a edit ── */
function _shopToolbar() {
  return `
    <div class="sp-toolbar sp-toolbar-shop">
      <button class="sp-mode-switch" onclick="shoppingForceMode('edit')" title="Torna al catalogo">✏️ Modifica lista</button>
    </div>`;
}

/* ── Footer contestuale ── */
function _footer(actives, isAnissa, isShop) {
  if (!actives.length) return '';
  const anyReady = actives.some(i => i.readyAt);
  const allBought = actives.every(i => i.bought);
  if (isShop) {
    return `<div class="sp-footer">
      <button class="sp-finish-btn ${allBought?'sp-finish-go':''}" onclick="shoppingFinish()">
        ✓ Spesa finita · svuota attivi
      </button>
    </div>`;
  }
  if (isAnissa && !anyReady) {
    return `<div class="sp-footer">
      <button class="sp-ready-btn" onclick="shoppingMarkReady()">✓ Lista pronta · notifica Rico</button>
    </div>`;
  }
  if (!isAnissa) {
    return `<div class="sp-footer">
      <button class="sp-finish-btn" onclick="shoppingFinish()">✓ Spesa finita · svuota attivi</button>
    </div>`;
  }
  if (isAnissa && anyReady) {
    return `<div class="sp-footer">
      <div class="sp-ready-info">✓ Lista inviata a Rico · in attesa della spesa</div>
      <button class="sp-finish-btn sp-finish-ghost" onclick="shoppingFinish()">Annulla invio / reset</button>
    </div>`;
  }
  return '';
}

/* ══════════ ROW EDIT ══════════
   Gerarchia: nome grande, qty chip dorato grande, ± satelliti piccoli,
   unità cliccabile piccola sotto, nota in corsivo, delete soft a destra.
*/
function shoppingRowEdit(it, idx, total) {
  const nome = esc(it.nome || '');
  const unit = esc(it.unit || 'pz');
  const note = esc(it.note || '');
  const qtyStr = _formatQty(it.qty);
  const safeId = esc(it.id);
  const activeCls = it.active ? 'sp-active' : '';
  const readyCls  = it.readyAt ? 'sp-ready' : '';

  return `<div class="sp-row sp-row-edit ${activeCls} ${readyCls}" data-id="${safeId}"
      draggable="true"
      ondragstart="shopDragStart(event,'${safeId}')"
      ondragover="shopDragOver(event)"
      ondragleave="shopDragLeave(event)"
      ondrop="shopDrop(event,'${safeId}')"
      ondragend="shopDragEnd(event)">
    <div class="sp-handle" title="Trascina">☰</div>
    <button class="sp-check ${it.active?'on':''}" onclick="shoppingToggleActive('${safeId}')" title="Da comprare questa settimana">
      ${it.active ? '✓' : ''}
    </button>
    <div class="sp-body">
      <div class="sp-name-row">
        <div class="sp-name" onclick="shoppingEditName('${safeId}')">${nome || '<i>(senza nome)</i>'}</div>
        ${note ? `<div class="sp-note" onclick="shoppingEditNote('${safeId}')"><i>${note}</i></div>` : ''}
      </div>
      <div class="sp-qty-wrap">
        <button class="sp-qty-minus" onclick="shoppingAdjustQty('${safeId}',-1)" title="Meno">−</button>
        <div class="sp-qty-chip" onclick="shoppingEditQty('${safeId}')" title="Tocca per modificare">
          <span class="sp-qty-num">${qtyStr}</span>
          <span class="sp-qty-unit" onclick="event.stopPropagation();shoppingCycleUnit('${safeId}')" title="Cambia unità">${unit}</span>
        </div>
        <button class="sp-qty-plus" onclick="shoppingAdjustQty('${safeId}',1)" title="Più">+</button>
        ${!note ? `<button class="sp-add-note" onclick="shoppingEditNote('${safeId}')" title="Aggiungi nota">＋ nota</button>` : ''}
      </div>
    </div>
    <button class="sp-del" onclick="shoppingDelete('${safeId}')" title="Elimina">×</button>
  </div>`;
}

/* ══════════ ROW SHOP ══════════
   Super-chiaro: tap ovunque sulla riga → toggle bought.
   Nome 22px, qty chip grande, zero controlli edit.
*/
function shoppingRowShop(it) {
  const nome = esc(it.nome || '');
  const unit = esc(it.unit || 'pz');
  const note = esc(it.note || '');
  const qtyStr = _formatQty(it.qty);
  const safeId = esc(it.id);

  return `<div class="sp-row-shop ${it.bought?'sp-bought':''}" data-id="${safeId}"
      onclick="shoppingToggleBought('${safeId}')">
    <div class="sp-shop-check ${it.bought?'on':''}">${it.bought ? '✓' : ''}</div>
    <div class="sp-shop-body">
      <div class="sp-shop-name">${nome || '<i>(senza nome)</i>'}</div>
      ${note ? `<div class="sp-shop-note">📝 ${note}</div>` : ''}
    </div>
    <div class="sp-shop-qty">${qtyStr} <span class="sp-shop-unit">${unit}</span></div>
  </div>`;
}

function _formatQty(q) {
  if (q == null) return '1';
  const n = Number(q);
  if (isNaN(n)) return String(q);
  return n % 1 === 0 ? String(n) : n.toFixed(1).replace(/\.0$/,'');
}

/* ═══ VIEW / MODE SWITCH ═══ */
function shoppingSetView(v) {
  shoppingView = v;
  shoppingModeOverride = null; // torna al comportamento automatico
  renderShopping();
}
function shoppingForceMode(m) {
  shoppingModeOverride = m;
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
    const n = document.getElementById('spAddNome'); if (n) n.value = '';
    const q = document.getElementById('spAddQty');  if (q) q.value = '1';
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
  // Feedback tattile su mobile quando spunta
  if (it.bought && navigator.vibrate) navigator.vibrate(15);
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
  const n = parseFloat(String(v).replace(',', '.'));
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

/* ═══ DESKTOP DRAG (HTML5) ═══ */
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
  _reorderBeforeTarget(fromId, targetId);
  saveItems();
  renderShopping();
}
function shopDragEnd() {
  _shopDragId = null;
  document.querySelectorAll('.sp-row.sp-dragging').forEach(r => r.classList.remove('sp-dragging'));
  document.querySelectorAll('.sp-row.sp-drag-over').forEach(r => r.classList.remove('sp-drag-over'));
}

/* ═══ MOBILE TOUCH DRAG ═══
   Long-press 400ms → riga "si solleva" (scale + shadow + vibrazione).
   Mentre premi e trascini, elementFromPoint trova la riga sotto il dito
   e swap con quella (live reorder). Rilascio → persist.
   Se muovi >10px prima dei 400ms, è uno scroll → cancella il drag.

   Listener strategy: solo touchstart sulla riga; tutti gli altri listener
   sono document-level e vengono rimossi su cleanup — nessun leak tra drag.
*/
function _shopInstallTouchDrag(host) {
  if (!host) return;
  host.querySelectorAll('.sp-row-edit').forEach(row => {
    row.addEventListener('touchstart', _onTouchStart, { passive: true });
  });
}

function _onTouchStart(e) {
  if (e.touches.length !== 1) return;
  // Se esiste già uno state in corso (multitouch o render race), cleanup prima
  if (_shopTouchDrag) _shopCleanupTouch();

  const row = e.currentTarget;
  const t = e.touches[0];
  _shopTouchDrag = {
    id: row.dataset.id,
    row: row,
    startX: t.clientX,
    startY: t.clientY,
    dragging: false,
    timer: null,
  };
  _shopTouchDrag.timer = setTimeout(_onLongPressFire, 400);
  // Pre-drag: document-level listeners (rimossi su cleanup)
  document.addEventListener('touchmove', _onTouchMovePreDrag, { passive: true });
  document.addEventListener('touchend', _onTouchEndAny, { passive: true });
  document.addEventListener('touchcancel', _onTouchEndAny, { passive: true });
}

function _onLongPressFire() {
  if (!_shopTouchDrag) return;
  _shopTouchDrag.dragging = true;
  _shopTouchDrag.row.classList.add('sp-touch-drag');
  if (navigator.vibrate) navigator.vibrate(20);
  // Sostituisci il move pre-drag con il move di drag (non passivo per preventDefault)
  document.removeEventListener('touchmove', _onTouchMovePreDrag);
  document.addEventListener('touchmove', _onTouchMoveDrag, { passive: false });
  // Intercetta il click sintetico che potrebbe seguire touchend (long-press senza slide):
  // eviterebbe di togglare active/bought per sbaglio quando il drag si attiva su un bottone.
  document.addEventListener('click', _blockNextClick, { capture: true, once: true });
}
function _blockNextClick(e) {
  e.stopPropagation();
  e.preventDefault();
}

function _onTouchMovePreDrag(e) {
  if (!_shopTouchDrag || _shopTouchDrag.dragging) return;
  const t = e.touches[0];
  const dx = Math.abs(t.clientX - _shopTouchDrag.startX);
  const dy = Math.abs(t.clientY - _shopTouchDrag.startY);
  if (dx > 10 || dy > 10) {
    // User is scrolling, cancel long-press
    clearTimeout(_shopTouchDrag.timer);
    _shopCleanupTouch();
  }
}

function _onTouchMoveDrag(e) {
  if (!_shopTouchDrag || !_shopTouchDrag.dragging) return;
  e.preventDefault(); // blocca scroll pagina durante drag
  const t = e.touches[0];
  const el = document.elementFromPoint(t.clientX, t.clientY);
  const targetRow = el?.closest('.sp-row-edit');
  if (!targetRow || targetRow === _shopTouchDrag.row) return;
  const targetId = targetRow.dataset.id;
  if (!targetId || targetId === _shopTouchDrag.id) return;

  _reorderBeforeTarget(_shopTouchDrag.id, targetId);
  saveItems();
  renderShopping();

  // Riaggancia il drag state al NUOVO DOM node dopo render
  const newRow = shoppingActive()?.querySelector(`.sp-row-edit[data-id="${_shopTouchDrag.id}"]`);
  if (newRow) {
    newRow.classList.add('sp-touch-drag');
    _shopTouchDrag.row = newRow;
  }
}

function _onTouchEndAny() {
  if (_shopTouchDrag) {
    if (_shopTouchDrag.timer) clearTimeout(_shopTouchDrag.timer);
    if (_shopTouchDrag.dragging && _shopTouchDrag.row) {
      _shopTouchDrag.row.classList.remove('sp-touch-drag');
    }
  }
  _shopCleanupTouch();
  // Safety: se il browser non sintetizza il click post-drag (raro), rimuovi
  // il blocker entro 300ms per evitare di bloccare un click legittimo futuro.
  setTimeout(() => {
    document.removeEventListener('click', _blockNextClick, { capture: true });
  }, 300);
}

function _shopCleanupTouch() {
  document.removeEventListener('touchmove', _onTouchMovePreDrag);
  document.removeEventListener('touchmove', _onTouchMoveDrag);
  document.removeEventListener('touchend', _onTouchEndAny);
  document.removeEventListener('touchcancel', _onTouchEndAny);
  document.querySelectorAll('.sp-touch-drag').forEach(r => r.classList.remove('sp-touch-drag'));
  _shopTouchDrag = null;
}

/* ═══ REORDER ═══ */
function _reorderBeforeTarget(fromId, targetId) {
  const list = shoppingItems();
  const from = list.find(i => i.id === fromId);
  const target = list.find(i => i.id === targetId);
  if (!from || !target) return;
  const targetIdx = list.indexOf(target);
  const fromIdx = list.indexOf(from);
  // Decidi se target viene prima o dopo from nell'ordine attuale
  if (fromIdx < targetIdx) {
    // Stiamo scendendo: inseriamo from DOPO target
    const next = list[targetIdx + 1];
    from.order = next ? ((target.order||0) + (next.order||0)) / 2 : (target.order||0) + 10;
  } else {
    // Stiamo salendo: inseriamo from PRIMA di target
    const prev = list[targetIdx - 1];
    from.order = prev ? ((prev.order||0) + (target.order||0)) / 2 : (target.order||0) - 10;
  }
}

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
  shoppingModeOverride = null;
  renderShopping();
  updateShoppingBadge();
  toast('✓ Spesa archiviata · catalogo pronto per la prossima', 'success');
}

/* ═══ VOCE ═══ */
function startVoiceShopping() {
  if (typeof _voiceRecognition === 'undefined' || !_voiceRecognition) {
    toast('Voce non supportata in questo browser', 'warn'); return;
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

function parseShoppingVoice(raw) {
  const t = (raw || '').toLowerCase().trim();
  if (!t) return { qty: null, unit: null, nome: '' };

  const numMap = { uno:1, una:1, un:1, due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7,
                   otto:8, nove:9, dieci:10, mezzo:0.5, mezza:0.5 };
  const unitMap = {
    chilo:'kg', chili:'kg', chilogrammo:'kg', chilogrammi:'kg', kilogrammo:'kg', kilogrammi:'kg', kg:'kg',
    grammo:'g', grammi:'g', g:'g', gr:'g',
    litro:'L', litri:'L', l:'L', ml:'ml', millilitro:'ml', millilitri:'ml',
    pezzo:'pz', pezzi:'pz', pz:'pz'
  };

  let qty = null, unit = null, rest = t;

  const numWordRe = /^(mezzo|mezza|uno|una|un|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b\s*/i;
  const numDigitRe = /^(\d+(?:[.,]\d+)?)\s*/;
  let m = rest.match(numDigitRe);
  if (m) { qty = parseFloat(m[1].replace(',', '.')); rest = rest.slice(m[0].length); }
  else {
    m = rest.match(numWordRe);
    if (m) { qty = numMap[m[1].toLowerCase()]; rest = rest.slice(m[0].length); }
  }

  const unitRe = /^(chilogrammi|chilogrammo|kilogrammi|kilogrammo|chili|chilo|grammi|grammo|litri|litro|millilitri|millilitro|pezzi|pezzo|kg|gr|g|ml|l|pz)\b\s*/i;
  m = rest.match(unitRe);
  if (m) { unit = unitMap[m[1].toLowerCase()] || null; rest = rest.slice(m[0].length); }

  rest = rest.replace(/^(di|d')\s+/i, '').trim();
  const nome = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';
  return { qty, unit, nome };
}
