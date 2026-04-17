// Meteo oggi a Locarno (Anissa ama la pioggia → il briefing deve notarlo).
// Riusa lo stesso endpoint Open-Meteo di doWeekend, solo per oggi.
// Fail-safe: se offline/API down ritorna null, il briefing continua senza meteo.
async function fetchMeteoToday() {
  const today = dateToISO(new Date());
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=46.17&longitude=8.80&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FZurich&start_date=${today}&end_date=${today}`);
    const data = await r.json();
    const code = (data.daily.weather_code||[])[0] ?? 0;
    const tMax = Math.round((data.daily.temperature_2m_max||[])[0] ?? 15);
    const tMin = Math.round((data.daily.temperature_2m_min||[])[0] ?? 8);
    const precip = Math.round((data.daily.precipitation_sum||[])[0] ?? 0);
    const isRainy = code >= 51 || precip > 1;
    const isCold = tMax < 8;
    const isHot = tMax > 28;
    const desc = code===0?'sereno':code<=3?'parzialmente nuvoloso':code<=48?'nebbia':code<=67?'pioggia':code<=77?'neve':code<=82?'rovesci':code<=86?'neve':code<=99?'temporale':'variabile';
    return { isRainy, isCold, isHot, tMax, tMin, precip, desc };
  } catch(e) { return null; }
}

/* Formatta una data YYYY-MM-DD in italiano con weekday corto + gg/mm.
   Esempio: "2026-04-15" -> "mer 15/04". Risolve il problema dell'AI che
   sbaglia a calcolare "domani" vs "mercoledi" dalle date ISO secche. */
function fmtDateIt(iso) {
  if (!iso || typeof iso !== 'string') return iso || '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map(n => parseInt(n, 10));
  if (isNaN(y) || isNaN(m) || isNaN(d)) return iso;
  const date = new Date(y, m - 1, d);
  const dow = date.toLocaleDateString('it-IT', { weekday: 'short' });
  return `${dow} ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`;
}

async function doBriefing(forceNew) {
  if (!apiKey) { openSettings(); return; }
  if (briefingLoading) return;
  // Se il briefing di oggi e gia stato generato e non e un refresh forzato, non rigenerare
  if (!forceNew && briefingDate === toISO() && chatHistory.length > 0) return;
  briefingLoading = true;
  [$('dAiBtn'), $('mAiBtn')].forEach(b => { if(b) b.classList.add('loading'); });

  const t      = toISO();
  const sw     = swissNow();
  const oggi   = new Date().toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'});
  const isMon  = new Date().getDay() === 1;
  const meteo  = await fetchMeteoToday(); // null se fallisce, ok
  const tItems = expand().filter(i => i.data === t && isAnissaAiArea(i.area));
  const pend   = items.filter(i => !i.deleted_at && !i.done && i.data < t && !i.recur && isAnissaAiArea(i.area)).slice(0, 5);
  const weekItems = expand().filter(i => i.data > t && i.data <= dateToISO(new Date(Date.now()+7*86400000)) && isAnissaAiArea(i.area));
  const agenda = tItems.length
    ? tItems.map(i => `${i.ora?i.ora+' ':''}"${i.titolo}" [${AREAS[i.area]?.l}]${i.prio==='alta'?' ⚠':''}${i.done?' ✓':''}`).join(', ')
    : 'niente in agenda oggi';
  // Formato arricchito con weekday per evitare che l'AI sbagli "domani" vs giorno reale
  const prossimi = weekItems.slice(0,8).map(i => `${fmtDateIt(i.data)} "${i.titolo}" [${AREAS[i.area]?.l}]`).join(', ');

  let systemPrompt, userPrompt;

  if (currentProfile === 'anissa') {
    const {jm, q} = anissaContext();
    const memoryA = loadMemory();
    systemPrompt = `Sei l'amica di Anissa. Non un coach, non un assistente, non un bot. Sei la voce calda che la fa sorridere senza forzare, che nota le cose piccole, che la capisce prima ancora che le dica.

REGOLA LINGUISTICA: parli sempre e solo al femminile. Stanca, pronta, felice, sicura, presa, bloccata. Mai al maschile, mai al neutro, mai "tutti" generico. Ogni frase che rivolgi ad Anissa deve suonare naturale nel femminile italiano.

CHI È ANISSA: ha 27 anni, vive a Tenero (Canton Ticino). È mamma di Jasper (${jm} mesi). Non allatta (Aptamil). Non beve caffè. Non lavora fuori casa. Passa tutta la giornata con Jasper in braccio, letteralmente: Jasper non dorme mai da solo, fa i pisolini esclusivamente addormentato su di lei. Quando lui dorme, Anissa è bloccata sul divano — non si può muovere, non può dormire a sua volta, non può fare altro. Quindi non dirle mai "approfitta del suo pisolino per riposarti" o "usa quel tempo per X": è impossibile, è una frase che le fa male. Le sue giornate, anche senza appuntamenti, sono faticose. Le notti sono spezzate. È in post-parto: stanca ma sta tornando lei. Sta perdendo peso al suo ritmo, senza pressioni. Ama cucinare, l'ordine in casa, i piccoli rituali di cura come maschere e unghie (per lei non sono vanità, sono il modo di restare se stessa dentro la fatica). Sente la sua famiglia, mamma inclusa, praticamente ogni giorno su WhatsApp o al telefono: quando le parli di loro, dai per scontato che siano in contatto costante. La sua famiglia vive a 200 metri, è un punto fermo. Rico, suo marito, lavora tanto e a volte è assorbito da RemyChef. Lei non lo rimprovera ma a volte sente la distanza: riconoscilo se esce, senza giudicare. Per lei la pioggia è bel tempo. Sul serio: quando piove si sente a casa, calma, protetta. Se oggi piove devi notarlo con gioia, non con rammarico, e magari farle una battuta dolce tipo "hai visto che bella giornata piovosa?".

TONO. Parli come un'amica vera che le sta sul divano, non come un'app che fa il compitino. Calda, sincera, presente, imperfetta. Un tocco leggero, una battuta dolce quando puoi. Frasi naturali scorrevoli, mai telegrafiche. Se ti viene da dire "amore, oggi hai gli occhi stanchi" dillo. Se una frase esce non perfetta va bene, meglio una parola in più con calore che una risposta asciutta costruita bene. Mai sermoni, mai "dovresti", mai frasi da manuale. Vai a fondo quando vale la pena: nota cose, proponi piccoli piaceri concreti (un tè con calma, dieci minuti di silenzio, una maschera dopo Jasper, una ricetta veloce, un messaggio a sua mamma, una canzone sullo speaker). Se l'agenda è stressante dillo con dolcezza, se è libera festeggia la libertà insieme a lei. Se Jasper ha avuto una notte dura parti da lì. Ricordale che quello che fa conta, anche se nessuno lo vede, diglielo a modo tuo e mai con frasi fatte.

REGOLA OWNERSHIP (CRITICA): Anissa non lavora fuori casa, non studia, non ha impegni di lavoro né di scuola né di formazione. Gli impegni nelle aree "lavoro" (Easy Call), "cpc" (CPC Bellinzona, test CCOA/CCOB/CCOC/CCOD/CCOE, inglese), "formatore" (SSEA, esami, tesi), "startup" (RemyChef, ZodAI, PaintQuote, FreelancerAI) e "personale Rico" sono tutti e soli di Rico, NON di Anissa. Le giornate di Anissa ruotano intorno a Jasper, casa, famiglia, se stessa. Mai dirle "hai un test", "hai una lezione", "hai un esame", "hai una riunione", "hai un impegno di lavoro", "questa settimana hai X test" — quei test, lezioni, esami, riunioni sono di Rico, mai di Anissa. Anche se Anissa vede quegli appuntamenti nel suo calendario (così sa quando Rico è impegnato), tu li tratti come se non esistessero per lei: non contarli, non citarli, non commentarli. I dati di contesto che ti arrivano sono già filtrati per escludere gli impegni di Rico: quindi ogni riga che leggi è di Anissa, Jasper o della famiglia. Se, nonostante il filtro, ti arriva qualcosa che suona come scuola/lavoro/formatore/startup/personale Rico, ignoralo totalmente. L'unica startup che Anissa conosce (solo di nome) è RemyChef, ma anche quella è lavoro di Rico.

REGOLA DATE (critica): prima di dire "domani", "dopodomani", "tra X giorni" o qualunque riferimento temporale relativo a un appuntamento, VERIFICA la data dell'appuntamento confrontandola con OGGI (dichiarato nel messaggio). Le date che ti arrivano hanno il formato "mer 15/04" (giorno della settimana + gg/mm) apposta per non farti sbagliare. Se la differenza con oggi è maggiore di 1 giorno NON dire "domani": di' il giorno esatto, esempio "mercoledì 15" o "venerdì prossimo". Errori sulle date sono inaccettabili: preferisci essere esplicita con giorno e numero invece di rischiare "domani" sbagliato.

FORMATO: solo testo scorrevole, paragrafi brevi ma respirati. Usi solo punteggiatura italiana normale — virgole, punti, punto e virgola, punti di domanda. MAI trattini lunghi (—), MAI trattini brevi (-) usati come separatori o al posto della virgola. MAI elenchi puntati, MAI asterischi, MAI markdown, MAI emoji. <strong> solo su 2-3 parole chiave quando vuoi farle notare qualcosa. Italiano naturale e umano.`;

    const meteoLine = meteo
      ? (meteo.isRainy
          ? `Oggi a Tenero piove (${meteo.desc}, ${meteo.tMax}°C). Ricordati che per me la pioggia è bel tempo.`
          : meteo.isCold
            ? `Oggi a Tenero fa freddo (${meteo.desc}, ${meteo.tMax}°C).`
            : meteo.isHot
              ? `Oggi a Tenero fa caldo (${meteo.desc}, ${meteo.tMax}°C).`
              : `Oggi a Tenero ${meteo.desc}, ${meteo.tMax}°C.`)
      : '';

    userPrompt = `Sono Anissa. È ${sw.time} di ${sw.part}, ${oggi}. (data ISO: ${t})
${meteoLine}

Oggi ho: ${agenda}.
${prossimi ? 'Nei prossimi giorni: ' + prossimi + '.' : ''}
${pend.length ? 'Cose ancora aperte: ' + pend.map(i=>`${fmtDateIt(i.data)} "${i.titolo}"`).join(', ') + '.' : ''}

${memoryA ? memoryA : ''}

Parlami. Fammela bella questa giornata, anche se è solo nel modo in cui me la racconti. Quando hai finito, chiudimi con questa domanda: <strong>${q}</strong>`;

  } else {
    systemPrompt = `Sei il coach personale di Rico — non un assistente, non un bot. Sei qualcuno che lo conosce davvero e che gli parla dritto, con rispetto e calore.

CHI SEI TU (Rico): hai 27 anni, vivi a Tenero (Canton Ticino, CH). Hai una moglie, Anissa (27 anni), e un figlio piccolo, Jasper (${jasperMonths()} mesi). Lavori come formatore su reinserimento lavorativo con AI a Easy Call. Studi al CPC Bellinzona ogni mercoledì e giovedì (materie CCOA-CCOE + inglese). Fai il formatore SSEA la sera (esame 2026: tesi + lettera). Hai 4 startup attive in parallelo: RemyChef (SaaS ristoratori Ticino), ZodAI (astrologia iOS/Android USA), PaintQuote AI (preventivi pittori), FreelancerAI (fatturazione freelancer). Sei dislessico — le frasi lunghe ti stancano.

COME PARLI: diretto, umano, concreto. Frasi brevi. Zero sermoni. Zero elenchi puntati. Quando vedi qualcosa che non va nel calendario o nella settimana — dillo, anche se non te lo chiedono. Il tuo valore è vedere le cose che Rico non vede da solo.

QUANDO ANALIZZI IL CALENDARIO: guarda le priorità reali, le cose arretrate, i conflitti di tempo, l'equilibrio lavoro-famiglia-salute. Proponi modifiche se servono (con l'AZIONE da confermare). Sii proattivo — un buon coach non aspetta le domande.

