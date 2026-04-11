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
      headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},
      body: JSON.stringify({id: key, data: stData[key]})
    }).catch(()=>{});
    localStorage.setItem('rico_st', JSON.stringify(stData));
  } catch(e) { /* silenzioso */ }
}

function loadMemory() {
  // Carica memoria di ieri (già in stData da loadAll)
  const yesterday = dateToISO(new Date(Date.now() - 86400000));
  const key = 'memory_' + currentProfile + '_' + yesterday;
  return stData[key]?.summary || null;
}
