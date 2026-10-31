/**
 * Chatling – Peer-to-Peer Group Chat Engine
 * Architecture: WebRTC via PeerJS Cloud Broker
 * No login required. 6-digit room codes. Pure static hosting (Vercel-ready).
 *
 * Topology: Star/Hub — Host peer acts as relay hub.
 *   - Host: receives messages from joiners → relays to all others.
 *   - Joiners: connect only to Host peer, not to each other.
 *
 * Supported: Chrome, Firefox, Safari, Edge (desktop + mobile)
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ─────────────────────────────────────────
     CONFIGURATION
  ───────────────────────────────────────── */
  const PEER_CONFIG = {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    },
    debug: 0
  };

  /* ─────────────────────────────────────────
     STATE
  ───────────────────────────────────────── */
  let peer          = null;
  let myPeerId      = null;
  let myNickname    = '';
  let isHost        = false;
  let currentRoomCode = null;
  let hostConn      = null;       // joiner's DataConnection to host

  /** @type {Map<string, { conn: DataConnection, nickname: string }>} */
  const peers       = new Map();  // host only: peerId → { conn, nickname }

  /** @type {Array<{ id: string, name: string, isHost: boolean }>} */
  let roster        = [];

  const seenMsgIds  = new Set();
  const activeTypers = new Map(); // peerId → { nickname, timer }

  let typingTimeout  = null;
  let isTyping       = false;
  let heartbeatTimer = null;

  /* ─────────────────────────────────────────
     COLORS
  ───────────────────────────────────────── */
  const COLORS = [
    '#25D366','#0284c7','#8b5cf6','#d97706',
    '#db2777','#0d9488','#ea580c','#4f46e5','#e11d48'
  ];

  function nameColor(str) {
    if (!str) return COLORS[0];
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return COLORS[Math.abs(h) % COLORS.length];
  }

  /* ─────────────────────────────────────────
     DOM REFS
  ───────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  const homeView          = $('home-view');
  const chatView          = $('chat-view');
  const userNicknameInput = $('user-nickname-input');
  const tabCreate         = $('tab-create');
  const tabJoin           = $('tab-join');
  const sectionCreate     = $('section-create');
  const sectionJoin       = $('section-join');
  const createdCodeDisplay= $('created-code-display');
  const btnGenerateCode   = $('btn-generate-code');
  const createActions     = $('create-actions');
  const btnCopyCode       = $('btn-copy-code');
  const btnCopyLink       = $('btn-copy-link');
  const btnEnterChat      = $('btn-enter-chat');
  const joinCodeInput     = $('join-code-input');
  const btnJoinRoom       = $('btn-join-room');

  const statusIndicator   = $('status-indicator');
  const statusText        = $('status-text');
  const badgeMemberCount  = $('badge-member-count');
  const headerGroupTitle  = $('header-group-title');
  const btnGroupInfo      = $('btn-group-info');
  const headerInviteBtn   = $('header-invite-btn');
  const headerCodePill    = $('header-code-pill');
  const headerRoomCode    = $('header-room-code');
  const btnClearChat      = $('btn-clear-chat');
  const btnThemeToggle    = $('btn-theme-toggle');
  const btnLeaveChat      = $('btn-leave-chat');
  const chatMessages      = $('chat-messages');
  const typingIndicator   = $('typing-indicator');
  const typingText        = $('typing-text');
  const emojiPicker       = $('emoji-picker');
  const btnEmojiToggle    = $('btn-emoji-toggle');
  const messageInput      = $('message-input');
  const messageForm       = $('message-form');
  const membersModal      = $('members-modal');
  const btnCloseMembers   = $('btn-close-members');
  const membersList       = $('members-list');
  const modalMemberCount  = $('modal-member-count');
  const modalRoomCodeVal  = $('modal-room-code-val');
  const btnModalCopyCode  = $('btn-modal-copy-code');
  const btnModalInvite    = $('btn-modal-invite');
  const toastContainer    = $('toast-container');
  const connectionBanner  = $('connection-banner');

  /* ─────────────────────────────────────────
     THEME
  ───────────────────────────────────────── */
  function applyTheme(dark) {
    document.documentElement.classList.toggle('dark',  dark);
    document.documentElement.classList.toggle('light', !dark);
    $('icon-sun')  && $('icon-sun').classList.toggle('hidden', !dark);
    $('icon-moon') && $('icon-moon').classList.toggle('hidden',  dark);
  }

  applyTheme(localStorage.getItem('chatling_theme') === 'dark');

  btnThemeToggle && btnThemeToggle.addEventListener('click', () => {
    const next = !document.documentElement.classList.contains('dark');
    applyTheme(next);
    localStorage.setItem('chatling_theme', next ? 'dark' : 'light');
  });

  /* ─────────────────────────────────────────
     AUDIO CHIME
  ───────────────────────────────────────── */
  function chime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === 'suspended') ctx.resume();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (_) {}
  }

  /* ─────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────── */
  function nickname() {
    const v = userNicknameInput ? userNicknameInput.value.trim() : '';
    return v ? v.slice(0, 20) : `User${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function fmtTime(iso) {
    return new Date(iso || Date.now()).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  }

  function scrollBottom(smooth = true) {
    if (!chatMessages) return;
    requestAnimationFrame(() => {
      chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    });
  }

  /* ─────────────────────────────────────────
     TOAST
  ───────────────────────────────────────── */
  function toast(msg, type = 'info') {
    if (!toastContainer) return;
    const el = document.createElement('div');
    const bg = { info: 'bg-slate-800 text-white', success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white' };
    el.className = `${bg[type] || bg.info} px-4 py-2.5 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold transition-all transform duration-300 translate-y-2 opacity-0 pointer-events-auto border border-white/10`;
    el.textContent = msg;
    toastContainer.appendChild(el);
    requestAnimationFrame(() => {
      el.classList.remove('translate-y-2', 'opacity-0');
    });
    setTimeout(() => {
      el.classList.add('opacity-0', '-translate-y-2');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  /* ─────────────────────────────────────────
     TABS (HOME)
  ───────────────────────────────────────── */
  function switchTab(tab) {
    const isCreate = tab === 'create';
    const activeClass  = 'flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-emerald-500 text-white shadow-sm transition-all cursor-pointer';
    const inactiveClass = 'flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';

    if (tabCreate) tabCreate.className = isCreate ? activeClass : inactiveClass;
    if (tabJoin)   tabJoin.className   = isCreate ? inactiveClass : activeClass;
    sectionCreate && sectionCreate.classList.toggle('hidden', !isCreate);
    sectionJoin   && sectionJoin.classList.toggle('hidden',    isCreate);
    if (!isCreate && joinCodeInput) joinCodeInput.focus();
  }

  tabCreate && tabCreate.addEventListener('click', () => switchTab('create'));
  tabJoin   && tabJoin.addEventListener('click',   () => switchTab('join'));

  /* ─────────────────────────────────────────
     ROSTER & STATUS UI
  ───────────────────────────────────────── */
  function updateStatus() {
    const count = roster.length || 1;
    if (badgeMemberCount) badgeMemberCount.textContent = count;
    if (modalMemberCount) modalMemberCount.textContent = `${count} online`;
    if (!statusIndicator || !statusText) return;

    if (count > 1) {
      statusIndicator.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 status-pulse';
      const others = roster.filter(m => m.id !== myPeerId).map(m => m.name);
      statusText.textContent = others.length === 1
        ? `${others[0]} is online`
        : others.length === 2
        ? `${others[0]}, ${others[1]} online`
        : `${others[0]} & ${others.length - 1} others online`;
      statusText.className = 'text-[10px] sm:text-xs text-emerald-500 font-medium truncate';
    } else {
      statusIndicator.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500 border-2 border-white dark:border-slate-900';
      statusText.textContent = 'Waiting for friends to join...';
      statusText.className = 'text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium truncate';
    }

    renderMembers();
  }

  function renderMembers() {
    if (!membersList) return;
    membersList.innerHTML = '';

    const list = roster.length ? roster : [{ id: myPeerId, name: myNickname, isHost }];
    list.forEach(m => {
      const isSelf  = m.id === myPeerId;
      const color   = isSelf ? '#10b981' : nameColor(m.name);
      const initial = esc((m.name || 'M').charAt(0).toUpperCase());
      const role    = m.isHost ? 'Host' : (isSelf ? 'You' : 'Member');
      const li      = document.createElement('li');
      li.className  = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800';
      li.innerHTML  = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0" style="background-color:${color}">${initial}</div>
          <div class="min-w-0">
            <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(m.name)}${isSelf ? ' <span class="text-slate-400 font-normal">(You)</span>' : ''}</p>
            <p class="text-[10px] ${m.isHost ? 'text-amber-500 font-bold' : 'text-slate-400 dark:text-slate-500'}">${role}</p>
          </div>
        </div>
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
      `;
      membersList.appendChild(li);
    });
  }

  /* ─────────────────────────────────────────
     ENTER / LEAVE CHAT VIEW
  ───────────────────────────────────────── */
  function enterChat(code) {
    currentRoomCode = code;
    homeView  && homeView.classList.add('hidden');
    chatView  && chatView.classList.remove('hidden');
    if (headerGroupTitle) headerGroupTitle.textContent = `Room #${code}`;
    if (headerRoomCode)   headerRoomCode.textContent   = code;
    if (modalRoomCodeVal) modalRoomCodeVal.textContent  = code;
    messageInput && messageInput.focus();
    updateStatus();
    startHeartbeat();
    if (window.history && window.history.pushState) {
      window.history.pushState({ inChat: true, room: code }, '', `?room=${code}`);
    }
  }

  window.addEventListener('popstate', () => {
    if (chatView && !chatView.classList.contains('hidden')) leaveRoom(false);
  });

  function leaveRoom(confirm = true) {
    if (confirm && !window.confirm('Leave this group chat?')) return;

    stopHeartbeat();

    if (isHost) {
      broadcast({ type: 'host-closed' });
    } else if (hostConn && hostConn.open) {
      try { hostConn.send({ type: 'leave', senderId: myPeerId, nickname: myNickname }); } catch (_) {}
    }

    peers.forEach(p => { try { p.conn.close(); } catch (_) {} });
    peers.clear();
    if (hostConn) { try { hostConn.close(); } catch (_) {} hostConn = null; }
    if (peer)     { try { peer.destroy();  } catch (_) {} peer = null; }

    roster        = [];
    currentRoomCode = null;
    isHost        = false;
    seenMsgIds.clear();
    activeTypers.clear();
    isTyping      = false;

    chatView  && chatView.classList.add('hidden');
    homeView  && homeView.classList.remove('hidden');
    createActions && createActions.classList.add('hidden');
    btnGenerateCode && btnGenerateCode.classList.remove('hidden');
    if (createdCodeDisplay) createdCodeDisplay.textContent = '------';
    if (joinCodeInput)      joinCodeInput.value = '';

    // Clear messages
    chatMessages && chatMessages.querySelectorAll('.msg-row-out,.msg-row-in,.sys-banner').forEach(el => el.remove());

    if (window.history && window.history.replaceState)
      window.history.replaceState({}, '', window.location.pathname);

    toast('You left the chat.', 'info');
  }

  /* ─────────────────────────────────────────
     MESSAGE RENDERING
  ───────────────────────────────────────── */
  function renderMessage({ id, senderName, senderId, content, isOutgoing, timestamp, status = 'sent' }) {
    if (!chatMessages) return;
    if (document.getElementById(`msg-${id}`)) return;

    const htmlContent = esc(content).replace(/\n/g, '<br>');
    const time        = fmtTime(timestamp);

    const tickSent = `<svg class="w-3.5 h-3.5 text-slate-400 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
    const tickDbl  = `<svg class="w-3.5 h-3.5 text-[#53bdeb] inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7M5 7l4 4L19 1"/></svg>`;

    const row = document.createElement('div');
    row.id    = `msg-${id}`;

    if (isOutgoing) {
      row.className = 'msg-row-out';
      row.innerHTML = `
        <div class="bubble bubble-out py-1.5 px-3 text-xs sm:text-sm">
          <div class="leading-relaxed">${htmlContent}</div>
          <div class="flex items-center justify-end gap-0.5 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 select-none">
            <span>${time}</span>
            <span class="tick-icon">${status === 'delivered' ? tickDbl : tickSent}</span>
          </div>
        </div>`;
    } else {
      const color = nameColor(senderName || '');
      row.className = 'msg-row-in';
      row.innerHTML = `
        <div class="bubble bubble-in py-1.5 px-3 text-xs sm:text-sm">
          <div class="text-[11px] font-bold mb-0.5 select-none" style="color:${color}">${esc(senderName || 'Member')}</div>
          <div class="leading-relaxed text-slate-900 dark:text-slate-100">${htmlContent}</div>
          <div class="flex items-center justify-end text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 select-none">
            <span>${time}</span>
          </div>
        </div>`;
    }

    // Insert before bottom anchor
    const anchor = $('messages-bottom-anchor');
    if (anchor) chatMessages.insertBefore(row, anchor);
    else chatMessages.appendChild(row);

    scrollBottom();
  }

  function markDelivered(msgId) {
    const el = document.getElementById(`msg-${msgId}`);
    if (!el) return;
    const tick = el.querySelector('.tick-icon');
    if (tick) tick.innerHTML = `<svg class="w-3.5 h-3.5 text-[#53bdeb] inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7M5 7l4 4L19 1"/></svg>`;
  }

  function renderSystem(msg) {
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = 'sys-banner';
    div.innerHTML = `<div class="sys-banner-inner">${esc(msg)}</div>`;
    const anchor = $('messages-bottom-anchor');
    if (anchor) chatMessages.insertBefore(div, anchor);
    else chatMessages.appendChild(div);
    scrollBottom();
  }

  /* ─────────────────────────────────────────
     TYPING DISPLAY
  ───────────────────────────────────────── */
  function updateTyping() {
    if (!typingIndicator || !typingText) return;
    const names = [...activeTypers.values()].map(t => t.nickname);
    if (!names.length) {
      typingIndicator.classList.add('hidden');
    } else {
      typingText.textContent = names.length === 1
        ? `${names[0]} is typing`
        : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]} and ${names.length - 1} others are typing`;
      typingIndicator.classList.remove('hidden');
    }
  }

  function handleTyping(data) {
    if (!data || !data.senderId) return;
    if (data.type === 'typing') {
      if (activeTypers.has(data.senderId)) clearTimeout(activeTypers.get(data.senderId).timer);
      const timer = setTimeout(() => { activeTypers.delete(data.senderId); updateTyping(); }, 3500);
      activeTypers.set(data.senderId, { nickname: data.nickname || 'Someone', timer });
    } else {
      if (activeTypers.has(data.senderId)) clearTimeout(activeTypers.get(data.senderId).timer);
      activeTypers.delete(data.senderId);
    }
    updateTyping();
  }

  /* ─────────────────────────────────────────
     WEBRTC – BROADCAST (HOST ONLY)
  ───────────────────────────────────────── */
  function broadcast(payload, excludeId = null) {
    peers.forEach((p, id) => {
      if (id !== excludeId && p.conn && p.conn.open) {
        try { p.conn.send(payload); } catch (_) {}
      }
    });
  }

  /* ─────────────────────────────────────────
     HOST SESSION
  ───────────────────────────────────────── */
  function startHostSession(code) {
    if (peer) { try { peer.destroy(); } catch (_) {} peer = null; }
    if (typeof Peer === 'undefined') { toast('PeerJS library failed to load. Please refresh.', 'error'); return; }

    const hostPeerId = `chatling-${code}`;
    try {
      peer = new Peer(hostPeerId, PEER_CONFIG);
    } catch (e) {
      toast('Failed to init WebRTC. Please refresh.', 'error');
      return;
    }

    peer.on('open', id => {
      myPeerId = id;
      roster = [{ id: myPeerId, name: myNickname, isHost: true }];
      console.log('[HOST] Active with ID:', id);
    });

    peer.on('connection', conn => {
      const joinerId = conn.peer;

      conn.on('open', () => {
        console.log('[HOST] Joiner connected:', joinerId);
      });

      conn.on('data', data => {
        if (!data || !data.type) return;

        if (data.type === 'join-request') {
          const jName = (data.nickname || 'Member').slice(0, 20);
          peers.set(data.senderId, { conn, nickname: jName });
          roster = roster.filter(m => m.id !== data.senderId);
          roster.push({ id: data.senderId, name: jName, isHost: false });

          // Approve
          try {
            conn.send({ type: 'join-approved', roomCode: currentRoomCode, members: roster, hostName: myNickname });
          } catch (_) {}

          // Notify others
          broadcast({ type: 'member-joined', member: { id: data.senderId, name: jName }, members: roster }, data.senderId);

          toast(`${jName} joined!`, 'success');
          renderSystem(`${jName} joined the group`);
          updateStatus();
          chime();
          return;
        }

        if (data.type === 'chat') {
          if (!seenMsgIds.has(data.id)) {
            seenMsgIds.add(data.id);
            renderMessage({ id: data.id, senderName: data.senderName, senderId: data.senderId, content: data.content, isOutgoing: false, timestamp: data.timestamp });
            chime();
            broadcast(data, data.senderId);
            try { conn.send({ type: 'ack', id: data.id }); } catch (_) {}
          }
          return;
        }

        if (data.type === 'typing' || data.type === 'stop-typing') {
          handleTyping(data);
          broadcast(data, data.senderId);
          return;
        }

        if (data.type === 'leave') {
          onMemberLeft(data.senderId, data.nickname);
          return;
        }
      });

      conn.on('close', () => onMemberLeft(joinerId));
      conn.on('error', err => console.warn('[HOST] conn err:', err));
    });

    peer.on('error', err => {
      console.warn('[HOST] peer err:', err);
      if (err.type === 'unavailable-id') {
        // Room code collision – regenerate
        generateRoom();
      } else {
        toast(`WebRTC error: ${err.type}`, 'error');
      }
    });

    peer.on('disconnected', () => {
      console.warn('[HOST] Disconnected from broker. Attempting reconnect...');
      try { peer.reconnect(); } catch (_) {}
    });
  }

  function onMemberLeft(peerId, explicitName = null) {
    if (!peers.has(peerId)) return;
    const name = explicitName || peers.get(peerId).nickname || 'A participant';
    peers.delete(peerId);
    roster = roster.filter(m => m.id !== peerId);
    if (activeTypers.has(peerId)) {
      clearTimeout(activeTypers.get(peerId).timer);
      activeTypers.delete(peerId);
      updateTyping();
    }
    updateStatus();
    renderSystem(`${name} left the group`);
    toast(`${name} left.`, 'info');
    broadcast({ type: 'member-left', memberId: peerId, nickname: name, members: roster });
  }

  /* ─────────────────────────────────────────
     GENERATE ROOM (HOST)
  ───────────────────────────────────────── */
  function generateRoom() {
    myNickname = nickname();
    isHost     = true;

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    currentRoomCode = code;

    if (createdCodeDisplay) createdCodeDisplay.textContent = code;
    if (createActions)      createActions.classList.remove('hidden');
    if (btnGenerateCode)    btnGenerateCode.classList.add('hidden');
    toast(`Room #${code} created! Share the code.`, 'success');

    startHostSession(code);
  }

  btnGenerateCode && btnGenerateCode.addEventListener('click', generateRoom);

  /* ─────────────────────────────────────────
     JOIN ROOM (MEMBER)
  ───────────────────────────────────────── */
  function joinRoom() {
    if (!joinCodeInput) return;
    const code = joinCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      toast('Enter a valid 6-digit code.', 'error');
      joinCodeInput.focus();
      return;
    }

    myNickname = nickname();
    isHost     = false;
    currentRoomCode = code;
    toast(`Connecting to room #${code}…`, 'info');

    if (peer) { try { peer.destroy(); } catch (_) {} peer = null; }
    if (typeof Peer === 'undefined') { toast('PeerJS library failed to load. Please refresh.', 'error'); return; }

    try {
      peer = new Peer(PEER_CONFIG);
    } catch (e) {
      toast('Failed to init WebRTC. Please refresh.', 'error');
      return;
    }

    peer.on('open', id => {
      myPeerId = id;
      const hostPeerId = `chatling-${code}`;
      hostConn = peer.connect(hostPeerId, { reliable: true });

      hostConn.on('open', () => {
        try {
          hostConn.send({ type: 'join-request', senderId: myPeerId, nickname: myNickname });
        } catch (_) {}
      });

      hostConn.on('data', data => {
        if (!data || !data.type) return;

        if (data.type === 'join-approved') {
          roster = Array.isArray(data.members) ? data.members : [];
          enterChat(code);
          toast(`Joined Room #${code}!`, 'success');
          renderSystem(`You joined Room #${code}`);
          updateStatus();
          return;
        }

        if (data.type === 'member-joined') {
          if (Array.isArray(data.members)) roster = data.members;
          const n = data.member ? data.member.name : 'Someone';
          toast(`${n} joined!`, 'success');
          renderSystem(`${n} joined the group`);
          updateStatus();
          chime();
          return;
        }

        if (data.type === 'chat') {
          if (!seenMsgIds.has(data.id)) {
            seenMsgIds.add(data.id);
            renderMessage({ id: data.id, senderName: data.senderName, senderId: data.senderId, content: data.content, isOutgoing: false, timestamp: data.timestamp });
            chime();
          }
          return;
        }

        if (data.type === 'ack') {
          markDelivered(data.id);
          return;
        }

        if (data.type === 'typing' || data.type === 'stop-typing') {
          handleTyping(data);
          return;
        }

        if (data.type === 'member-left') {
          if (Array.isArray(data.members)) roster = data.members;
          const n = data.nickname || 'A participant';
          toast(`${n} left.`, 'info');
          renderSystem(`${n} left the group`);
          updateStatus();
          return;
        }

        if (data.type === 'host-closed') {
          toast('The room host ended the session.', 'info');
          renderSystem('Host ended the room.');
          setTimeout(() => leaveRoom(false), 1500);
          return;
        }
      });

      hostConn.on('close', () => {
        toast('Connection to host lost.', 'info');
        renderSystem('Connection to host was lost.');
      });

      hostConn.on('error', err => console.warn('[MEMBER] host conn err:', err));
    });

    peer.on('error', err => {
      console.warn('[MEMBER] peer err:', err);
      if (err.type === 'peer-unavailable') {
        toast(`Room #${code} not found or host is offline.`, 'error');
      } else {
        toast(`Connection issue: ${err.type}`, 'info');
      }
    });

    peer.on('disconnected', () => {
      console.warn('[MEMBER] Disconnected from broker.');
      try { peer.reconnect(); } catch (_) {}
    });
  }

  btnJoinRoom && btnJoinRoom.addEventListener('click', joinRoom);

  joinCodeInput && joinCodeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); joinRoom(); }
  });

  /* ─────────────────────────────────────────
     AUTO-JOIN FROM URL (?room=XXXXXX)
  ───────────────────────────────────────── */
  (function autoJoin() {
    const p = new URLSearchParams(window.location.search).get('room');
    if (p && /^\d{6}$/.test(p)) {
      switchTab('join');
      if (joinCodeInput) joinCodeInput.value = p;
      setTimeout(joinRoom, 600);
    }
  })();

  /* ─────────────────────────────────────────
     ENTER CHAT BUTTON (HOST)
  ───────────────────────────────────────── */
  btnEnterChat && btnEnterChat.addEventListener('click', () => {
    if (currentRoomCode) enterChat(currentRoomCode);
  });

  /* ─────────────────────────────────────────
     COPY / SHARE HELPERS
  ───────────────────────────────────────── */
  function copyText(text, label = 'Copied!') {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast(label, 'info')).catch(() => toast(label, 'info'));
    } else {
      // Fallback for older iOS Safari
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); toast(label, 'info'); } catch (_) {}
      document.body.removeChild(ta);
    }
  }

  async function shareInvite() {
    if (!currentRoomCode) return;
    const url = `${location.origin}${location.pathname}?room=${currentRoomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my Chatling room', text: `Room code: ${currentRoomCode}`, url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    copyText(url, 'Invite link copied!');
  }

  btnCopyCode      && btnCopyCode.addEventListener('click',      () => currentRoomCode && copyText(currentRoomCode, 'Room code copied!'));
  btnCopyLink      && btnCopyLink.addEventListener('click',      shareInvite);
  headerInviteBtn  && headerInviteBtn.addEventListener('click',  shareInvite);
  btnModalInvite   && btnModalInvite.addEventListener('click',   shareInvite);
  btnModalCopyCode && btnModalCopyCode.addEventListener('click', () => currentRoomCode && copyText(currentRoomCode, `Code ${currentRoomCode} copied!`));
  headerCodePill   && headerCodePill.addEventListener('click',   () => currentRoomCode && copyText(currentRoomCode, 'Room code copied!'));

  /* ─────────────────────────────────────────
     MEMBERS MODAL
  ───────────────────────────────────────── */
  btnGroupInfo && btnGroupInfo.addEventListener('click', () => {
    renderMembers();
    membersModal && membersModal.classList.remove('hidden');
  });

  btnGroupInfo && btnGroupInfo.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btnGroupInfo.click(); }
  });

  btnCloseMembers && btnCloseMembers.addEventListener('click', () => {
    membersModal && membersModal.classList.add('hidden');
  });

  membersModal && membersModal.addEventListener('click', e => {
    if (e.target === membersModal) membersModal.classList.add('hidden');
  });

  /* ─────────────────────────────────────────
     CLEAR CHAT
  ───────────────────────────────────────── */
  btnClearChat && btnClearChat.addEventListener('click', () => {
    if (!window.confirm('Clear all messages from this device?')) return;
    chatMessages && chatMessages.querySelectorAll('.msg-row-out,.msg-row-in,.sys-banner').forEach(el => el.remove());
    toast('Chat cleared locally.', 'info');
  });

  /* ─────────────────────────────────────────
     LEAVE CHAT
  ───────────────────────────────────────── */
  btnLeaveChat && btnLeaveChat.addEventListener('click', () => leaveRoom(true));

  /* ─────────────────────────────────────────
     TYPING INDICATORS (SEND)
  ───────────────────────────────────────── */
  function sendTypingPayload(type) {
    const payload = { type, senderId: myPeerId, nickname: myNickname };
    if (isHost) broadcast(payload);
    else if (hostConn && hostConn.open) try { hostConn.send(payload); } catch (_) {}
  }

  messageInput && messageInput.addEventListener('input', () => {
    if (!currentRoomCode) return;
    if (!isTyping) { isTyping = true; sendTypingPayload('typing'); }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { isTyping = false; sendTypingPayload('stop-typing'); }, 2500);
  });

  /* ─────────────────────────────────────────
     EMOJI PICKER
  ───────────────────────────────────────── */
  if (btnEmojiToggle && emojiPicker) {
    btnEmojiToggle.addEventListener('click', e => {
      e.stopPropagation();
      emojiPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', e => {
      if (!emojiPicker.contains(e.target) && e.target !== btnEmojiToggle)
        emojiPicker.classList.add('hidden');
    });

    emojiPicker.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (messageInput) {
          const s = messageInput.selectionStart;
          const e_ = messageInput.selectionEnd;
          const v = messageInput.value;
          messageInput.value = v.slice(0, s) + btn.textContent + v.slice(e_);
          messageInput.selectionStart = messageInput.selectionEnd = s + btn.textContent.length;
          messageInput.focus();
          emojiPicker.classList.add('hidden');
        }
      });
    });
  }

  /* ─────────────────────────────────────────
     SEND MESSAGE
  ───────────────────────────────────────── */
  function sendMessage() {
    if (!messageInput) return;
    const content = messageInput.value.trim();
    if (!content || !currentRoomCode) return;

    const trimmed   = content.slice(0, 2000);
    const msgId     = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();

    messageInput.value = '';
    seenMsgIds.add(msgId);

    const hasPeers = isHost ? peers.size > 0 : (hostConn && hostConn.open);

    renderMessage({ id: msgId, senderName: myNickname, senderId: myPeerId, content: trimmed, isOutgoing: true, timestamp, status: hasPeers ? 'delivered' : 'sent' });

    const payload = { type: 'chat', id: msgId, senderName: myNickname, senderId: myPeerId, content: trimmed, timestamp };

    if (isHost) {
      broadcast(payload);
    } else if (hostConn && hostConn.open) {
      try { hostConn.send(payload); } catch (_) {}
    }

    // Stop typing
    if (isTyping) {
      isTyping = false;
      clearTimeout(typingTimeout);
      sendTypingPayload('stop-typing');
    }

    messageInput.focus();
    scrollBottom();
  }

  messageForm && messageForm.addEventListener('submit', e => { e.preventDefault(); sendMessage(); });

  /* ─────────────────────────────────────────
     KEYBOARD DISMISS ON MOBILE
  ───────────────────────────────────────── */
  if (chatMessages) {
    chatMessages.addEventListener('touchstart', e => {
      if (e.target && e.target.closest && e.target.closest('button,a,input,textarea')) return;
      if (document.activeElement === messageInput) messageInput.blur();
    }, { passive: true });
  }

  /* ─────────────────────────────────────────
     HEARTBEAT (KEEP CONNECTIONS ALIVE)
  ───────────────────────────────────────── */
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (isHost) broadcast({ type: 'ping' });
      else if (hostConn && hostConn.open) try { hostConn.send({ type: 'ping' }); } catch (_) {}
    }, 20000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  /* ─────────────────────────────────────────
     ONLINE / OFFLINE BANNER
  ───────────────────────────────────────── */
  window.addEventListener('offline', () => {
    connectionBanner && connectionBanner.classList.remove('hidden');
  });

  window.addEventListener('online', () => {
    connectionBanner && connectionBanner.classList.add('hidden');
    toast('Back online!', 'success');
  });

});