GESTIONE CALENDARIO: puoi aggiungere, spostare, eliminare appuntamenti. Proponi sempre PRIMA l'azione e aspetta la conferma di Rico. Usa questo formato esatto su riga separata:
AZIONE:{"items":[...],"elimina_id":"null"}  (aggiunta)
AZIONE:{"items":[],"elimina_id":"ID"}  (eliminazione)
AZIONE:{"items":[...],"elimina_id":"ID"}  (spostamento)
AZIONE:{"items":[],"elimina_id":"null","modifica_area":{"ids":["ID1","ID2"],"nuova_area":"cpc"}}  (cambio categoria)
I campi item: titolo, data (YYYY-MM-DD), ora (HH:MM o null), area (lavoro/cpc/formatore/startup/famiglia/coppia/vacanza/personale_rico/personale_anissa/jasper), tipo (task/evento/meeting/appuntamento/test/scadenza), prio (alta/media/bassa), note.

REGOLA DATE (critica): prima di dire "domani", "dopodomani", "tra X giorni" o qualunque riferimento temporale relativo a un appuntamento, VERIFICA la data dell'appuntamento confrontandola con OGGI (dichiarato nel messaggio user). Le date che ti arrivano hanno il formato "mer 15/04" (giorno della settimana + gg/mm) apposta per non farti sbagliare. Se la differenza con oggi è maggiore di 1 giorno NON dire "domani": di' il giorno esatto, esempio "mercoledì 15" o "venerdì 17". Errori sulle date sono inaccettabili.

FORMATO RISPOSTE: testo scorrevole, paragrafi. Usa <strong> solo su 2-3 parole chiave. Zero markdown. Italiano. Vai a capo con newline.`;

    const memory = loadMemory();
    userPrompt = `Sono Rico. Sono le ${sw.time} di ${sw.part}, ${oggi}. (data ISO: ${t}). Cosa mi dici per oggi?

Oggi: ${agenda}.
${prossimi ? 'Prossimi 7 giorni: ' + prossimi + '.' : ''}
${pend.length ? 'Arretrati aperti: ' + pend.map(i=>`${fmtDateIt(i.data)} "${i.titolo}"`).join(', ') + '.' : ''}
${isMon ? 'Oggi è lunedì.' : ''}
${memory ? memory : ''}

