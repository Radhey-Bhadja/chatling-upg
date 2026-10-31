// Chatling - Private Ephemeral Group Web Chat Engine
// Peer-to-Peer WebRTC Architecture by 6-Digit Room Code
// 100% Client-Side Ready (Vercel, Static Hosting, & Local Server)
// Authentic WhatsApp Aesthetic & Full Mobile Responsiveness

document.addEventListener('DOMContentLoaded', () => {
  // STUN Configuration for WebRTC NAT Traversal
  const PEER_CONFIG = {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    },
    debug: 0
  };

  // State Management
  let peer = null;
  let myPeerId = null;
  let myNickname = '';
  let isHost = false;
  let currentRoomCode = null;
  let hostConnection = null; // Joiner's connection to host

  // Host tracks connected members: Map<peerId, { conn, nickname, isHost }>
  const connectedPeers = new Map();

  // Canonical Group Roster: Array<{ id: string, name: string, isHost: boolean }>
  let groupRoster = [];

  // Deduplication set for message IDs
  const seenMessageIds = new Set();

  // Typing state: Map<peerId, { nickname: string, timer: any }>
  const activeTypers = new Map();
  let typingTimeout = null;
  let isTyping = false;
  let heartbeatInterval = null;

  // WhatsApp-style Participant Author Colors
  const NAME_COLORS = [
    '#25D366', // Emerald Green
    '#0284c7', // Sky Blue
    '#8b5cf6', // Violet
    '#d97706', // Amber
    '#db2777', // Pink
    '#0d9488', // Teal
    '#ea580c', // Orange
    '#4f46e5', // Indigo
    '#e11d48'  // Rose
  ];

  function getSenderColor(nameOrId) {
    if (!nameOrId) return NAME_COLORS[0];
    let hash = 0;
    for (let i = 0; i < nameOrId.length; i++) {
      hash = nameOrId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % NAME_COLORS.length;
    return NAME_COLORS[idx];
  }

  // DOM Elements - Home View
  const homeView = document.getElementById('home-view');
  const userNicknameInput = document.getElementById('user-nickname-input');
  const tabCreate = document.getElementById('tab-create');
  const tabJoin = document.getElementById('tab-join');
  const sectionCreate = document.getElementById('section-create');
  const sectionJoin = document.getElementById('section-join');
  const createdCodeDisplay = document.getElementById('created-code-display');
  const btnGenerateCode = document.getElementById('btn-generate-code');
  const createActions = document.getElementById('create-actions');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnEnterChat = document.getElementById('btn-enter-chat');
  const joinCodeInput = document.getElementById('join-code-input');
  const btnJoinRoom = document.getElementById('btn-join-room');

  // DOM Elements - Chat View
  const chatView = document.getElementById('chat-view');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const badgeMemberCount = document.getElementById('badge-member-count');
  const headerGroupTitle = document.getElementById('header-group-title');
  const btnGroupInfo = document.getElementById('btn-group-info');
  const headerInviteBtn = document.getElementById('header-invite-btn');
  const headerCodePill = document.getElementById('header-code-pill');
  const headerRoomCode = document.getElementById('header-room-code');
  const btnClearChat = document.getElementById('btn-clear-chat');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const btnLeaveChat = document.getElementById('btn-leave-chat');
  const chatMessages = document.getElementById('chat-messages');
  const typingIndicator = document.getElementById('typing-indicator');
  const typingText = document.getElementById('typing-text');
  const emojiPicker = document.getElementById('emoji-picker');
  const btnEmojiToggle = document.getElementById('btn-emoji-toggle');
  const messageInput = document.getElementById('message-input');
  const btnSendMessage = document.getElementById('btn-send-message');
  const messageForm = document.getElementById('message-form');

  // DOM Elements - Members Modal
  const membersModal = document.getElementById('members-modal');
  const btnCloseMembers = document.getElementById('btn-close-members');
  const membersList = document.getElementById('members-list');
  const modalMemberCount = document.getElementById('modal-member-count');
  const modalRoomCodeVal = document.getElementById('modal-room-code-val');
  const btnModalCopyCode = document.getElementById('btn-modal-copy-code');
  const btnModalInvite = document.getElementById('btn-modal-invite');

  // DOM Elements - Toast & Notifications
  const toastContainer = document.getElementById('toast-container');
  const connectionBanner = document.getElementById('connection-banner');
  const iconSun = document.getElementById('icon-sun');
  const iconMoon = document.getElementById('icon-moon');

  // --- THEME MANAGEMENT (DEFAULTS TO LIGHT THEME) ---
  function updateThemeUI(isDark) {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      if (iconSun) iconSun.classList.remove('hidden');
      if (iconMoon) iconMoon.classList.add('hidden');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      if (iconSun) iconSun.classList.add('hidden');
      if (iconMoon) iconMoon.classList.remove('hidden');
    }
  }

  const savedTheme = localStorage.getItem('chatling_theme');
  const isDarkMode = savedTheme === 'dark'; // Light Theme by default
  updateThemeUI(isDarkMode);

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const isCurrentlyDark = document.documentElement.classList.contains('dark');
      const nextMode = !isCurrentlyDark;
      updateThemeUI(nextMode);
      localStorage.setItem('chatling_theme', nextMode ? 'dark' : 'light');
    });
  }

  // --- AUDIO FEEDBACK (Synthesizer Chime) ---
  function playNotificationSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) {}
  }

  // --- HELPERS ---
  function getEffectiveNickname() {
    const val = userNicknameInput ? userNicknameInput.value.trim() : '';
    if (val) return val.slice(0, 20);
    return `User ${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    const bgColors = {
      info: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
      success: 'bg-emerald-600 text-white',
      error: 'bg-red-600 text-white'
    };

    toast.className = `${bgColors[type] || bgColors.info} px-4 py-2.5 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold transition-all transform duration-300 translate-y-2 opacity-0 flex items-center gap-2 pointer-events-auto z-50 border border-white/10`;
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', '-translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function switchHomeTab(tab) {
    if (tab === 'create') {
      if (tabCreate) {
        tabCreate.className = 'flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-emerald-500 text-white shadow-sm transition-all cursor-pointer';
      }
      if (tabJoin) {
        tabJoin.className = 'flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900';
      }
      if (sectionCreate) sectionCreate.classList.remove('hidden');
      if (sectionJoin) sectionJoin.classList.add('hidden');
    } else {
      if (tabJoin) {
        tabJoin.className = 'flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-emerald-500 text-white shadow-sm transition-all cursor-pointer';
      }
      if (tabCreate) {
        tabCreate.className = 'flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900';
      }
      if (sectionJoin) sectionJoin.classList.remove('hidden');
      if (sectionCreate) sectionCreate.classList.add('hidden');
      if (joinCodeInput) joinCodeInput.focus();
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(isoString) {
    const d = isoString ? new Date(isoString) : new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function scrollToBottom(behavior = 'smooth') {
    if (!chatMessages) return;
    requestAnimationFrame(() => {
      chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: behavior
      });
    });
  }

  // --- UI STATUS & ROSTER ---
  function updateGroupStatus() {
    const totalCount = groupRoster.length > 0 ? groupRoster.length : 1;
    if (badgeMemberCount) badgeMemberCount.textContent = totalCount;
    if (modalMemberCount) modalMemberCount.textContent = `${totalCount} online`;

    if (!statusIndicator || !statusText) return;

    if (totalCount > 1) {
      statusIndicator.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-wa-green border-2 border-white dark:border-slate-900 status-pulse';
      const otherNames = groupRoster.filter(m => m.id !== myPeerId).map(m => m.name);
      if (otherNames.length === 1) {
        statusText.textContent = `${otherNames[0]} is online`;
      } else if (otherNames.length === 2) {
        statusText.textContent = `${otherNames[0]}, ${otherNames[1]} online`;
      } else {
        statusText.textContent = `${otherNames[0]} & ${otherNames.length - 1} others online`;
      }
      statusText.className = 'text-[10px] sm:text-xs text-wa-green font-medium truncate';
    } else {
      statusIndicator.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500 border-2 border-white dark:border-slate-900';
      statusText.textContent = 'Waiting for friends to join...';
      statusText.className = 'text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium truncate';
    }

    renderMembersList();
  }

  function renderMembersList() {
    if (!membersList) return;
    membersList.innerHTML = '';

    if (groupRoster.length === 0) {
      const li = document.createElement('li');
      li.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800';
      li.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-full bg-emerald-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
            ${escapeHTML(myNickname.charAt(0).toUpperCase())}
          </div>
          <div class="min-w-0">
            <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${escapeHTML(myNickname)} (You)</p>
            <p class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">${isHost ? 'Group Host' : 'Member'}</p>
          </div>
        </div>
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
      `;
      membersList.appendChild(li);
      return;
    }

    groupRoster.forEach(member => {
      const isSelf = member.id === myPeerId;
      const color = isSelf ? '#10b981' : getSenderColor(member.name);
      const initial = escapeHTML((member.name || 'M').charAt(0).toUpperCase());
      const roleLabel = member.isHost ? 'Group Host' : (isSelf ? 'You' : 'Member');

      const li = document.createElement('li');
      li.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800';
      li.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs" style="background-color: ${color}">
            ${initial}
          </div>
          <div class="min-w-0">
            <p class="text-xs font-bold text-slate-900 dark:text-white truncate">
              ${escapeHTML(member.name)} ${isSelf ? '<span class="text-slate-400 font-normal">(You)</span>' : ''}
            </p>
            <p class="text-[10px] ${member.isHost ? 'text-amber-500 font-bold' : 'text-slate-400 dark:text-slate-500'}">${roleLabel}</p>
          </div>
        </div>
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
      `;
      membersList.appendChild(li);
    });
  }

  function enterChatView(code) {
    currentRoomCode = code;
    if (homeView) homeView.classList.add('hidden');
    if (chatView) chatView.classList.remove('hidden');
    if (headerGroupTitle) headerGroupTitle.textContent = `Group #${code}`;
    if (headerRoomCode) headerRoomCode.textContent = code;
    if (modalRoomCodeVal) modalRoomCodeVal.textContent = code;
    if (headerCodePill) headerCodePill.classList.remove('hidden');
    if (messageInput) messageInput.focus();
    updateGroupStatus();

    if (window.history && window.history.pushState) {
      window.history.pushState({ inChat: true, room: code }, '', `?room=${code}`);
    }

    startHeartbeat();
  }

  window.addEventListener('popstate', () => {
    if (chatView && !chatView.classList.contains('hidden')) {
      leaveChatRoom(false);
    }
  });

  // --- WHATSAPP MESSAGE BUBBLE RENDERING ---
  function appendMessage({ id, senderName, senderId, content, isOutgoing, timestamp, status = 'sent' }) {
    if (!chatMessages) return;
    if (document.getElementById(`msg-wrap-${id}`)) return;

    const wrapper = document.createElement('div');
    wrapper.id = `msg-wrap-${id}`;
    
    const contentHtml = escapeHTML(content).replace(/\n/g, '<br>');
    const timeStr = formatTime(timestamp);

    let statusTicks = '';
    if (isOutgoing) {
      if (status === 'delivered') {
        // WhatsApp Double Blue Ticks
        statusTicks = `<svg class="w-3.5 h-3.5 text-[#53bdeb] inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7M5 7l4 4L19 1"/></svg>`;
      } else {
        // WhatsApp Single Tick
        statusTicks = `<svg class="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
      }
    }

    if (isOutgoing) {
      // WhatsApp Outgoing Bubble: Right aligned, soft green, bottom-right time & ticks
      wrapper.className = 'flex items-end justify-end my-1 w-full';
      wrapper.innerHTML = `
        <div class="bubble bubble-out py-1.5 px-3 rounded-xl text-xs sm:text-sm max-w-[85%] sm:max-w-[70%] shadow-xs">
          <div class="leading-relaxed break-words overflow-wrap-anywhere">${contentHtml}</div>
          <div class="flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-slate-300 mt-0.5 select-none font-medium">
            <span>${timeStr}</span>
            <span class="tick-icon">${statusTicks}</span>
          </div>
        </div>
      `;
    } else {
      // WhatsApp Incoming Bubble: Left aligned, pure white, author name colored
      const name = senderName || 'Member';
      const nameColor = getSenderColor(name);

      wrapper.className = 'flex items-end justify-start my-1 w-full';
      wrapper.innerHTML = `
        <div class="bubble bubble-in py-1.5 px-3 rounded-xl text-xs sm:text-sm max-w-[85%] sm:max-w-[70%] shadow-xs">
          <div class="text-[11px] font-bold mb-0.5 select-none" style="color: ${nameColor}">
            ${escapeHTML(name)}
          </div>
          <div class="leading-relaxed break-words overflow-wrap-anywhere text-slate-900 dark:text-slate-100">${contentHtml}</div>
          <div class="flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 select-none font-medium">
            <span>${timeStr}</span>
          </div>
        </div>
      `;
    }

    chatMessages.appendChild(wrapper);
    scrollToBottom();
  }

  function appendSystemBanner(message) {
    if (!chatMessages) return;
    const banner = document.createElement('div');
    banner.className = 'flex justify-center my-1.5 select-none';
    banner.innerHTML = `
      <div class="bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 text-[10px] sm:text-xs px-3 py-1 rounded-full shadow-2xs backdrop-blur-sm max-w-[90%] text-center truncate border border-slate-200/50 dark:border-slate-700/50">
        ${escapeHTML(message)}
      </div>
    `;
    chatMessages.appendChild(banner);
    scrollToBottom();
  }

  function markMessageDelivered(msgId) {
    const wrap = document.getElementById(`msg-wrap-${msgId}`);
    if (wrap) {
      const tickSpan = wrap.querySelector('.tick-icon');
      if (tickSpan) {
        tickSpan.innerHTML = `<svg class="w-3.5 h-3.5 text-[#53bdeb] inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7M5 7l4 4L19 1"/></svg>`;
      }
    }
  }

  function updateTypingDisplay() {
    if (!typingIndicator || !typingText) return;
    const typers = Array.from(activeTypers.values()).map(t => t.nickname);
    if (typers.length === 0) {
      typingIndicator.classList.add('hidden');
    } else if (typers.length === 1) {
      typingText.textContent = `${typers[0]} is typing`;
      typingIndicator.classList.remove('hidden');
      scrollToBottom();
    } else if (typers.length === 2) {
      typingText.textContent = `${typers[0]} and ${typers[1]} are typing`;
      typingIndicator.classList.remove('hidden');
      scrollToBottom();
    } else {
      typingText.textContent = `${typers[0]} and ${typers.length - 1} others are typing`;
      typingIndicator.classList.remove('hidden');
      scrollToBottom();
    }
  }

  // --- WEBRTC PEER CONNECTION ENGINE ---

  // Host: Broadcast to all connected participants
  function broadcastToAll(payload, excludePeerId = null) {
    connectedPeers.forEach((data, pId) => {
      if (pId !== excludePeerId && data.conn && data.conn.open) {
        try {
          data.conn.send(payload);
        } catch (e) {
          console.warn(`[BROADCAST] Failed to send to ${pId}:`, e);
        }
      }
    });
  }

  // --- ROOM CODE GENERATION (100% INSTANT SYNCHRONOUS CLICK) ---
  function handleGenerateRoom() {
    myNickname = getEffectiveNickname();
    isHost = true;

    // 1. Generate 6-digit room code INSTANTLY (0 ms latency)
    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    currentRoomCode = roomCode;

    // 2. Update UI Immediately
    if (createdCodeDisplay) createdCodeDisplay.textContent = roomCode;
    if (createActions) createActions.classList.remove('hidden');
    if (btnGenerateCode) btnGenerateCode.classList.add('hidden');
    showToast(`Room #${roomCode} generated! Share code or enter chat.`, 'success');

    // 3. Initialize WebRTC Host Session
    initHostSession(roomCode);
  }

  function initHostSession(roomCode) {
    const hostPeerId = `chatling-${roomCode}`;

    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }

    if (typeof Peer === 'undefined') {
      console.warn('PeerJS library loading...');
      return;
    }

    try {
      peer = new Peer(hostPeerId, PEER_CONFIG);

      peer.on('open', (id) => {
        myPeerId = id;
        groupRoster = [{ id: myPeerId, name: myNickname, isHost: true }];
        console.log(`[HOST] Group Host active with ID: ${id}`);
      });

      peer.on('connection', (conn) => {
        const joinerId = conn.peer;

        conn.on('open', () => {
          console.log(`[HOST] Joiner connected: ${joinerId}`);
        });

        conn.on('data', (data) => {
          if (!data || !data.type) return;

          // Join request from participant
          if (data.type === 'join-request') {
            const joinerName = (data.nickname || 'Member').slice(0, 20);

            connectedPeers.set(data.senderId, {
              conn,
              nickname: joinerName,
              isHost: false
            });

            groupRoster = groupRoster.filter(m => m.id !== data.senderId);
            groupRoster.push({
              id: data.senderId,
              name: joinerName,
              isHost: false
            });

            // Approve joiner and send current roster
            try {
              conn.send({
                type: 'join-approved',
                roomCode: currentRoomCode,
                members: groupRoster,
                hostName: myNickname
              });
            } catch (e) {}

            // Broadcast new member to everyone else
            broadcastToAll({
              type: 'member-joined',
              member: { id: data.senderId, name: joinerName },
              members: groupRoster
            }, data.senderId);

            showToast(`${joinerName} joined the group!`, 'success');
            appendSystemBanner(`${joinerName} joined the group`);
            updateGroupStatus();
            playNotificationSound();
            return;
          }

          // Group Message from participant (Host relays to all others)
          if (data.type === 'chat') {
            if (!seenMessageIds.has(data.id)) {
              seenMessageIds.add(data.id);

              appendMessage({
                id: data.id,
                senderName: data.senderName,
                senderId: data.senderId,
                content: data.content,
                isOutgoing: false,
                timestamp: data.timestamp
              });

              playNotificationSound();

              // Relay to all other members
              broadcastToAll(data, data.senderId);

              // Acknowledge delivery
              try { conn.send({ type: 'ack', id: data.id }); } catch (e) {}
            }
            return;
          }

          // Typing indicators
          if (data.type === 'typing' || data.type === 'stop-typing') {
            handleIncomingTyping(data);
            broadcastToAll(data, data.senderId);
            return;
          }

          // Member leaves
          if (data.type === 'leave') {
            handleMemberDeparture(data.senderId, data.nickname);
            return;
          }
        });

        conn.on('close', () => {
          handleMemberDeparture(joinerId);
        });

        conn.on('error', (err) => {
          console.warn(`[HOST] Conn error with ${joinerId}:`, err);
        });
      });

      peer.on('error', (err) => {
        console.warn('[HOST] Peer error:', err);
        if (err.type === 'unavailable-id') {
          // Room collision: regenerate code
          handleGenerateRoom();
        }
      });
    } catch (e) {
      console.error('[HOST] Init error:', e);
    }
  }

  // --- JOINING ROOM (MEMBER ROLE) ---
  function handleJoinRoom() {
    if (!joinCodeInput) return;
    const code = joinCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      showToast('Please enter a valid 6-digit room code.', 'error');
      return;
    }

    myNickname = getEffectiveNickname();
    isHost = false;
    currentRoomCode = code;

    showToast(`Connecting to group #${code}...`, 'info');

    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }

    const hostPeerId = `chatling-${code}`;

    try {
      peer = new Peer(PEER_CONFIG);

      peer.on('open', (id) => {
        myPeerId = id;
        console.log(`[MEMBER] My peer ID: ${id}`);

        // Connect to host
        hostConnection = peer.connect(hostPeerId, { reliable: true });

        hostConnection.on('open', () => {
          // Send join request
          hostConnection.send({
            type: 'join-request',
            senderId: myPeerId,
            nickname: myNickname
          });
        });

        hostConnection.on('data', (data) => {
          if (!data || !data.type) return;

          // 1. Join Approved
          if (data.type === 'join-approved') {
            groupRoster = Array.isArray(data.members) ? data.members : [];
            enterChatView(code);
            showToast(`Joined Group #${code}!`, 'success');
            appendSystemBanner(`Joined Group #${code}`);
            updateGroupStatus();
            return;
          }

          // 2. Another Member Joined
          if (data.type === 'member-joined') {
            if (Array.isArray(data.members)) groupRoster = data.members;
            const joinerName = data.member ? data.member.name : 'A member';
            showToast(`${joinerName} joined the group!`, 'success');
            appendSystemBanner(`${joinerName} joined the group`);
            updateGroupStatus();
            playNotificationSound();
            return;
          }

          // 3. Incoming Chat Message
          if (data.type === 'chat') {
            if (!seenMessageIds.has(data.id)) {
              seenMessageIds.add(data.id);
              appendMessage({
                id: data.id,
                senderName: data.senderName,
                senderId: data.senderId,
                content: data.content,
                isOutgoing: false,
                timestamp: data.timestamp
              });
              playNotificationSound();
            }
            return;
          }

          // 4. Delivery Ack
          if (data.type === 'ack') {
            markMessageDelivered(data.id);
            return;
          }

          // 5. Typing Indicators
          if (data.type === 'typing' || data.type === 'stop-typing') {
            handleIncomingTyping(data);
            return;
          }

          // 6. Member Left
          if (data.type === 'member-left') {
            if (Array.isArray(data.members)) groupRoster = data.members;
            const leftName = data.nickname || 'A member';
            showToast(`${leftName} left the group.`, 'info');
            appendSystemBanner(`${leftName} left the group`);
            updateGroupStatus();
            return;
          }

          // 7. Host Closed
          if (data.type === 'host-closed') {
            showToast('The group host has ended the room.', 'info');
            leaveChatRoom(false);
            return;
          }
        });

        hostConnection.on('close', () => {
          showToast('Disconnected from group host.', 'info');
          appendSystemBanner('Connection to group host lost');
        });

        hostConnection.on('error', (err) => {
          console.warn('[MEMBER] Host conn error:', err);
        });
      });

      peer.on('error', (err) => {
        console.warn('[MEMBER] Peer error:', err);
        if (err.type === 'peer-unavailable') {
          showToast(`Group #${code} not found or host is offline.`, 'error');
        } else {
          showToast(`Connection notice: ${err.type || 'network issue'}`, 'info');
        }
      });

    } catch (e) {
      console.error('[MEMBER] Init error:', e);
    }
  }

  function handleIncomingTyping(data) {
    if (!data || !data.senderId) return;

    if (data.type === 'typing') {
      const name = data.nickname || 'Someone';
      if (activeTypers.has(data.senderId)) {
        clearTimeout(activeTypers.get(data.senderId).timer);
      }
      const timer = setTimeout(() => {
        activeTypers.delete(data.senderId);
        updateTypingDisplay();
      }, 3500);

      activeTypers.set(data.senderId, { nickname: name, timer });
      updateTypingDisplay();
    } else if (data.type === 'stop-typing') {
      if (activeTypers.has(data.senderId)) {
        clearTimeout(activeTypers.get(data.senderId).timer);
        activeTypers.delete(data.senderId);
      }
      updateTypingDisplay();
    }
  }

  function handleMemberDeparture(peerId, explicitName = null) {
    if (!connectedPeers.has(peerId)) return;
    const pData = connectedPeers.get(peerId);
    const departedName = explicitName || (pData ? pData.nickname : 'A participant');

    connectedPeers.delete(peerId);
    groupRoster = groupRoster.filter(m => m.id !== peerId);

    if (activeTypers.has(peerId)) {
      clearTimeout(activeTypers.get(peerId).timer);
      activeTypers.delete(peerId);
      updateTypingDisplay();
    }

    updateGroupStatus();
    appendSystemBanner(`${departedName} left the group`);
    showToast(`${departedName} left the group.`, 'info');

    broadcastToAll({
      type: 'member-left',
      memberId: peerId,
      nickname: departedName,
      members: groupRoster
    });
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      if (isHost) {
        broadcastToAll({ type: 'ping' });
      } else if (hostConnection && hostConnection.open) {
        try { hostConnection.send({ type: 'ping' }); } catch (e) {}
      }
    }, 15000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  // --- EVENT LISTENERS ---

  if (btnGenerateCode) btnGenerateCode.addEventListener('click', handleGenerateRoom);

  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      if (currentRoomCode) {
        navigator.clipboard.writeText(currentRoomCode);
        showToast('Room code copied to clipboard!', 'info');
      }
    });
  }

  async function shareOrCopyInvite() {
    if (!currentRoomCode) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join our private group chat on Chatling',
          text: `Join my private group chat on Chatling (Room: ${currentRoomCode})`,
          url: shareUrl
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    navigator.clipboard.writeText(shareUrl);
    showToast('Direct group invite link copied to clipboard!', 'info');
  }

  if (btnCopyLink) btnCopyLink.addEventListener('click', shareOrCopyInvite);
  if (headerInviteBtn) headerInviteBtn.addEventListener('click', shareOrCopyInvite);
  if (btnModalInvite) btnModalInvite.addEventListener('click', shareOrCopyInvite);

  if (btnModalCopyCode) {
    btnModalCopyCode.addEventListener('click', () => {
      if (currentRoomCode) {
        navigator.clipboard.writeText(currentRoomCode);
        showToast(`Room Code ${currentRoomCode} copied!`, 'info');
      }
    });
  }

  if (btnEnterChat) {
    btnEnterChat.addEventListener('click', () => {
      if (currentRoomCode) {
        enterChatView(currentRoomCode);
      }
    });
  }

  if (btnJoinRoom) btnJoinRoom.addEventListener('click', handleJoinRoom);

  if (joinCodeInput) {
    joinCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleJoinRoom();
      }
    });
  }

  // Auto-join from URL parameter ?room=XXXXXX
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam && /^\d{6}$/.test(roomParam)) {
    switchHomeTab('join');
    if (joinCodeInput) joinCodeInput.value = roomParam;
    setTimeout(() => {
      handleJoinRoom();
    }, 400);
  }

  // Home Navigation Tabs
  if (tabCreate) tabCreate.addEventListener('click', () => switchHomeTab('create'));
  if (tabJoin) tabJoin.addEventListener('click', () => switchHomeTab('join'));

  // Group Members Modal
  if (btnGroupInfo && membersModal) {
    btnGroupInfo.addEventListener('click', () => {
      renderMembersList();
      membersModal.classList.remove('hidden');
    });
  }

  if (btnCloseMembers && membersModal) {
    btnCloseMembers.addEventListener('click', () => {
      membersModal.classList.add('hidden');
    });
  }

  if (membersModal) {
    membersModal.addEventListener('click', (e) => {
      if (e.target === membersModal) {
        membersModal.classList.add('hidden');
      }
    });
  }

  // Header Room Code Pill
  if (headerCodePill) {
    headerCodePill.addEventListener('click', () => {
      if (currentRoomCode) {
        navigator.clipboard.writeText(currentRoomCode);
        showToast(`Room Code ${currentRoomCode} copied!`, 'info');
      }
    });
  }

  // Clear Chat Button
  if (btnClearChat) {
    btnClearChat.addEventListener('click', () => {
      if (!confirm('Clear all messages from your device?')) return;
      if (chatMessages) {
        const banners = chatMessages.querySelectorAll('div[id^="msg-wrap-"]');
        banners.forEach(b => b.remove());
        showToast('Chat history cleared locally.', 'info');
      }
    });
  }

  // Leave Group Room
  function leaveChatRoom(shouldConfirm = true) {
    if (shouldConfirm && !confirm('Are you sure you want to leave this group chat?')) {
      return;
    }

    if (isHost) {
      broadcastToAll({
        type: 'host-closed',
        message: 'The group host has ended the chat.'
      });
    } else if (hostConnection && hostConnection.open) {
      try {
        hostConnection.send({
          type: 'leave',
          senderId: myPeerId,
          nickname: myNickname
        });
      } catch (e) {}
    }

    stopHeartbeat();

    connectedPeers.forEach(p => {
      try { p.conn.close(); } catch (e) {}
    });
    connectedPeers.clear();

    if (hostConnection) {
      try { hostConnection.close(); } catch (e) {}
      hostConnection = null;
    }

    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }

    groupRoster = [];
    activeTypers.clear();
    seenMessageIds.clear();
    currentRoomCode = null;
    isHost = false;

    if (chatView) chatView.classList.add('hidden');
    if (homeView) homeView.classList.remove('hidden');
    if (createActions) createActions.classList.add('hidden');
    if (btnGenerateCode) btnGenerateCode.classList.remove('hidden');
    if (createdCodeDisplay) createdCodeDisplay.textContent = '------';
    if (joinCodeInput) joinCodeInput.value = '';

    if (chatMessages) {
      const messages = chatMessages.querySelectorAll('div[id^="msg-wrap-"]');
      messages.forEach(m => m.remove());
    }

    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    showToast('You left the group chat.', 'info');
  }

  if (btnLeaveChat) btnLeaveChat.addEventListener('click', () => leaveChatRoom(true));

  // --- TYPING INDICATORS ---
  if (messageInput) {
    messageInput.addEventListener('input', () => {
      if (!currentRoomCode) return;

      if (!isTyping) {
        isTyping = true;
        const typingPayload = {
          type: 'typing',
          senderId: myPeerId,
          nickname: myNickname
        };
        if (isHost) {
          broadcastToAll(typingPayload);
        } else if (hostConnection && hostConnection.open) {
          try { hostConnection.send(typingPayload); } catch (e) {}
        }
      }

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
        const stopPayload = {
          type: 'stop-typing',
          senderId: myPeerId
        };
        if (isHost) {
          broadcastToAll(stopPayload);
        } else if (hostConnection && hostConnection.open) {
          try { hostConnection.send(stopPayload); } catch (e) {}
        }
      }, 2500);
    });
  }

  // --- EMOJI PICKER ---
  if (btnEmojiToggle && emojiPicker) {
    btnEmojiToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!emojiPicker.contains(e.target) && e.target !== btnEmojiToggle) {
        emojiPicker.classList.add('hidden');
      }
    });

    const emojiButtons = emojiPicker.querySelectorAll('.emoji-btn');
    emojiButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (messageInput) {
          messageInput.value += btn.textContent;
          messageInput.focus();
        }
      });
    });
  }

  // --- SEND MESSAGE ---
  function handleSendMessage() {
    if (!messageInput) return;
    const content = messageInput.value.trim();
    if (!content || !currentRoomCode) return;

    const trimmedContent = content.slice(0, 2000);
    const tempId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    messageInput.value = '';
    seenMessageIds.add(tempId);

    const hasPeers = isHost ? connectedPeers.size > 0 : (hostConnection && hostConnection.open);

    // Append outgoing bubble locally (WhatsApp soft green bubble)
    appendMessage({
      id: tempId,
      senderName: myNickname,
      senderId: myPeerId,
      content: trimmedContent,
      isOutgoing: true,
      timestamp,
      status: hasPeers ? 'delivered' : 'sent'
    });

    const msgPayload = {
      type: 'chat',
      id: tempId,
      senderName: myNickname,
      senderId: myPeerId,
      content: trimmedContent,
      timestamp
    };

    if (isHost) {
      broadcastToAll(msgPayload);
    } else if (hostConnection && hostConnection.open) {
      try { hostConnection.send(msgPayload); } catch (e) {}
    }

    // Stop typing
    const stopPayload = {
      type: 'stop-typing',
      senderId: myPeerId
    };
    if (isHost) {
      broadcastToAll(stopPayload);
    } else if (hostConnection && hostConnection.open) {
      try { hostConnection.send(stopPayload); } catch (e) {}
    }
    isTyping = false;
    clearTimeout(typingTimeout);

    messageInput.focus();
    scrollToBottom();
  }

  if (messageForm) {
    messageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSendMessage();
    });
  }

  // Dismiss keyboard when scrolling or tapping chat background (WhatsApp Mobile feature)
  if (chatMessages) {
    const dismissKeyboard = (e) => {
      if (e.target && e.target.closest && e.target.closest('button, a, input, textarea')) return;
      if (document.activeElement === messageInput) {
        messageInput.blur();
      }
    };

    chatMessages.addEventListener('touchstart', dismissKeyboard, { passive: true });
    chatMessages.addEventListener('mousedown', dismissKeyboard);

    let isUserScrolling = false;
    chatMessages.addEventListener('scroll', () => {
      if (document.activeElement === messageInput && isUserScrolling) {
        messageInput.blur();
      }
    }, { passive: true });

    chatMessages.addEventListener('touchmove', () => {
      isUserScrolling = true;
    }, { passive: true });

    chatMessages.addEventListener('touchend', () => {
      isUserScrolling = false;
    }, { passive: true });
  }

  // Global offline / online indicator
  window.addEventListener('offline', () => {
    if (connectionBanner) connectionBanner.classList.remove('hidden');
  });

  window.addEventListener('online', () => {
    if (connectionBanner) connectionBanner.classList.add('hidden');
    showToast('Network online.', 'success');
  });
});
