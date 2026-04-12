/* ═══ MEMORIA CROSS-DAY ═══ */
async function saveMemory(histSnap) {
  // Salva riassunto della conversazione di oggi su Supabase
  // histSnap: snapshot sincrona passata prima del reset (evita race condition)
  const hist = histSnap || chatHistory;
  if (!apiKey || hist.length < 3) return;
  const yesterday = dateToISO(new Date(Date.now() - 86400000));
  const key = 'memory_' + currentProfile + '_' + yesterday;
  if (stData[key]) return; // già salvata

  const msgs = hist.slice(0, 20); // max 20 msg da riassumere
  const transcript = msgs
    .filter(m => m && m.role === 'assistant')
    .map(m => m.content.replace(/<[^>]+>/g,'').slice(0,200))
    .join(' | ');
  if (!transcript.trim()) return;

  const prompt = `Riassumi in 2-3 frasi brevi (max 150 parole) questa conversazione coach. 
Tono neutro, fatti concreti, cosa è emerso, cosa è stato deciso o proposto.
Non usare nomi. Inizia con "Ieri:".
CONVERSAZIONE: ${transcript}`;

  try {
    const summary = await apiCall([{role:'user', content:prompt}], 120);
    stData[key] = {summary: summary.trim(), date: yesterday};
    await sbFetch('startup_data', {
      method:'POST',
      prefer:'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify({id: key, data: stData[key]})
    }).catch(e => console.warn('memory sync failed:', e));
    localStorage.setItem('rico_st', JSON.stringify(stData));
  } catch(e) { console.warn('saveMemory:', e); }
}

function loadMemory() {
  // Carica memoria di ieri (già in stData da loadAll)
  const yesterday = dateToISO(new Date(Date.now() - 86400000));
  const key = 'memory_' + currentProfile + '_' + yesterday;
  return stData[key]?.summary || null;
}

/* ═══ CHAT PERSISTENCE (localStorage) ═══ */
function chatKey() { return 'rico_chat_' + currentProfile + '_' + toISO(); }

function saveChatLocal() {
  if (!chatHistory || !chatHistory.length) return;
  try {
    localStorage.setItem(chatKey(), JSON.stringify({
      history: chatHistory,
      briefingDate: briefingDate
    }));
  } catch(e) { console.warn('saveChatLocal:', e); }
}

// Detect old briefing template messages (from before hidden:true flag was added).
// Richiede il prefisso "Sono X." E almeno un altro marker strutturale del template
// per evitare falsi positivi su messaggi legittimi dell'utente.
function isLegacyBriefingPrompt(content) {
  if (!content || typeof content !== 'string') return false;
  if (content.length < 60) return false; // i template veri sono lunghi
  const hasPrefix = /^(Sono Anissa\.|Sono Rico\.)\s/.test(content);
  if (!hasPrefix) return false;
  const hasMarker = content.includes('Cosa mi dici per iniziare')
      || content.includes('Cosa mi dici per oggi')
      || (content.includes('Parla a me') && content.includes('<strong>'))
      || content.includes('Analizza la mia situazione');
  return hasMarker;
}

function loadChatLocal() {
  try {
    const raw = localStorage.getItem(chatKey());
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.history || !data.history.length) return false;
    chatHistory = data.history;
    briefingDate = data.briefingDate || null;
    // Migrazione: marca come hidden i vecchi user prompt template (pre-Round 8)
    let migrated = false;
    chatHistory.forEach(m => {
      if (m.role === 'user' && !m.hidden && isLegacyBriefingPrompt(m.content)) {
        m.hidden = true;
        migrated = true;
      }
    });
    if (migrated) {
      try { localStorage.setItem(chatKey(), JSON.stringify({history:chatHistory, briefingDate})); }
      catch(e) { /* ignora */ }
    }
    // Restore messages to UI
    chatHistory.forEach(m => {
      if (m.hidden) return; // skip internal system prompts (briefing template)
      if (m.role === 'assistant') addChatMessage('all', 'ai', m.content);
      else if (m.role === 'user') addChatMessage('all', 'user', esc(m.content));
    });
    // Update button label if briefing already generated
    if (briefingDate === toISO()) {
      ['d','m'].forEach(p => {
        const lbl = $(p+'AiBtnLbl'); if(lbl) lbl.textContent = '↻ Aggiorna briefing';
      });
    }
    return true;
  } catch(e) { console.warn('loadChatLocal:', e); return false; }
}

function purgeOldChats() {
  const today = toISO();
  Object.keys(localStorage).filter(k => k.startsWith('rico_chat_')).forEach(k => {
    const parts = k.split('_');
    const date = parts[parts.length - 1];
    if (date < today) localStorage.removeItem(k);
  });
}