Analizza la mia situazione. Dimmi cosa conta davvero oggi e come mi organizzo. Sii umano — non un assistant.`;
  }

  try {
    // Reset chat e aggiungi il briefing come PRIMO messaggio
    chatHistory = [];
    ['d','m'].forEach(p => {
      const msgs = $(p+'ChatMsgs'); if(msgs) msgs.innerHTML = '';
      const conf = $(p+'ChatConfirm'); if(conf){conf.style.display='none';conf.innerHTML='';}
    });
    pendingChatAction = null;

    const r = await apiCall([{role:'user', content: userPrompt}], 700, systemPrompt);

    // Il briefing diventa il primo messaggio della conversazione
    // hidden:true perche e il template interno, non va mostrato al refresh
    chatHistory.push({role:'user',    content: userPrompt, hidden: true});
    chatHistory.push({role:'assistant', content: r});
    addChatMessage('all', 'ai', r);

    briefingDate = toISO();
    saveChatLocal();
    // Aggiorna pulsante
    ['d','m'].forEach(p => {
      const lbl = $(p+'AiBtnLbl'); if(lbl) lbl.textContent = '↻ Aggiorna briefing';
    });

  } catch(e) {
    addChatMessage('all', 'ai', 'Errore di connessione. Controlla la API Key nelle impostazioni.');
  } finally {
    briefingLoading = false;
    [$('dAiBtn'), $('mAiBtn')].forEach(b => { if(b) b.classList.remove('loading'); });
  }
}

/* ═══════════════════════════════════════
   CHAT AI
═══════════════════════════════════════ */
// Markdown inline minimale per chat AI: escape HTML prima, poi converti
// i marcatori che l'AI restituisce (**, *, `, #, -) in tag renderizzati.
function mdChat(text) {
  let s = esc(text);
  // Compat: AI a volte restituisce letteralmente <strong>...</strong>
  s = s.replace(/&lt;strong&gt;/g, '<strong>').replace(/&lt;\/strong&gt;/g, '</strong>');
  s = s.replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>');
  // Code inline `...`
  s = s.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
  // Bold **...**
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  // Italic *...* (solo singolo asterisco non adiacente a un altro)
  s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  // Heading markdown a inizio riga -> bold in linea
  s = s.replace(/(^|\n)\s*#{1,6}\s+([^\n]+)/g, '$1<strong>$2</strong>');
  // Bullet list markers a inizio riga
  s = s.replace(/(^|\n)\s*[-*]\s+/g, '$1• ');
  // Newline
  s = s.replace(/\n/g, '<br>');
  return s;
}

function addChatMessage(pfx, role, text) {
  const targets = pfx === 'all' ? ['d','m'] : [pfx];
  targets.forEach(p => {
    const container = $(p + 'ChatMsgs');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    div.innerHTML = mdChat(text);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  });
}

/* Genera un form editabile per un item proposto dall'AI in chat.
   Ogni input scrive direttamente in pendingChatAction.items[idx] via onchange,
   cosi approveChatAction legge i valori aggiornati senza stato intermedio. */
function _chatItemEditForm(it, idx) {
  const personalFallback = currentProfile === 'anissa' ? 'personale_anissa' : 'personale_rico';
  // Remap alias "personale" (output comune dell'AI) alla versione per-profilo
  const rawArea = it.area || '';
  const normalizedArea = rawArea === 'personale' ? personalFallback : rawArea;
  const aiAreaValid = !!(normalizedArea && AREAS[normalizedArea]);
  const selectedArea = aiAreaValid ? normalizedArea : personalFallback;
  // Scrivi il valore corretto anche in pendingChatAction subito, cosi
  // se l'utente conferma senza toccare niente, il fallback viene persistito
  if (!aiAreaValid || rawArea !== normalizedArea) it.area = selectedArea;
  const areaWarn = rawArea && !aiAreaValid ? ' <span style="color:var(--red)" title="Area proposta non valida, corretta automaticamente">⚠</span>' : '';

  const areaOrder = currentProfile === 'anissa'
    ? ['jasper','famiglia','coppia','vacanza','personale_anissa','personale_rico','lavoro','formatore','cpc']
    : ['lavoro','cpc','formatore','startup','famiglia','coppia','vacanza','personale_rico','personale_anissa','jasper'];
  const areaOpts = areaOrder.filter(k => AREAS[k]).map(k =>
    `<option value="${k}" ${k === selectedArea ? 'selected' : ''}>${AREAS[k]?.e||''} ${AREAS[k]?.l||k}</option>`
  ).join('');

  const rawPrio = it.prio && ['alta','media','bassa'].includes(it.prio) ? it.prio : 'media';
  if (it.prio !== rawPrio) it.prio = rawPrio;

  const rawTipo = it.tipo && ['task','evento','appuntamento','meeting','test','scadenza','compito'].includes(it.tipo) ? it.tipo : 'task';
  if (it.tipo !== rawTipo) it.tipo = rawTipo;

  const rawData = (it.data && /^\d{4}-\d{2}-\d{2}$/.test(it.data)) ? it.data : toISO();
  if (it.data !== rawData) it.data = rawData;

  const rawOra = (it.ora && it.ora !== 'null' && /^\d{2}:\d{2}$/.test(it.ora)) ? it.ora : '';
  if (it.ora !== rawOra) it.ora = rawOra;

  const noteLine = it.note ? `<div style="font-size:11px;color:var(--dim);font-style:italic;margin-top:4px">${esc(it.note)}</div>` : '';

  return `<div class="chat-action-item chat-action-edit">
    <div style="font-size:14px;color:var(--txt);margin-bottom:6px">📅 <strong>${esc(it.titolo||'(senza titolo)')}</strong>${areaWarn}</div>
    ${noteLine}
    <div class="qa-edit-row" style="margin-top:8px">
      <select class="qa-edit-sel" onchange="pendingChatAction.items[${idx}].area=this.value">${areaOpts}</select>
      <select class="qa-edit-sel" onchange="pendingChatAction.items[${idx}].prio=this.value">
        <option value="alta" ${rawPrio==='alta'?'selected':''}>⚠ Alta</option>
        <option value="media" ${rawPrio==='media'?'selected':''}>● Media</option>
        <option value="bassa" ${rawPrio==='bassa'?'selected':''}>● Bassa</option>
      </select>
      <select class="qa-edit-sel" onchange="pendingChatAction.items[${idx}].tipo=this.value">
        <option value="task" ${rawTipo==='task'?'selected':''}>Task</option>
        <option value="evento" ${rawTipo==='evento'?'selected':''}>Evento</option>
        <option value="appuntamento" ${rawTipo==='appuntamento'?'selected':''}>Appuntamento</option>
        <option value="meeting" ${rawTipo==='meeting'?'selected':''}>Meeting</option>
        <option value="test" ${rawTipo==='test'?'selected':''}>Test</option>
        <option value="scadenza" ${rawTipo==='scadenza'?'selected':''}>Scadenza</option>
        <option value="compito" ${rawTipo==='compito'?'selected':''}>Compito</option>
      </select>
    </div>
    <div class="qa-edit-row" style="margin-top:6px">
      <input type="date" class="qa-edit-sel" value="${esc(rawData)}" onchange="pendingChatAction.items[${idx}].data=this.value">
      <input type="time" class="qa-edit-sel" value="${esc(rawOra)}" onchange="pendingChatAction.items[${idx}].ora=this.value">
    </div>
  </div>`;
}

function showChatConfirm(action) {
  if (!action) return;
  const eid    = action.elimina_id && action.elimina_id !== 'null' && action.elimina_id !== '' ? action.elimina_id : null;
  const isMove = !!eid && action.items?.length > 0;
  const isDel  = !!eid && !action.items?.length;
  const isAdd  = !eid && action.items?.length > 0;
  const oldIt  = eid ? items.find(i => i.id === eid) : null;

  let title, body;
  if (isDel) {
    title = '🗑 Conferma eliminazione';
    body  = oldIt
      ? `<div class="chat-action-item" style="color:var(--red)">Elimina: <strong>${esc(oldIt.titolo)}</strong> — ${esc(fmtDateIt(oldIt.data))}${oldIt.ora?' alle '+esc(oldIt.ora):''} [${esc(AREAS[oldIt.area]?.l||oldIt.area)}]</div>`
      : `<div class="chat-action-item" style="color:var(--red)">Elimina elemento (ID: ${esc(eid)})</div>`;
  } else if (isMove) {
    title = '↻ Conferma spostamento';
    const oldBlock = oldIt
      ? `<div class="chat-action-item" style="color:var(--red)">🗑 Elimina: <strong>${esc(oldIt.titolo)}</strong> — ${esc(fmtDateIt(oldIt.data))}${oldIt.ora?' alle '+esc(oldIt.ora):''}</div>`
      : '';
    const newBlocks = action.items.map((it, idx) => _chatItemEditForm(it, idx)).join('');
    body = oldBlock + newBlocks;
  } else if (isAdd) {
    title = '✦ Conferma aggiunta';
    body  = action.items.map((it, idx) => _chatItemEditForm(it, idx)).join('');
  } else return;

  const html = `<div class="chat-action-title">${title}</div>${body}
    <div class="chat-action-btns">
      <button class="chat-confirm-btn" onclick="approveChatAction()">✓ Conferma</button>
      <button class="chat-reject-btn" onclick="rejectChatAction()">✗ Annulla</button>
    </div>`;
  ['d','m'].forEach(p => {
    const box = $(p + 'ChatConfirm');
    if (box) { box.innerHTML = html; box.style.display = 'block'; }
  });
}

function approveChatAction() {
  if (!pendingChatAction) return;
  const action = pendingChatAction;
  const eid = action.elimina_id && action.elimina_id !== 'null' && action.elimina_id !== '' ? action.elimina_id : null;

  // Cambio categoria batch
  if (action.modifica_area?.ids?.length && action.modifica_area?.nuova_area) {
    const {ids, nuova_area} = action.modifica_area;
    if (AREAS[nuova_area]) {
      let changed = 0;
      items = items.map(it => {
        if (ids.includes(it.id)) { changed++; return {...it, area: nuova_area}; }
        return it;
      });
      saveItems();
      rejectChatAction();
      renderAll();
      const aInfo = AREAS[nuova_area];
      addChatMessage('all', 'ai', `✓ ${changed} elemento${changed!==1?'i':''} spostati in ${aInfo.e} ${aInfo.l}.`);
      return;
    }
  }

  // Spostamento/eliminazione: soft-delete item originale (trash 7gg, undo disponibile)
  const isPureDelete = eid && !(action.items?.length);
  const deletedTitle = eid ? (items.find(i => i.id === eid)?.titolo || '') : '';
  if (eid) {
    softDeleteItem(eid);
  }

  // Aggiunta nuovi item (se presenti — per eliminazione pura items è []).
  // Gli item sono stati eventualmente editati dall'utente via showChatConfirm,
  // quindi i campi sono gia validi. Il fallback qui e safety net difensivo.
  if (action.items?.length) {
    const personalFallback = currentProfile === 'anissa' ? 'personale_anissa' : 'personale_rico';
    action.items.forEach(it => {
      addItem({
        titolo: it.titolo,
        tipo:   it.tipo   || 'evento',
        area:   (it.area && AREAS[it.area]) ? it.area : personalFallback,
        prio:   it.prio   || 'media',
        ora:    (it.ora && it.ora !== 'null') ? it.ora : '',
        data:   (isValidDate(it.data) ? it.data : toISO()).slice(0,10),
        note:   it.note   || '',
        recur:  '',
      });
    });
  }

  rejectChatAction();
  renderAll();

  const msg = eid && !action.items?.length
    ? `✓ Appuntamento eliminato dal calendario.`
    : eid
      ? `✓ Spostato. Vecchio appuntamento eliminato, nuovo creato.`
      : `✓ ${action.items?.length || 0} elemento${(action.items?.length||0) !== 1 ? 'i' : ''} aggiunto al calendario.`;
  addChatMessage('all', 'ai', msg);

  // Undo toast solo per delete puri (non per move, che sarebbe complesso da annullare)
  if (isPureDelete) {
    const undoId = eid;
    toast('"' + deletedTitle.slice(0,28) + '" eliminato', 'info', {
      label: 'ANNULLA',
      timeout: 5000,
      callback: () => {
        restoreItem(undoId);
        renderAll();
        toast('Ripristinato ✓', 'success');
      }
    });
  }
}

function rejectChatAction() {
  ['d','m'].forEach(p => {
    const box = $(p + 'ChatConfirm');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  });
  pendingChatAction = null;
}

async function doChat(pfx) {
  if (!apiKey) { openSettings(); return; }
  const inp = $(pfx + 'ChatInp');
  const msg = inp.value.trim();
  if (!msg) return;
  inp.value = '';

  addChatMessage(pfx, 'user', esc(msg));
  const loadDiv = document.createElement('div');
  loadDiv.className = 'chat-msg ai loading';
  loadDiv.textContent = '✦ …';
  ['d','m'].forEach(p => { const c = $(p+'ChatMsgs'); if(c){c.appendChild(loadDiv.cloneNode(true)); c.scrollTop=c.scrollHeight;} });

  // Build calendar snapshot for context — include tutti gli item con ID per spostamenti
  const sw = swissNow();
  const sevenAgoCtx = dateToISO(new Date(Date.now() - 7*86400000));

  // Tutti gli item rilevanti con ID (aperti + completati 7gg), ordinati per data
  // Formato arricchito con weekday per evitare che l'AI sbagli a calcolare "domani"
  const allItemsCtx = items
    .filter(i => !i.deleted_at && (!i.done || i.data >= sevenAgoCtx) && isAnissaAiArea(i.area))
    .sort((a,b) => a.data.localeCompare(b.data))
    .slice(0, 120)
    .map(i => `[${i.id}] ${AREAS[i.area]?.e||''} ${i.area} | ${i.titolo} | ${fmtDateIt(i.data)}${i.ora?' '+i.ora:''} (${i.data})${i.done?' ✓fatto':''}`)
    .join('\n');

  // Ancora temporale esplicita: oggi nel formato completo
  const todayFullIt = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const todayIso = toISO();

  const isAnissa = currentProfile === 'anissa';
  const systemBriefing = chatHistory.length > 0 ? '' : ''; // già nel doBriefing

  const system = isAnissa
    ? `Sei l'amica di Anissa. Non un coach, non un assistente, non un bot. Sei la voce calda che la fa sorridere senza forzare, che nota le cose piccole, che la capisce prima ancora che le dica.

OGGI è ${todayFullIt} (data ISO: ${todayIso}). Usa questa data come ancora per qualsiasi riferimento temporale: "domani" è il giorno dopo questa data, non calcoli a memoria.

REGOLA LINGUISTICA: parli sempre e solo al femminile. Stanca, pronta, felice, sicura, presa, bloccata. Mai maschile, mai neutro.

REGOLA DATE (critica): prima di dire "domani", "dopodomani", "tra X giorni" o qualunque riferimento temporale relativo a un appuntamento, VERIFICA la data dell'appuntamento confrontandola con OGGI (dichiarato sopra). Le date degli appuntamenti ti arrivano nel formato "mer 15/04" (weekday + gg/mm) apposta per non farti sbagliare. Se la differenza con oggi è maggiore di 1 giorno NON dire "domani": di' il giorno esatto, esempio "mercoledì 15" o "venerdì prossimo". Sbagliare su una data è inaccettabile: preferisci essere esplicita con giorno e numero invece di rischiare un "domani" sbagliato.

CHI È ANISSA: 27 anni, Tenero (Canton Ticino). Mamma di Jasper (${jasperMonths()} mesi). Non allatta (Aptamil). Non beve caffè. Non lavora fuori casa. Passa tutta la giornata con Jasper in braccio: lui non dorme mai da solo, fa i pisolini esclusivamente su di lei e quando dorme Anissa è bloccata sul divano, non può muoversi né riposare. Le sue giornate sono faticose anche senza appuntamenti. Notti spezzate, post-parto, stanca ma sta tornando lei. Perde peso al suo ritmo, senza pressioni. Ama cucinare, ama l'ordine, si prende cura di sé con piccoli rituali (maschere, unghie). Sente la sua famiglia praticamente ogni giorno su WhatsApp o al telefono. La famiglia vive a 200 metri, è il suo punto fermo. Rico lavora tanto e a volte è assorbito da RemyChef. Per lei la pioggia è bel tempo, sul serio: quando piove si sente a casa, calma, protetta.

TONO. Parli come un'amica vera che le sta sul divano, non come un'app. Calda, sincera, presente, imperfetta. Un tocco leggero, una battuta dolce quando puoi, fai sorridere. Frasi naturali scorrevoli, mai telegrafiche. Mai sermoni, mai "dovresti", mai "approfitta del suo sonno per X" (è impossibile, è bloccata). Vai a fondo quando vale la pena, proponi piccole cose belle (un tè con calma, una ricetta veloce, un messaggio a sua mamma), chiedi davvero come sta. Ricordale che quello che fa conta, anche se nessuno lo vede.

REGOLA OWNERSHIP (CRITICA): Anissa non lavora fuori casa, non studia, non ha impegni di lavoro né di scuola né di formazione. Gli impegni in aree "lavoro" (Easy Call), "cpc" (CPC Bellinzona, test CCOA/CCOB/CCOC/CCOD/CCOE, inglese), "formatore" (SSEA, esami, tesi), "startup" (RemyChef/ZodAI/PaintQuote/FreelancerAI) e "personale Rico" sono tutti di Rico, NON di Anissa. Mai dirle "hai un test", "hai una lezione", "hai un esame", "hai una riunione", "hai un impegno di lavoro", "questa settimana hai X test" — quei test, lezioni, esami, riunioni sono di Rico, non suoi. Anissa li vede nel calendario solo per sapere quando Rico è impegnato. I dati che ricevi sono già filtrati per escludere gli impegni di Rico: ogni riga che leggi è di Anissa, Jasper o della famiglia. Se nonostante il filtro ti arriva una riga con area lavoro/cpc/formatore/startup/personale_rico, trattala come calendario di un'altra persona e ignorala del tutto.

TUTTI GLI APPUNTAMENTI IN MEMORIA (già filtrati per Anissa):
${allItemsCtx}

FORMATO: solo testo scorrevole, paragrafi brevi ma respirati. Usi solo punteggiatura italiana normale (virgole, punti, punto e virgola). MAI trattini lunghi (—), MAI trattini brevi (-) come separatori, MAI elenchi puntati, MAI asterischi, MAI markdown, MAI emoji. <strong> solo su 2-3 parole chiave. Italiano naturale.`

    : `Sei il coach personale di Rico — non un assistente, non un bot. Qualcuno che lo conosce davvero e gli parla dritto.

OGGI è ${todayFullIt} (data ISO: ${todayIso}). Usa questa data come ancora per qualsiasi riferimento temporale relativo: "domani" è il giorno dopo questa data, non calcoli a memoria.

REGOLA DATE (critica): prima di dire "domani", "dopodomani", "tra X giorni" o qualunque riferimento temporale relativo a un appuntamento, VERIFICA la data dell'appuntamento confrontandola con OGGI (dichiarato sopra). Le date degli appuntamenti ti arrivano nel formato "mer 15/04" (weekday + gg/mm) apposta per non farti sbagliare. Se la differenza con oggi è maggiore di 1 giorno NON dire "domani": di' il giorno esatto, esempio "mercoledì 15". Sbagliare su una data è inaccettabile.

CHI SEI TU (Rico): hai 27 anni, vivi a Tenero (Canton Ticino, CH). Moglie Anissa (27a), figlio Jasper (${jasperMonths()} mesi). Lavori come formatore AI a Easy Call. Studi CPC Bellinzona (merc/giov: CCOA-CCOE+inglese). Formatore SSEA serale (esame 2026). 4 startup: RemyChef, ZodAI, PaintQuote AI, FreelancerAI. Sei dislessico — frasi brevi.

COME PARLI: diretto, umano, concreto. Quando vedi qualcosa che non va nel calendario o nella settimana — dillo anche se non te lo chiedono. Il tuo valore è vedere ciò che Rico non vede da solo.

GESTIONE CALENDARIO — proponi sempre l'azione e aspetta conferma. Formato su riga separata:
AZIONE:{"items":[{"titolo":"...","data":"YYYY-MM-DD","ora":"HH:MM","area":"cpc","tipo":"test","prio":"alta","note":""}],"elimina_id":"null"}
AZIONE:{"items":[],"elimina_id":"ID_ITEM"}
AZIONE:{"items":[],"elimina_id":"null","modifica_area":{"ids":["ID1","ID2"],"nuova_area":"cpc"}}

TUTTI GLI APPUNTAMENTI IN MEMORIA:
${allItemsCtx}

ORA SVIZZERA: ${sw.time} (${sw.part}).
FORMATO: testo scorrevole. <strong> su 2-3 parole chiave. Zero markdown. Italiano.`;

  chatHistory.push({role:'user', content: msg});
  // Mantieni al massimo 30 messaggi in memoria (escluso il briefing iniziale)
  if (chatHistory.length > 30) chatHistory = chatHistory.slice(chatHistory.length - 30);

  try {
    const raw = await apiCall(chatHistory, 900, system);
    chatHistory.push({role:'assistant', content: raw});
    if (chatHistory.length > 30) chatHistory = chatHistory.slice(chatHistory.length - 30);
    saveChatLocal();

    // Parse response: separate text from action
    const actionMatch = raw.match(/AZIONE:\s*(\{[\s\S]*\})\s*$/m);
    const textPart = actionMatch ? raw.slice(0, raw.lastIndexOf('AZIONE:')).trim() : raw.trim();

    // Remove loading dots
    document.querySelectorAll('.chat-msg.loading').forEach(el => el.remove());
    addChatMessage(pfx, 'ai', textPart.replace(/\n/g,'<br>'));

    if (actionMatch) {
      try {
        pendingChatAction = JSON.parse(actionMatch[1]);
        showChatConfirm(pendingChatAction);
      } catch(e) { console.warn('AZIONE parse:', e); }
    }
  } catch(e) {
    document.querySelectorAll('.chat-msg.loading').forEach(el => el.remove());
    addChatMessage(pfx, 'ai', 'Errore connessione. Riprova.');
    chatHistory.pop();
  }
}


async function doQA(pfx) {
  if (!apiKey) { openSettings(); return; }
  const inp  = $(pfx + 'QaInp');
  const send = inp.parentElement.querySelector('.qa-send');
  const txt  = inp.value.trim();
  if (!txt) return;

  // Rileva intent di spostamento O eliminazione
  if (/\b(sposta|spostare|posticipa|posticipare|rimanda|rimandare|anticipa|anticipare|riprogramma|sposto|elimina|eliminare|annulla|annullare|cancella|cancellare|togli|rimuovi|cambia categoria|cambia area|metti sotto|sposta sotto|categoria|spostali sotto|mettili sotto|cambiali)\b/i.test(txt)) {
    await doQAMove(txt, pfx);
    return;
  }

  // Disable both input and button during loading
  inp.disabled = true; inp.style.opacity = '.5';
  if (send) { send.disabled = true; send.style.opacity = '.5'; }

  const profileCtx = currentProfile === 'anissa'
    ? 'Sei un parser eventi per Anissa (Canton Ticino, mamma di Jasper). Aree prioritarie: jasper, famiglia, coppia, personale_anissa.'
    : 'Sei un parser eventi per Rico (Canton Ticino, formatore AI + CPC + startup).';
  const prompt=`${profileCtx} Oggi: ${toISO()} (${new Date().toLocaleDateString('it-IT',{weekday:'long'})}).
Testo: "${txt}"
Area: cpc=scuola/test/compito/CCOA-CCOE/inglese; formatore=modulo formatore/SSEA; startup=RemyChef/ZodAI/PaintQuote/Freelance; famiglia=moglie/figlio/Jasper/coppiaactivities; lavoro=Easy Call/corso/riunioni; jasper=attività con Jasper; coppia=attività di coppia; personale_rico=cose personali di Rico; personale_anissa=cose personali di Anissa; resto→personale_rico.
Calcola le date relative (domani, giovedì prossimo...) rispetto a ${toISO()}.
Rispondi SOLO con JSON valido: {"titolo":"...","tipo":"task|evento|test|compito|scadenza|meeting","area":"lavoro|cpc|formatore|startup|famiglia|personale","data":"YYYY-MM-DD","ora":"HH:MM o null","prio":"alta|media|bassa","note":"","st":"remychef|zodai|paintquote|freelance|null","cpc":"CCOA|CCOB|CCOC|CCOD|CCOE|Inglese|null"}`;

  try {
    const raw=await apiCall([{role:'user',content:prompt}],250);
    try { qaRes=JSON.parse(raw.replace(/```json|```/g,'').trim()); }
    catch(e) { toast('Formato AI non valido — riprova','warn'); inp.disabled=false; inp.style.opacity='1'; if(send){send.disabled=false;send.style.opacity='1';} return; }
    const prev=$(pfx+'QaPreview');
    prev.style.display='block';
    // Genera opzioni area visibili per il profilo corrente
    const areaOpts = (currentProfile==='anissa'
      ? ['jasper','famiglia','coppia','vacanza','personale_anissa','personale_rico','lavoro','formatore','cpc']
      : ['lavoro','cpc','formatore','startup','famiglia','coppia','vacanza','personale_rico','personale_anissa','jasper']
    ).map(k => `<option value="${k}" ${qaRes.area===k?'selected':''}>${AREAS[k]?.e||''} ${AREAS[k]?.l||k}</option>`).join('');

    prev.innerHTML=`<div class="qa-ptitle">✦ Ho capito — confermi?</div>
      <div class="qa-pitem">
        <strong style="color:var(--txt)">${esc(qaRes.titolo)}</strong>
        · 📅 ${esc(qaRes.data||'')}${qaRes.ora&&qaRes.ora!=='null'?' alle '+esc(qaRes.ora):''}
        ${qaRes.note?`<br><em style="color:var(--dim);font-size:12px">${esc(qaRes.note)}</em>`:''}
      </div>
      <div class="qa-edit-row">
        <select class="qa-edit-sel" id="${pfx}QaEditArea" onchange="qaRes.area=this.value">${areaOpts}</select>
        <select class="qa-edit-sel" id="${pfx}QaEditPrio" onchange="qaRes.prio=this.value">
          <option value="alta" ${qaRes.prio==='alta'?'selected':''}>⚠ Alta</option>
          <option value="media" ${qaRes.prio==='media'||!qaRes.prio?'selected':''}>● Media</option>
          <option value="bassa" ${qaRes.prio==='bassa'?'selected':''}>● Bassa</option>
        </select>
        <select class="qa-edit-sel" id="${pfx}QaEditTipo" onchange="qaRes.tipo=this.value">
          <option value="task" ${qaRes.tipo==='task'?'selected':''}>Task</option>
          <option value="evento" ${qaRes.tipo==='evento'?'selected':''}>Evento</option>
          <option value="appuntamento" ${qaRes.tipo==='appuntamento'?'selected':''}>Appuntamento</option>
          <option value="meeting" ${qaRes.tipo==='meeting'?'selected':''}>Meeting</option>
          <option value="test" ${qaRes.tipo==='test'?'selected':''}>Test</option>
          <option value="scadenza" ${qaRes.tipo==='scadenza'?'selected':''}>Scadenza</option>
        </select>
      </div>
      <div class="qa-btns">
        <button class="qa-ok" onclick="confirmQA('${pfx}')">✓ Aggiungi</button>
        <button class="qa-no" onclick="rejectQA('${pfx}')">✗ Annulla</button>
      </div>`;
  } catch(e) { toast('Non ho capito, scrivi con più dettagli', 'warn'); }
  inp.disabled = false; inp.style.opacity = '1';
  if (send) { send.disabled = false; send.style.opacity = '1'; }
}

function confirmQA(pfx) {
  if (!qaRes) return;
  // Filter out literal "null" strings that AI might return instead of JSON null
  const cleanSt  = (qaRes.st  && qaRes.st  !== 'null') ? qaRes.st  : null;
  const cleanCpc = (qaRes.cpc && qaRes.cpc !== 'null') ? qaRes.cpc : null;
  addItem({
    titolo: qaRes.titolo,
    tipo:   qaRes.tipo  || 'task',
    area:   (qaRes.area==='personale' ? (currentProfile==='anissa'?'personale_anissa':'personale_rico') : (qaRes.area && AREAS[qaRes.area] ? qaRes.area : (currentProfile==='anissa'?'personale_anissa':'personale_rico'))),
    prio:   qaRes.prio  || 'media',
    ora:    (qaRes.ora  && qaRes.ora  !== 'null') ? qaRes.ora  : '',
    data:   qaRes.data  || toISO(),
    note:   qaRes.note  || '',
    recur:  '',
    st:     cleanSt  || 'remychef',
    cpc:    cleanCpc || 'CCOA',
  });
  rejectQA(pfx);
}
function rejectQA(pfx) {
  $(pfx+'QaInp').value='';
  $(pfx+'QaPreview').style.display='none';
  qaRes=null;
}

/* ═══ SPOSTAMENTO RAPIDO DA QA ═══ */
async function doQAMove(txt, pfx) {
  const inp  = $(pfx + 'QaInp');
  const send = inp?.parentElement?.querySelector('.qa-send');
  if (inp)  { inp.disabled=true;  inp.style.opacity='.5'; }
  if (send) { send.disabled=true; send.style.opacity='.5'; }

  const sevenAgo = dateToISO(new Date(Date.now() - 7*86400000));
  const allItemsCtx = items
    .filter(i => (!i.done || i.data >= sevenAgo) && isAnissaAiArea(i.area))
    .sort((a,b) => a.data.localeCompare(b.data))
    .slice(0, 120)
    .map(i => `[${i.id}] ${i.area} | ${i.titolo} | ${i.data}${i.ora?' '+i.ora:''}${i.done?' (fatto)':''}`)
    .join('\n');

  const prompt = `Sei l'assistente di Rico. Vuole modificare il calendario (spostare, eliminare, annullare o cambiare categoria degli appuntamenti).
Oggi: ${toISO()} (${new Date().toLocaleDateString('it-IT',{weekday:'long'})}).

AREE DISPONIBILI: lavoro, cpc, formatore, startup, famiglia, coppia, vacanza, personale_rico, personale_anissa, jasper

I SUOI APPUNTAMENTI (ID | area | titolo | data ora | stato):
${allItemsCtx}

RICHIESTA: "${txt}"

Rispondi SOLO con JSON valido, NESSUN testo extra, uno di questi formati:

1. Eliminazione singola:
{"tipo":"elimina","elimina_id":"ID_ITEM","riepilogo":"Elimino X del GG/MM"}

2. Eliminazione multipla:
{"tipo":"elimina_multi","elimina_ids":["ID1","ID2","ID3"],"riepilogo":"Elimino N appuntamenti del GG/MM"}

3. Spostamento data:
{"tipo":"sposta","elimina_id":"ID_ITEM","nuovo":{"titolo":"...","data":"YYYY-MM-DD","ora":"HH:MM o null","area":"...","tipo":"...","prio":"...","note":""},"riepilogo":"Sposto X dal GG/MM al GG/MM"}

4. Cambio categoria (singolo o multiplo):
{"tipo":"modifica_area","ids":["ID1","ID2","ID3"],"nuova_area":"cpc","riepilogo":"Sposto N test CCO → CPC"}

5. Chiarimento necessario:
{"tipo":"chiarisci","domanda":"Quale vuoi modificare?","opzioni":[{"id":"ID","label":"titolo — data ora area"}],"elimina_id":null}

6. Data mancante per spostamento:
{"tipo":"chiarisci","domanda":"A che data vuoi spostarlo?","opzioni":[],"elimina_id":"ID_ITEM"}`;

  try {
    const raw = await apiCall([{role:'user', content:prompt}], 400);
    const res = JSON.parse(raw.replace(/```json|```/g,'').trim());
    showQAMovePreview(res, pfx);
  } catch(e) {
    toast('Non ho capito. Scrivi es: "sposta fisioterapia del 17 al 25 aprile"', 'warn');
  }

  if (inp)  { inp.disabled=false;  inp.style.opacity='1'; }
  if (send) { send.disabled=false; send.style.opacity='1'; }
}

function showQAMovePreview(res, pfx) {
  const prev = $(pfx + 'QaPreview');
  if (!prev) return;
  prev.style.display = 'block';

  if (res.tipo === 'modifica_area') {
    const ids       = res.ids || [];
    const nuovaArea = res.nuova_area;
    const areaInfo  = AREAS[nuovaArea];
    if (!areaInfo) { toast('Area non valida', 'warn'); rejectQAMove(pfx); return; }
    const found = ids.map(id => items.find(i => i.id === id)).filter(Boolean);
    qaMove = {tipo:'modifica_area', ids, nuova_area: nuovaArea};
    const listHtml = found.map(it =>
      `<div style="margin-bottom:3px">
        <span style="color:${gc(it.area)}">${AREAS[it.area]?.e||''} ${AREAS[it.area]?.l||it.area}</span>
        → <span style="color:${gc(nuovaArea)}">${areaInfo.e} ${areaInfo.l}</span>
        · <strong>${esc(it.titolo)}</strong>
       </div>`
    ).join('');
    prev.innerHTML = `
      <div class="qa-ptitle">✎ Cambio categoria — confermi?</div>
      <div class="qa-pitem">${listHtml}</div>
      ${res.riepilogo ? `<div style="font-size:12px;color:var(--dim);margin-top:4px;font-style:italic">${esc(res.riepilogo)}</div>` : ''}
      <div class="qa-btns">
        <button class="qa-ok" onclick="confirmQAModArea('${pfx}')">✓ Conferma</button>
        <button class="qa-no" onclick="rejectQAMove('${pfx}')">✗ Annulla</button>
      </div>`;

  } else if (res.tipo === 'elimina') {
    const oldIt = items.find(i => i.id === res.elimina_id);
    qaMove = {tipo:'elimina', elimina_id: res.elimina_id};
    prev.innerHTML = `
      <div class="qa-ptitle">🗑 Elimina — confermi?</div>
      <div class="qa-pitem" style="color:var(--red)">
        ${oldIt ? `<strong>${esc(oldIt.titolo)}</strong> — ${esc(oldIt.data)}${oldIt.ora?' alle '+esc(oldIt.ora):''}` : esc(res.riepilogo||'')}
      </div>
      ${res.riepilogo ? `<div style="font-size:12px;color:var(--dim);margin-top:4px;font-style:italic">${esc(res.riepilogo)}</div>` : ''}
      <div class="qa-btns">
        <button class="qa-ok" style="background:var(--red)" onclick="confirmQADelete('${pfx}')">🗑 Elimina</button>
        <button class="qa-no" onclick="rejectQAMove('${pfx}')">✗ Annulla</button>
      </div>`;

  } else if (res.tipo === 'elimina_multi') {
    const ids = res.elimina_ids || [];
    const found = ids.map(id => items.find(i => i.id === id)).filter(Boolean);
    qaMove = {tipo:'elimina_multi', elimina_ids: ids};
    const listHtml = found.map(it =>
      `<div style="color:var(--red);margin-bottom:3px">🗑 <strong>${esc(it.titolo)}</strong> — ${esc(it.data)}${it.ora?' alle '+esc(it.ora):''}</div>`
    ).join('');
    prev.innerHTML = `
      <div class="qa-ptitle">🗑 Elimina ${found.length} appuntamenti — confermi?</div>
      <div class="qa-pitem">${listHtml}</div>
      <div class="qa-btns">
        <button class="qa-ok" style="background:var(--red)" onclick="confirmQADeleteMulti('${pfx}')">🗑 Elimina tutti</button>
        <button class="qa-no" onclick="rejectQAMove('${pfx}')">✗ Annulla</button>
      </div>`;

  } else if (res.tipo === 'sposta') {
    const eid   = res.elimina_id;
    const nuovo = res.nuovo;
    const oldIt = items.find(i => i.id === eid);
    qaMove = {tipo:'sposta', elimina_id: eid, nuovo};
    prev.innerHTML = `
      <div class="qa-ptitle">↻ Spostamento — confermi?</div>
      <div class="qa-pitem">
        ${oldIt ? `<span style="color:var(--red)">🗑 Elimina: <strong>${esc(oldIt.titolo)}</strong> — ${esc(oldIt.data)}${oldIt.ora?' alle '+esc(oldIt.ora):''}</span><br>` : ''}
        📅 Nuovo: <strong>${esc(nuovo?.titolo||'')}</strong> — ${esc(nuovo?.data||'')}${nuovo?.ora&&nuovo.ora!=='null'?' alle '+esc(nuovo.ora):''}
        ${res.riepilogo ? `<br><em style="color:var(--dim);font-size:12px">${esc(res.riepilogo)}</em>` : ''}
      </div>
      <div class="qa-btns">
        <button class="qa-ok" onclick="confirmQAMove('${pfx}')">↻ Conferma spostamento</button>
        <button class="qa-no" onclick="rejectQAMove('${pfx}')">✗ Annulla</button>
      </div>`;

  } else if (res.tipo === 'chiarisci') {
    if (res.opzioni?.length > 0) {
      // Più item — fai scegliere
      qaMove = {tipo:'chiarisci'};
      const opts = res.opzioni.map(o =>
        `<button class="qa-option-btn" onclick="selectQAMoveItem('${esc(o.id)}','${pfx}')">${esc(o.label)}</button>`
      ).join('');
      prev.innerHTML = `
        <div class="qa-ptitle">↻ ${esc(res.domanda)}</div>
        <div class="qa-move-opts">${opts}</div>
        <div class="qa-btns">
          <button class="qa-no" onclick="rejectQAMove('${pfx}')">✗ Annulla</button>
        </div>`;
    } else {
      // Item chiaro, manca la data
      const eid   = res.elimina_id;
      const oldIt = eid ? items.find(i => i.id === eid) : null;
      const sugDate = oldIt ? suggestNextDate(oldIt) : toISO();
      qaMove = {tipo:'need_date', elimina_id: eid};
      prev.innerHTML = `
        <div class="qa-ptitle">↻ ${esc(res.domanda)}</div>
        ${oldIt ? `<div class="qa-pitem">Sposto: <strong>${esc(oldIt.titolo)}</strong> del ${esc(oldIt.data)}</div>` : ''}
        <div class="riprog-fields" style="margin:10px 0">
          <input type="date" id="${pfx}QaMoveDate" value="${sugDate}" min="${toISO()}">
          <input type="time" id="${pfx}QaMoveTime" value="${esc(oldIt?.ora||'')}">
        </div>
        <div class="qa-btns">
          <button class="qa-ok" onclick="confirmQAMoveDate('${pfx}')">↻ Sposta</button>
          <button class="qa-no" onclick="rejectQAMove('${pfx}')">✗ Annulla</button>
        </div>`;
    }
  } else {
    toast('Non ho trovato l\'appuntamento. Prova a essere più specifico.', 'warn');
    rejectQAMove(pfx);
  }
}

function selectQAMoveItem(id, pfx) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  qaMove = {tipo:'need_date', elimina_id: id};
  const prev    = $(pfx + 'QaPreview');
  const sugDate = suggestNextDate(it);
  prev.innerHTML = `
    <div class="qa-ptitle">↻ Sposta: <strong>${esc(it.titolo)}</strong> del ${esc(it.data)}</div>
    <div class="qa-pitem">Scegli la nuova data e orario:</div>
    <div class="riprog-fields" style="margin:10px 0">
      <input type="date" id="${pfx}QaMoveDate" value="${sugDate}" min="${toISO()}">
      <input type="time" id="${pfx}QaMoveTime" value="${esc(it.ora||'')}">
    </div>
    <div class="qa-btns">
      <button class="qa-ok" onclick="confirmQAMoveDate('${pfx}')">↻ Sposta</button>
      <button class="qa-no" onclick="rejectQAMove('${pfx}')">✗ Annulla</button>
    </div>`;
}

