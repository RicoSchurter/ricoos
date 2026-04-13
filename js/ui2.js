function scheduleNotifs() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const t = toISO();
  const now = new Date();
  expand().filter(i => i.data === t && i.ora && !i.done && (currentProfile !== 'anissa' || i.area !== 'startup')).forEach(it => {
    const notifId = it.recurChild ? it.parentId : it.id;
    if (scheduledNotifIds.has(notifId)) return; // already scheduled this session
    const [h, m] = it.ora.split(':').map(Number);
    const ev = new Date(); ev.setHours(h, m, 0, 0);
    const delay = ev - now - 10 * 60 * 1000; // 10 min before
    if (delay > 0 && delay < 8 * 3600 * 1000) {
      scheduledNotifIds.add(notifId);
      setTimeout(() => {
        // Verify item still exists and is not done before firing
        const stillExists = items.some(i => i.id === notifId && !i.done);
        if (!stillExists) return;
        new Notification('Rico OS — Promemoria', {
          body: `"${it.titolo}" tra 10 minuti (${it.ora})`,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">◈</text></svg>'
        });
      }, delay);
    }
  });
}

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
function toast(msg, type='info', action=null) {
  const w=$('toastWrap');
  const d=document.createElement('div');
  d.className=`toast ${type}`;
  const lifeMs = action ? (action.timeout || 5000) : 3000;
  if (action) {
    const txt=document.createElement('span'); txt.className='toast-txt'; txt.textContent=msg;
    const btn=document.createElement('button'); btn.className='toast-action'; btn.textContent=action.label||'ANNULLA';
    btn.onclick=(e)=>{
      e.stopPropagation();
      try { action.callback && action.callback(); } catch(err) { console.warn('toast action:', err); }
      d.style.opacity='0'; d.style.transition='opacity .2s'; setTimeout(()=>d.remove(),200);
    };
    d.appendChild(txt); d.appendChild(btn);
  } else {
    d.textContent=msg;
  }
  w.appendChild(d);
  setTimeout(()=>{ d.style.opacity='0'; d.style.transition='opacity .3s'; setTimeout(()=>d.remove(),300); }, lifeMs);
}

/* ═══════════════════════════════════════
   CONFETTI
═══════════════════════════════════════ */
function confetti() {
  const c=$('confettiC');
  if(c.dataset.done==='1') return; c.dataset.done='1';
  const cols=['#d4a843','#f0c860','#4db8f0','#3ecfa0','#b088f0','#f07878','#60d080'];
  for(let i=0;i<55;i++){
    const el=document.createElement('div'); el.className='cft';
    el.style.cssText=`left:${Math.random()*100}%;background:${cols[~~(Math.random()*cols.length)]};animation-duration:${.8+Math.random()*1.4}s;animation-delay:${Math.random()*.5}s;width:${6+~~(Math.random()*8)}px;height:${6+~~(Math.random()*8)}px;border-radius:${Math.random()>.5?'50%':'2px'};`;
    c.appendChild(el);
  }
  setTimeout(()=>{ c.innerHTML=''; c.dataset.done=''; },3500);
  toast('🎉 Tutto completato! ' + (currentProfile==='anissa' ? 'Bravissima Anissa!' : 'Bravo Rico!'), 'success');
}

/* ═══════════════════════════════════════
   SMART NOTIFICATION SYSTEM
═══════════════════════════════════════ */

// Session-level dismissed banner IDs (reset on page reload, not persisted)
const dismissedBanners = new Set();

// Keys stored in localStorage to avoid repeating the same notif
function notifKey(type) {
  const d = toISO();
  if (type === 'morning') return `notif_morning_${d}`;
  if (type === 'evening') return `notif_evening_${d}`;
  if (type === 'monday')  return `notif_monday_${d}`;
  return `notif_${type}_${d}`;
}
function notifSeen(type) { return localStorage.getItem(notifKey(type)) === '1'; }
function notifMark(type) { localStorage.setItem(notifKey(type), '1'); }

function dismissNotif(id) {
  dismissedBanners.add(id); // remember for this session
  const el = document.getElementById(id);
  if (el) {
    el.style.animation = 'slideDown .2s ease reverse';
    setTimeout(() => el.remove(), 180);
  }
}

function makeBanner({id, type, ico, title, msg}) {
  // Escape both title and msg — they may contain user item titles
  return `<div class="notif-banner ${type}" id="${esc(id)}">
    <span class="nb-ico">${ico}</span>
    <div class="nb-body">
      <div class="nb-title">${esc(title)}</div>
      <div class="nb-msg">${esc(msg)}</div>
    </div>
    <button class="notif-dismiss" onclick="dismissNotif('${esc(id)}')">×</button>
  </div>`;
}