function confirmQAMove(pfx) {
  if (!qaMove?.elimina_id || !qaMove?.nuovo) return;
  const eid   = qaMove.elimina_id;
  const nuovo = qaMove.nuovo;

  softDeleteItem(eid);

  addItem({
    titolo: nuovo.titolo,
    tipo:   nuovo.tipo   || 'evento',
    area:   (nuovo.area && AREAS[nuovo.area]) ? nuovo.area : 'personale',
    prio:   nuovo.prio   || 'media',
    ora:    (nuovo.ora   && nuovo.ora !== 'null') ? nuovo.ora : '',
    data:   (isValidDate(nuovo.data) ? nuovo.data : toISO()).slice(0,10),
    note:   nuovo.note   || '',
    recur:  '',
  });

  rejectQAMove(pfx);
  toast('↻ Appuntamento spostato ✓', 'success');
}

function confirmQAMoveDate(pfx) {
  if (!qaMove?.elimina_id) return;
  const eid     = qaMove.elimina_id;
  const newDate = document.getElementById(pfx + 'QaMoveDate')?.value;
  const newTime = document.getElementById(pfx + 'QaMoveTime')?.value || '';
  if (!newDate) { toast('Seleziona una data', 'warn'); return; }

  const oldIt = items.find(i => i.id === eid);
  if (!oldIt) { toast('Appuntamento non trovato', 'warn'); rejectQAMove(pfx); return; }

  softDeleteItem(eid);

  const newIt = {...oldIt, id:uid(), data:newDate.slice(0,10), ora:newTime, done:false, recur:''};
  delete newIt.deleted_at; // sicurezza: il nuovo item non eredita il trash dal clone
  items.unshift(newIt);
  saveItems();
  rejectQAMove(pfx);
  renderAll();
  toast(`↻ Spostato al ${newDate} ✓`, 'success');
}

function confirmQADelete(pfx) {
  if (!qaMove?.elimina_id) return;
  const eid = qaMove.elimina_id;
  const it  = items.find(i => i.id === eid);
  if (!it) return;
  const title = it.titolo || 'Appuntamento';
  softDeleteItem(eid);
  rejectQAMove(pfx);
  renderAll();
  toast('🗑 ' + title.slice(0,28) + ' eliminato', 'info', {
    label: 'ANNULLA',
    timeout: 5000,
    callback: () => {
      restoreItem(eid);
      renderAll();
      toast('Ripristinato ✓', 'success');
    }
  });
}

function confirmQADeleteMulti(pfx) {
  if (!qaMove?.elimina_ids?.length) return;
  const ids = qaMove.elimina_ids.slice();
  const existing = ids.filter(id => items.find(i => i.id === id && !i.deleted_at));
  const count = existing.length;
  existing.forEach(id => softDeleteItem(id));
  rejectQAMove(pfx);
  renderAll();
  toast(`🗑 ${count} appuntamenti eliminati`, 'info', {
    label: 'ANNULLA',
    timeout: 5000,
    callback: () => {
      existing.forEach(id => restoreItem(id));
      renderAll();
      toast(count + ' ripristinati ✓', 'success');
    }
  });
}

function confirmQAModArea(pfx) {
  if (!qaMove?.ids?.length || !qaMove?.nuova_area) return;
  const {ids, nuova_area} = qaMove;
  if (!AREAS[nuova_area]) { toast('Area non valida', 'warn'); return; }
  let changed = 0;
  items = items.map(it => {
    if (ids.includes(it.id)) { changed++; return {...it, area: nuova_area}; }
    return it;
  });
  saveItems();
  rejectQAMove(pfx);
  renderAll();
  const aInfo = AREAS[nuova_area];
  toast(`✓ ${changed} elemento${changed!==1?'i':''} → ${aInfo.e} ${aInfo.l}`, 'success');
}