function checkSmartNotifs() {
  const now    = new Date();
  const h      = now.getHours();
  const t      = toISO();
  const day    = now.getDay(); // 0=Dom, 1=Lun...
  const allExp = expand();

  // Today's items — con filtro profilo-aware (shared famiglia)
  const todayAll  = allExp.filter(i => i.data === t && isProfileArea(i.area));
  const todayOpen = todayAll.filter(i => !i.done);
  const todayDone = todayAll.filter(i => i.done);

  // Overdue: past-due items that are NOT done and NOT recurring
  const overdue = items.filter(i => !i.deleted_at && i.data < t && !i.done && !i.recur && isProfileArea(i.area));

  // Urgent: test/scadenza/compito in the next 3 days
  const in3Days = new Date(now); in3Days.setDate(now.getDate() + 3);
  const in3Str  = dateToISO(in3Days);
  const upcoming = allExp.filter(i =>
    !i.done && i.data > t && i.data <= in3Str &&
    ['test','compito','scadenza'].includes(i.tipo) &&
    isProfileArea(i.area)
  );

  // Events with time in the next 2 hours
  const in2h = allExp.filter(i => {
    if (i.data !== t || !i.ora || i.done || !isProfileArea(i.area)) return false;
    const [eh, em] = i.ora.split(':').map(Number);
    const evMin  = eh * 60 + em;
    const nowMin = h * 60 + now.getMinutes();
    return evMin > nowMin && evMin - nowMin <= 120;
  });

  const banners = [];

  // ── 1. OVERDUE — always show if present ──
  if (overdue.length > 0) {
    const key = 'nb-overdue';
    const names = overdue.slice(0,2).map(i=>i.titolo).join(', ');
    const extra = overdue.length > 2 ? ` e altri ${overdue.length-2}` : '';
    banners.push(makeBanner({
      id: key, type:'urgent', ico:'⚠️',
      title: `${overdue.length} elemento${overdue.length>1?'i':''} scadut${overdue.length>1?'i':'o'} e non completat${overdue.length>1?'i':'o'}`,
      msg: names + extra + ' — da ieri o prima.'
    }));
  }

  // ── 2. UPCOMING in 2h ──
  in2h.forEach((it, idx) => {
    const mins = (() => {
      const [eh,em] = it.ora.split(':').map(Number);
      return (eh*60+em) - (h*60+now.getMinutes());
    })();
    banners.push(makeBanner({
      id: `nb-upcoming-${idx}`, type:'warn', ico:'🕐',
      title: `Tra ${mins} minuti: ${it.titolo}`,
      msg: `${AREAS[it.area]?.l || 'Senza area'} · ${it.ora} · ${it.tipo}`
    }));
  });

  // ── 3. UPCOMING TESTS in 3 days ──
  if (upcoming.length > 0) {
    const key = 'nb-tests';
    upcoming.slice(0,3).forEach((it, idx) => {
      const daysLeft = Math.ceil((new Date(it.data) - new Date(t)) / 86400000);
      banners.push(makeBanner({
        id: `nb-test-${idx}`, type:'urgent', ico:'📝',
        title: `${it.titolo} tra ${daysLeft} giorn${daysLeft===1?'o':'i'}`,
        msg: `${AREAS[it.area]?.l || 'Senza area'}${it.cpcTag ? ' · '+it.cpcTag : ''} · ${it.data}`
      }));
    });
  }

  // ── 4. MONDAY WEEK PREVIEW ──
  if (day === 1 && !notifSeen('monday')) {
    const thisWeek = allExp.filter(i => {
      const sun = new Date(now); sun.setDate(now.getDate() + (7 - day));
      return i.data >= t && i.data <= dateToISO(sun) && !i.done; // local date comparison
    });
    if (thisWeek.length > 0) {
      banners.push(makeBanner({
        id: 'nb-monday', type:'info', ico:'📅',
        title: `Settimana: ${thisWeek.length} impegni`,
        msg: thisWeek.slice(0,3).map(i=>`${i.data} · ${i.titolo}`).join(' · ')
          + (thisWeek.length > 3 ? ` · +${thisWeek.length-3} altri` : '')
      }));
      notifMark('monday');
    }
  }

  // ── 5. MORNING — once per day before noon ──
  if (h < 12 && !notifSeen('morning')) {
    if (todayOpen.length > 0) {
      const urgent = todayOpen.filter(i=>i.prio==='alta');
      banners.push(makeBanner({
        id: 'nb-morning', type: urgent.length ? 'urgent' : 'ok', ico:'☀️',
        title: `Buongiorno! ${todayOpen.length} impegn${todayOpen.length>1?'i':''} oggi`,
        msg: todayOpen.slice(0,3).map(i=>`${i.ora?i.ora+' ':''}"${i.titolo}"`).join(' · ')
          + (todayOpen.length>3 ? ` · +${todayOpen.length-3}` : '')
      }));
    } else {
      banners.push(makeBanner({
        id: 'nb-morning', type:'ok', ico:'☀️',
        title: 'Buongiorno! Agenda libera oggi',
        msg: currentProfile === 'anissa'
          ? 'Goditela. Un momento per te, per Jasper, per quello che ti va.'
          : 'Ottimo momento per avanzare su una startup o studiare in anticipo.'
      }));
    }
    notifMark('morning');
  }

  // ── 6. EVENING — once after 18:00 ──
  if (h >= 18 && !notifSeen('evening')) {
    let pushedEvening = false;
    if (todayOpen.length > 0) {
      banners.push(makeBanner({
        id: 'nb-evening', type:'warn', ico:'🌙',
        title: `Hai ancora ${todayOpen.length} elemento${todayOpen.length>1?'i':''} aperti oggi`,
        msg: todayOpen.slice(0,3).map(i=>'"'+i.titolo+'"').join(', ')
          + (todayOpen.length>3?` e altri ${todayOpen.length-3}`:'')
      }));
      pushedEvening = true;
    } else if (todayDone.length > 0) {
      banners.push(makeBanner({
        id: 'nb-evening', type:'ok', ico:'🌙',
        title: `Ottima giornata! ${todayDone.length} element${todayDone.length>1?'i':' '}completat${todayDone.length>1?'i':'o'}`,
        msg: 'Tutto fatto per oggi. Goditi la serata con la famiglia. 🌿'
      }));
      pushedEvening = true;
    }
    if (pushedEvening) notifMark('evening'); // only mark seen if banner was shown
  }

  // ── 7. COMPLETION CHECK — 1h dopo orario se ancora non fatto ──
  const completionChecks = allExp.filter(i => {
    if (i.data !== t || !i.ora || i.done) return false;
    const [eh, em] = i.ora.split(':').map(Number);
    const evMin  = eh * 60 + em;
    const nowMin = h * 60 + now.getMinutes();
    return nowMin > evMin + 60; // più di 1 ora dopo
  });
  completionChecks.forEach(it => {
    const pid = it.recurChild ? it.parentId : it.id;
    const key = `nb-check-${pid}`;
    if (!dismissedBanners.has(key)) {
      banners.push(`<div class="notif-banner info" id="${esc(key)}">
        <span class="nb-ico">✅</span>
        <div class="nb-body">
          <div class="nb-title">Hai completato "${esc(it.titolo.slice(0,30))}"?</div>
          <div class="nb-msg">Era alle ${esc(it.ora)} — segnalo come fatto?</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button onclick="toggle('${pid}');dismissNotif('${esc(key)}')" style="padding:5px 12px;background:var(--green);border:none;border-radius:6px;color:#111;font-size:12px;cursor:pointer;font-family:inherit">✓ Sì, fatto</button>
            <button onclick="dismissNotif('${esc(key)}')" style="padding:5px 12px;background:var(--bg3);border:1px solid var(--bdr);border-radius:6px;color:var(--txt3);font-size:12px;cursor:pointer;font-family:inherit">No, non ancora</button>
          </div>
        </div>
        <button class="notif-dismiss" onclick="dismissNotif('${esc(key)}')">×</button>
      </div>`);
    }
  });

  // Filter out banners dismissed this session, then render
  const html = banners.filter(b => {
    const idMatch = b.match(/id="([^"]+)"/);
    return !idMatch || !dismissedBanners.has(idMatch[1]);
  }).join('');
  const dArea = $('dNotifArea');
  const mArea = $('mNotifArea');
  if (dArea) dArea.innerHTML = html;
  if (mArea) mArea.innerHTML = html;
}