function rejectQAMove(pfx) {
  const inp  = $(pfx + 'QaInp');
  const prev = $(pfx + 'QaPreview');
  if (inp)  inp.value = '';
  if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
  qaMove = null;
}



/* ═══════════════════════════════════════
   UPLOAD / SCAN
═══════════════════════════════════════ */
function handleUpload(e) { const f=e.target.files?.[0]; if(f) processFile(f); }

function processFile(file) {
  const reader=new FileReader();
  reader.onload=ev=>{
    upB64=ev.target.result.split(',')[1]; upMime=file.type;
    ['d','m'].forEach(p=>{
      const pr = $(p+'Prev'); pr.style.display = 'block';
      const safeName = esc(file.name);
      pr.innerHTML = file.type.startsWith('image/')
        ? `<img src="${ev.target.result}"><div class="fname">${safeName}</div>`
        : `<div style="font-size:36px;margin-bottom:8px">📄</div><div class="fname">${safeName}</div>`;
      $(p+'ScanBtn').style.display='block';
      $(p+'ExtBox').style.display='none';
      $(p+'ConfBtn').style.display='none';
    });
    extEvs=[];
    setView('upload');
  };
  reader.readAsDataURL(file);
}

async function doScan() {
  if (!apiKey) { openSettings(); return; }
  if (!upB64)  { toast('Carica prima un documento','warn'); return; }

  // Reset e avvia progress bar
  ['d','m'].forEach(p => {
    const b=$(p+'ScanBtn'); b.textContent='Analisi in corso…'; b.disabled=true;
    const prog=$(p+'ScanProg'); if(prog) prog.classList.add('active');
    const bar=$(p+'ScanBar'); if(bar) bar.style.width='5%';
    const lbl=$(p+'ScanLbl'); if(lbl){lbl.textContent='Pass 1: Estrazione…';lbl.classList.add('active');}
  });
  // Anima la barra al 40% durante il pass 1
  setTimeout(()=>['d','m'].forEach(p=>{const b=$(p+'ScanBar');if(b)b.style.width='40%';}), 300);

  const isImg = upMime?.startsWith('image/');

  const extractPrompt = `Sei un estrattore preciso di eventi da documenti per Rico Schurter (Canton Ticino, CH).
Anno corrente: ${new Date().getFullYear()}. Oggi: ${toISO()}.

REGOLE ASSOLUTE:
1. Estrai SOLO eventi con data certa o ricavabile — ignora testo generico e titoli di sezione
2. Date relative ("prossimo lunedì", "tra 2 settimane") → calcola rispetto a oggi ${toISO()}
3. Se manca l'anno → usa ${new Date().getFullYear()} se la data è futura, altrimenti ${new Date().getFullYear() + 1}
4. Orari: formato HH:MM (24h) — se non indicato → null
5. Titolo: breve e descrittivo (max 6 parole), in italiano

CLASSIFICAZIONE AREA (scegli la più specifica):
- "cpc"       → esami, test, lezioni, compiti, materie (CCOA/CCOB/CCOC/CCOD/CCOE/Inglese), CPC, scuola commercio
- "formatore" → moduli formatori, SSEA, tesi, lezioni da docente
- "lavoro"    → Easy Call, corsi, partecipanti, riunioni lavoro
- "startup"   → RemyChef, ZodAI, PaintQuote, FreelancerAI, demo, pitch
- "famiglia"  → appuntamenti con Anissa/Jasper, pediatra, famiglia
- "personale" → medico, fisioterapia, palestra, personale, altro

TIPO (scegli uno): task | evento | test | compito | scadenza | meeting | appuntamento

NOTA: aggiungi dettagli utili solo se presenti nel documento. Se non ci sono → "".

Rispondi SOLO con JSON array valido, senza markdown, senza testo extra:
[{"titolo":"...","data":"YYYY-MM-DD","ora":"HH:MM o null","area":"...","tipo":"...","note":"..."}]
Se non trovi nessun evento → rispondi esattamente: []`;

  const verifyPrompt = `Hai appena estratto questi eventi dal documento:
ESTRAZIONE PASS 1:
{PASS1}

Ora VERIFICA ogni evento rileggendo attentamente il documento originale:
1. La data è corretta? Controlla giorno, mese, anno (anno attuale: ${new Date().getFullYear()})
2. L'area è giusta? (cpc/formatore/lavoro/startup/famiglia/personale)
3. Il tipo è corretto? (task/evento/test/compito/scadenza/meeting/appuntamento)
4. Hai mancato eventi importanti visibili nel documento?
5. Hai incluso testo generico che NON è un evento con data specifica?

Rispondi SOLO con il JSON array finale corretto e completo.
Se la prima estrazione era già corretta → rispondila identica.
Nessun testo extra, nessun markdown: solo il JSON array.`;

  const isPdf = upMime === 'application/pdf';
  const mc1 = (isImg || isPdf)
    ? [
        isPdf
          ? {type:'document', source:{type:'base64', media_type:'application/pdf', data:upB64}}
          : {type:'image', source:{type:'base64', media_type:upMime, data:upB64}},
        {type:'text', text: extractPrompt}
      ]
    : [{type:'text', text:'Documento non leggibile. Restituisci: []'}];

  function parseExtracted(raw) {
    const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
    return Array.isArray(parsed) ? parsed
         : Array.isArray(parsed.eventi) ? parsed.eventi
         : Array.isArray(parsed.events) ? parsed.events
         : [];
  }

  try {
    // ── PASS 1: Estrazione ──
    const raw1 = await apiCall([{role:'user', content: mc1}], 8000);

    // ── PASS 2: Verifica (solo per immagini) ──
    let rawFinal = raw1;
    if (isImg) {
      ['d','m'].forEach(p => {
        const lbl=$(p+'ScanLbl'); if(lbl) lbl.textContent='Pass 2: Verifica e correzione…';
        const bar=$(p+'ScanBar'); if(bar) bar.style.width='70%';
      });
      const vPrompt = verifyPrompt.replace('{PASS1}', raw1);
      const messages = [
        {role:'user',      content: mc1},
        {role:'assistant', content: raw1},
        {role:'user',      content: vPrompt}
      ];
      rawFinal = await apiCall(messages, 8000);
    }

    extEvs = parseExtracted(rawFinal);

    const itemsHtml = extEvs.length
      ? extEvs.map(ev => `<div class="ext-item" style="--ic:${gc(ev.area||'personale')}">
          <div class="ext-title">${esc(ev.titolo)}</div>
          <div class="ext-meta">${esc(ev.data||'data?')} ${esc(ev.ora||'')} · ${esc(AREAS[ev.area]?.l||ev.area||'personale')}</div>
          ${ev.note ? `<div style="font-size:11px;color:var(--dim);margin-top:3px;font-style:italic">${esc(ev.note)}</div>` : ''}
        </div>`).join('')
      : '<p style="color:var(--dim)">Nessun appuntamento trovato.</p>';

    ['d','m'].forEach(p=>{const bar=$(p+'ScanBar');if(bar)bar.style.width='100%';});
    await new Promise(r=>setTimeout(r,300)); // breve pausa per mostrare 100%
    ['d','m'].forEach(p => {
      const box=$(p+'ExtBox'); box.style.display='block';
      box.innerHTML=`<strong style="color:var(--gold2);font-size:11px;letter-spacing:1px">TROVATI (2 pass): ${extEvs.length}</strong><br><br>${itemsHtml}`;
      if(extEvs.length) $(p+'ConfBtn').style.display='block';
    });
  } catch(e) {
    ['d','m'].forEach(p => { const b=$(p+'ExtBox'); b.style.display='block'; b.textContent='Errore analisi. Riprova.'; });
  }

  ['d','m'].forEach(p => { const b=$(p+'ScanBtn'); b.textContent='✦ Analizza con AI'; b.disabled=false; });
}

function confirmExtracted() {
  extEvs.forEach(ev => {
    if (!ev.titolo) return;
    const safeDate = (ev.data || toISO()).slice(0, 10); // always YYYY-MM-DD, never datetime
    const safeOra  = (ev.ora  && ev.ora  !== 'null') ? ev.ora  : '';
    const safeArea = (ev.area && AREAS[ev.area])     ? ev.area : 'personale';
    items.unshift({
      id: uid(), titolo: ev.titolo, tipo: ev.tipo || 'evento',
      area: safeArea, prio: 'media',
      ora: safeOra, data: safeDate,
      note: ev.note || '', recur: '', done: false
    });
  });
  saveItems();
  ['d','m'].forEach(p=>{
    $(p+'ExtBox').innerHTML=`<span style="color:var(--green)">✓ ${extEvs.length} elementi aggiunti!</span>`;
    $(p+'ConfBtn').style.display='none';
  });
  toast(`${extEvs.length} eventi aggiunti ✓`, 'success');
  extEvs = [];
  renderAll();
  checkSmartNotifs();
  scheduleNotifs(); // schedule browser notifications for any new timed events today
}

/* ═══════════════════════════════════════
   WEEKEND
═══════════════════════════════════════ */
async function fetchWeekendWeather() {
  const d = new Date();
  const day = d.getDay();
  const sat = new Date(d); sat.setDate(d.getDate() + (6 - day));
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
  const satStr = dateToISO(sat); const sunStr = dateToISO(sun);
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=46.17&longitude=8.80&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FZurich&start_date=${satStr}&end_date=${sunStr}`);
    const data = await r.json();
    const codes = data.daily.weather_code || [];
    const maxT  = data.daily.temperature_2m_max || [];
    const minT  = data.daily.temperature_2m_min || [];
    const precip= data.daily.precipitation_sum || [];
    const isRainy = codes.some(c => c >= 51) || precip.some(p => p > 3);
    const isCold  = maxT.some(t => t < 8);
    const isHot   = maxT.some(t => t > 28);
    const wmoDesc = c => c===0?'cielo sereno':c<=3?'parzialmente nuvoloso':c<=48?'nebbia':c<=67?'pioggia':c<=77?'neve':c<=82?'rovesci':c<=86?'neve':c<=99?'temporale':'variabile';
    return {
      satMax: Math.round(maxT[0]||15), satMin: Math.round(minT[0]||8),
      sunMax: Math.round(maxT[1]||15), sunMin: Math.round(minT[1]||8),
      satPrecip: Math.round(precip[0]||0), sunPrecip: Math.round(precip[1]||0),
      satDesc: wmoDesc(codes[0]||0), sunDesc: wmoDesc(codes[1]||0),
      isRainy, isCold, isHot
    };
  } catch(e) { return null; }
}

async function doWeekend() {
  if (!apiKey) { openSettings(); return; }
  ['d','m'].forEach(p => {
    const btn = $(p+'WkBtn'); if(btn){btn.style.pointerEvents='none';btn.style.opacity='.6';}
    const sp = $(p+'WkSpin'); if(sp) sp.style.display='block';
  });

  const d = new Date(); const day = d.getDay();
  const sat = new Date(d); sat.setDate(d.getDate()+(6-day));
  const sun = new Date(sat); sun.setDate(sat.getDate()+1);
  const fri = new Date(d); fri.setDate(d.getDate()+(5-day));
  const jm  = jasperMonths();

  const weather = await fetchWeekendWeather();
  let weatherCtx;
  if (weather) {
    weatherCtx = `METEO LOCARNO QUESTO WEEKEND:
- Sabato ${sat.toLocaleDateString('it-IT',{day:'numeric',month:'short'})}: ${weather.satDesc}, ${weather.satMax}°C/${weather.satMin}°C, ${weather.satPrecip}mm pioggia
- Domenica ${sun.toLocaleDateString('it-IT',{day:'numeric',month:'short'})}: ${weather.sunDesc}, ${weather.sunMax}°C/${weather.sunMin}°C, ${weather.sunPrecip}mm pioggia
${weather.isRainy ? '⚠ PIOVE: proponi principalmente attività al coperto o parzialmente coperte.' : weather.isCold ? '❄ FREDDO: attività calde, caffè, musei, passeggiate brevi.' : '☀ BELLO: si può stare all\'aperto tranquillamente.'}`;
  } else {
    weatherCtx = 'Meteo non disponibile. Proponi un mix equilibrato indoor/outdoor adatto alla stagione.';
  }

  const prompt = `Sei un amico locale di Rico che conosce bene il Canton Ticino. NON sei una guida turistica.
${familyContext()} — Jasper ha ${jm} mesi.
${weatherCtx}
OBIETTIVO: far stare bene Anissa. Rico vuole sorprenderla con un weekend di qualità.
WEEKEND: venerdì sera ${fri.toLocaleDateString('it-IT',{day:'numeric',month:'long'})}, sabato e domenica.

Proponi 6 idee concrete per questo weekend specifico. REGOLE:
1. Rico è RESIDENTE a Tenero — non vuole le solite cose da turista (no liste standard di siti web)
2. Jasper ${jm} mesi: passeggino sempre, evita scale/percorsi difficili, considera orari nanna/allattamento
3. Almeno 1 proposta romantica/gesto speciale per Anissa (non necessariamente un'uscita)
4. Almeno 1 proposta venerdì sera (casa o fuori, breve, dopo cena)
5. Adatta RIGOROSAMENTE al meteo indicato sopra
6. Mix equilibrato: natura, cibo/cultura, relax, romantico, pratico
7. Tono: parla direttamente a Rico ("Rico, porta Anissa a...")
8. Se piove: caffè caratteristici nascosti, ateliers artigiani, librerie, piscine coperte, SPA, musei locali — NON proporre Lido o passeggiate all'aperto

Rispondi SOLO con JSON array (esattamente 6 elementi):
[{"categoria":"...","titolo":"...","quando":"sabato mattina|sabato pomeriggio|domenica|venerdì sera","descrizione":"3-4 righe personalizzate, tono amichevole, parla a Rico"}]`;

  try {
    const raw = await apiCall([{role:'user',content:prompt}], 1500);
    const ideas = JSON.parse(raw.replace(/```json|```/g,'').trim());
    const html = ideas.map(i=>`<div class="idea-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div class="idea-tag">${esc(i.categoria)}</div>
        <div style="font-size:11px;color:var(--dim)">${esc(i.quando||'')}</div>
      </div>
      <div class="idea-title">${esc(i.titolo)}</div>
      <div class="idea-desc">${esc(i.descrizione)}</div>
      <button class="idea-add" onclick="addWkEv('${encodeURIComponent(i.titolo)}','${encodeURIComponent(i.quando||'')}')">+ Aggiungi al calendario</button>
    </div>`).join('');
    ['d','m'].forEach(p=>$(p+'WkCards').innerHTML=html);
  } catch(e) {
    ['d','m'].forEach(p=>$(p+'WkCards').innerHTML='<div class="idea-card"><div class="idea-desc">Errore generazione. Riprova.</div></div>');
  }
  ['d','m'].forEach(p=>{
    const btn=$(p+'WkBtn'); if(btn){btn.style.pointerEvents='';btn.style.opacity='';}
    const sp=$(p+'WkSpin'); if(sp) sp.style.display='none';
  });
  checkSmartNotifs();
}

function addWkEv(enc, whenEnc) {
  const t   = decodeURIComponent(enc);
  const when = decodeURIComponent(whenEnc||'');
  const d   = new Date(); const day = d.getDay();
  // Map "quando" to correct date
  let targetDate;
  if (when.includes('venerdì'))       { targetDate = new Date(d); targetDate.setDate(d.getDate()+(5-day)); }
  else if (when.includes('domenica')) { targetDate = new Date(d); targetDate.setDate(d.getDate()+(7-day)); }
  else                                { targetDate = new Date(d); targetDate.setDate(d.getDate()+(6-day)); } // default sabato
  items.unshift({
    id:uid(), titolo:t, tipo:'evento', area:'famiglia',
    prio:'media', ora:'', data:dateToISO(targetDate),
    note:'Idea weekend', recur:'', done:false
  });
  saveItems(); renderAll();
  toast(`"${t.slice(0,25)}" aggiunto ✓`, 'success');
}


/* ═══════════════════════════════════════
   SEARCH
═══════════════════════════════════════ */
/* helper: for recurring items, find nearest occurrence >= today for jumpTo */
function jumpDateFor(it) {
  if (!it.recur) return it.data;
  const t = toISO();
  if (it.data >= t) return it.data;
  const [baseY, baseM, baseD] = it.data.split('-').map(Number);
  for (let i = 0; i < 200; i++) {
    let next;
    if (it.recur === 'weekly')        next = new Date(baseY, baseM - 1, baseD + (i + 1) * 7);
    else if (it.recur === 'biweekly') next = new Date(baseY, baseM - 1, baseD + (i + 1) * 14);
    else {
      const rawMonth = baseM - 1 + (i + 1);
      const tgtY = baseY + Math.floor(rawMonth / 12);
      const tgtM = ((rawMonth % 12) + 12) % 12;
      const maxD = new Date(tgtY, tgtM + 1, 0).getDate();
      next = new Date(tgtY, tgtM, Math.min(baseD, maxD));
    }
    const iso = dateToISO(next);
    if (iso >= t) return iso;
  }
  return t;
}

// Converte testo in data ISO — es. "14 aprile" → "2026-04-14"
function parseSearchDate(q) {
  const MONTHS = {
    'gen':1,'gennaio':1,'feb':2,'febbraio':2,'mar':3,'marzo':3,
    'apr':4,'aprile':4,'mag':5,'maggio':5,'giu':6,'giugno':6,
    'lug':7,'luglio':7,'ago':8,'agosto':8,'set':9,'settembre':9,
    'ott':10,'ottobre':10,'nov':11,'novembre':11,'dic':12,'dicembre':12
  };
  const ql = q.toLowerCase().trim();
  // Pattern: "14 apr" / "14 aprile" / "14/4" / "14-4" / "14.4"
  let m = ql.match(/^(\d{1,2})\s+([a-z]+)$/);
  if (m) {
    const mon = MONTHS[m[2]];
    if (mon) {
      const y = new Date().getFullYear();
      return `${y}-${String(mon).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
  }
  m = ql.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?$/);
  if (m) {
    const d = parseInt(m[1]), mo = parseInt(m[2]);
    const y = m[3] ? (m[3].length===2 ? 2000+parseInt(m[3]) : parseInt(m[3])) : new Date().getFullYear();
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12)
      return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  // Pattern "domani", "oggi", "ieri"
  if (ql === 'oggi')  return toISO();
  if (ql === 'domani') { const d=new Date(); d.setDate(d.getDate()+1); return dateToISO(d); }
  if (ql === 'ieri')   { const d=new Date(); d.setDate(d.getDate()-1); return dateToISO(d); }
  return null;
}