/* ═══════════════════════════════════════
   API CALL
═══════════════════════════════════════ */
async function apiCall(messages, maxTokens=500, system=null) {
  // Sanifica messages: Anthropic accetta solo {role, content}.
  // chatHistory puo contenere campi extra (es. hidden:true) che fanno fallire la richiesta.
  const cleanMessages = (messages||[]).map(m => ({role:m.role, content:m.content}));
  const body = {model:'claude-sonnet-4-6', max_tokens:maxTokens, messages:cleanMessages};
  if (system) body.system = system;
  const r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify(body)
  });
  if(!r.ok) { const err=await r.json().catch(()=>({})); throw new Error(err.error?.message||'API error '+r.status); }
  const d=await r.json();
  const t=d.content?.find(c=>c.type==='text')?.text;
  if(!t) throw new Error('Empty response');
  return t;
}

/* ═══════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const typing = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');

  if (e.key === 'Escape') {
    if ($('settingsOverlay').classList.contains('open')) closeSettings();
    else if ($('addOverlay').classList.contains('open')) closeModal();
  }
  // Only fire shortcuts when NOT typing in a field
  if (!typing) {
    if ((e.metaKey||e.ctrlKey) && e.key === 'k') { e.preventDefault(); $('dSrchInp')?.focus(); }
    if ((e.metaKey||e.ctrlKey) && e.key === 'n') { e.preventDefault(); openModal(); }
  }
  // Enter submits only when cursor is in the modal title field
  if (e.key === 'Enter' && $('addOverlay').classList.contains('open') && document.activeElement.id === 'fTit') {
    e.preventDefault();
    addItem();
  }
});

// Request notification permission
if('Notification' in window && Notification.permission==='default') {
  Notification.requestPermission().then(p=>{ if(p==='granted') scheduleNotifs(); });
}