function doSearch(q, pfx) {
  const resId = pfx === 'd' ? 'dSrchRes' : 'mSrchRes';
  const res = $(resId);
  if (!q.trim()) { res.classList.remove('open'); return; }
  const ql = q.toLowerCase();

  // Prova prima a interpretare come data
  const dateISO = parseSearchDate(q.trim());
  let hits;

  if (dateISO) {
    // Cerca tutti gli item (incluse ricorrenze) per quella data
    hits = expand().filter(i => i.data === dateISO && (currentProfile !== 'anissa' || i.area !== 'startup')).slice(0, 8);
  } else {
    hits = items.filter(i =>
      !i.deleted_at &&
      (currentProfile !== 'anissa' || i.area !== 'startup') &&
      (
        i.titolo.toLowerCase().includes(ql) ||
        (i.note||'').toLowerCase().includes(ql) ||
        AREAS[i.area]?.l.toLowerCase().includes(ql) ||
        (i.cpcTag||'').toLowerCase().includes(ql) ||
        (i.startupTag ? (STS[i.startupTag]?.n||'').toLowerCase().includes(ql) : false)
      )
    ).slice(0, 8);
  }
  if (!hits.length) { res.classList.remove('open'); return; }
  res.innerHTML = hits.map(it => {
    const jumpDate = dateISO || jumpDateFor(it); // se ricerca per data, usa data esatta
    const areaE = AREAS[it.area]?.e || '·';
    const areaL = AREAS[it.area]?.l || esc(it.area);
    return `<div class="sr-item" onmousedown="jumpTo('${jumpDate}');event.preventDefault()">
      <div class="sr-title">${esc(it.titolo)}${it.recur ? ' ↻' : ''}</div>
      <div class="sr-meta">${areaE} ${areaL} · ${jumpDate}${it.ora?' · '+esc(it.ora):''} · ${esc(it.tipo)}</div>
    </div>`;
  }).join('');
  res.classList.add('open');
}

// Search blur: close dropdown after short delay (allows click to fire first)
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap') && !e.target.closest('.mob-search')) {
    $('dSrchRes').classList.remove('open');
    $('mSrchRes').classList.remove('open');
  }
});

function jumpTo(date) {
  // Close search dropdowns
  $('dSrchRes').classList.remove('open');
  $('mSrchRes').classList.remove('open');
  $('dSrchInp').value = '';
  $('mSrchInp').value = '';
  agDay = date;
  setView('agenda');
  setTimeout(() => { renderAgenda(); }, 50);
}

/* ═══════════════════════════════════════
   PDF SETTIMANA — download diretto via jsPDF
═══════════════════════════════════════ */
function printWeekPDF(days = 7) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    toast('PDF library non caricata, riprova tra qualche secondo', 'warn');
    return;
  }
  const { jsPDF } = window.jspdf;

  const today = new Date();
  today.setHours(0,0,0,0);
  const dayNames = ['Domenica','Lunedi','Martedi','Mercoledi','Giovedi','Venerdi','Sabato'];
  const t = toISO();
  const expanded = expand();

  // Genera N giorni a partire da oggi
  const daysList = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = dateToISO(d);
    const dayItems = expanded.filter(x => x.data === iso && (currentProfile !== 'anissa' || x.area !== 'startup'))
      .sort((a,b) => (a.ora||'99:99').localeCompare(b.ora||'99:99'));
    daysList.push({ date: d, iso, items: dayItems });
  }

  const endDate = daysList[daysList.length-1].date;
  const periodLabel = days === 7 ? 'Settimana' : days === 15 ? '15 giorni' : 'Mese';
  const profileName = (typeof currentProfile !== 'undefined' && currentProfile === 'anissa') ? 'Anissa' : 'Rico';

  // Init PDF
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = 210, pageH = 297, margin = 14;
  const contentW = pageW - margin*2;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(46, 90, 156);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rico OS - Agenda ${periodLabel}`, margin, 18);

  doc.setFontSize(10);
  doc.setTextColor(102, 102, 102);
  doc.setFont('helvetica', 'normal');
  const startStr = today.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
  const endStr = endDate.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});
  const genStr = new Date().toLocaleString('it-IT',{timeZone:'Europe/Zurich',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  doc.text(`${startStr} -> ${endStr}`, margin, 24);
  doc.text(`Profilo: ${profileName} · Generato il ${genStr}`, margin, 29);

  // Linea separatrice
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, 32, pageW - margin, 32);

  let y = 38;
  const lineH = 4.5;

  function checkPageBreak(neededSpace) {
    if (y + neededSpace > pageH - 15) {
      doc.addPage();
      y = 20;
    }
  }

  daysList.forEach(({date, iso, items: dayItems}) => {
    checkPageBreak(15);

    // Header giorno colorato
    const isPast = iso < t;
    const isToday = iso === t;
    let bgColor;
    if (isToday) bgColor = [212, 168, 67];      // gold
    else if (isPast) bgColor = [180, 180, 180]; // grey
    else bgColor = [46, 90, 156];               // blue

    doc.setFillColor(...bgColor);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    const dayName = dayNames[date.getDay()];
    const dayDate = date.toLocaleDateString('it-IT', {day:'numeric', month:'long'});
    doc.text(`${dayName} ${dayDate}`, margin + 3, y + 5);

    if (dayItems.length) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const countStr = `${dayItems.length} elemento${dayItems.length > 1 ? 'i' : ''}`;
      doc.text(countStr, pageW - margin - 3, y + 5, {align: 'right'});
    }
    y += 9;

    if (!dayItems.length) {
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('Nessun impegno', margin + 4, y + 1);
      y += 6;
    } else {
      dayItems.forEach(it => {
        checkPageBreak(8);

        // Bordo sx colorato per area
        const areaColor = hexToRgb(AREAS[it.area]?.c || '#999');
        doc.setFillColor(...areaColor);
        doc.rect(margin + 2, y - 2, 1.5, 7, 'F');

        // Riga item: ora + titolo
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(10);
        doc.setFont('helvetica', it.done ? 'normal' : 'bold');
        const time = it.ora || '--';
        doc.text(time, margin + 6, y + 1);

        const titleX = margin + 18;
        const titleMaxW = contentW - 22;
        const title = it.titolo + (it.done ? ' (fatto)' : '');
        const titleLines = doc.splitTextToSize(title, titleMaxW);
        doc.text(titleLines[0] || title, titleX, y + 1);
        y += lineH;

        // Meta sotto
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        const areaName = AREAS[it.area]?.l || it.area;
        let meta = `${areaName} · ${it.tipo}`;
        if (it.prio === 'alta') meta += ' · alta priorita';
        if (it.note) meta += ' · ' + it.note.slice(0, 60);
        const metaLines = doc.splitTextToSize(meta, titleMaxW);
        doc.text(metaLines[0] || meta, titleX, y);
        y += lineH;
      });
    }
    y += 3;
  });

  // Footer su tutte le pagine
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(170, 170, 170);
    doc.setFont('helvetica', 'normal');
    doc.text('Rico OS · ricoschurter.github.io/ricoos', pageW/2, pageH - 8, {align:'center'});
    doc.text(`${i} / ${totalPages}`, pageW - margin, pageH - 8, {align:'right'});
  }

  // Salva = trigger download
  const filename = `rico-os-agenda-${days}gg-${toISO()}.pdf`;
  doc.save(filename);
  toast(`PDF ${periodLabel} scaricato ✓`, 'success');
}

// Helper hex -> rgb tuple
function hexToRgb(hex) {
  const m = (hex||'').replace('#','').match(/^([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (!m) return [150, 150, 150];
  return [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)];
}



/* ═══════════════════════════════════════
   NOTIFICATIONS
═══════════════════════════════════════ */
const scheduledNotifIds = new Set(); // prevent duplicate setTimeout per session
