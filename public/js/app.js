// Chatling - Private Ephemeral Group Web Chat Engine
// WebRTC DataChannel Full-Mesh Architecture with Automatic Signaling & Failover
// Clean Light Theme Default (WhatsApp Emerald/Light Aesthetic)

document.addEventListener('DOMContentLoaded', () => {
  // WebRTC ICE Servers Configuration (Google STUN for NAT & LAN Traversal)
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  // State
  let socket = null;
  let myPeerId = null;
  let myNickname = '';
  let isHost = false;
  let currentRoomCode = null;

  // Active WebRTC Mesh: Map<peerId, { pc: RTCPeerConnection, dc: RTCDataChannel, nickname: string, dcOpen: boolean }>
  const peers = new Map();

  // Queued ICE candidates prior to setRemoteDescription: Map<peerId, RTCIceCandidateInit[]>
  const iceCandidateQueues = new Map();

  // Group Roster: Array<{ id: string, name: string, isHost: boolean }>
  let groupRoster = [];

  // Message deduplication
  const seenMessageIds = new Set();

  // Typing state: Map<peerId, { nickname: string, timer: any }>
  const activeTypers = new Map();
  let typingTimeout = null;
  let isTyping = false;
  let heartbeatInterval = null;

  // WhatsApp-style Participant Colors
  const NAME_COLORS = [
    '#10b981', // Emerald
    '#0284c7', // Sky Blue
    '#8b5cf6', // Violet
    '#f59e0b', // Amber
    '#ec4899', // Pink
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

  // Force Light Theme default unless user explicitly chose dark
  const savedTheme = localStorage.getItem('chatling_theme');
  const isDarkMode = savedTheme === 'dark'; // Strict light default
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
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
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

  // --- MESSAGE BUBBLES ---
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
        statusTicks = `<svg class="w-3.5 h-3.5 text-sky-300 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7M5 7l4 4L19 1"/></svg>`;
      } else {
        statusTicks = `<svg class="w-3.5 h-3.5 text-emerald-200 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
      }
    }

    if (isOutgoing) {
      wrapper.className = 'flex items-end justify-end my-1.5 w-full';
      wrapper.innerHTML = `
        <div class="bubble bubble-out py-2 px-3 sm:px-3.5 rounded-2xl rounded-br-xs text-xs sm:text-sm max-w-[85%] sm:max-w-[70%] shadow-xs">
          <div class="leading-relaxed break-words overflow-wrap-anywhere">${contentHtml}</div>
          <div class="flex items-center justify-end gap-1 text-[10px] text-emerald-100 mt-1 select-none">
            <span>${timeStr}</span>
            <span class="tick-icon">${statusTicks}</span>
          </div>
        </div>
      `;
    } else {
      const name = senderName || 'Member';
      const nameColor = getSenderColor(name);
      const initial = escapeHTML(name.charAt(0).toUpperCase());

      wrapper.className = 'flex items-end justify-start gap-1.5 sm:gap-2 my-1.5 w-full';
      wrapper.innerHTML = `
        <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-bold text-white text-[10px] sm:text-xs shrink-0 select-none shadow-xs" style="background-color: ${nameColor}">
          ${initial}
        </div>
        <div class="bubble bubble-in py-2 px-3 sm:px-3.5 rounded-2xl rounded-bl-xs text-xs sm:text-sm max-w-[85%] sm:max-w-[70%]">
          <div class="text-[11px] font-bold mb-0.5 select-none" style="color: ${nameColor}">
            ${escapeHTML(name)}
          </div>
          <div class="leading-relaxed break-words overflow-wrap-anywhere text-slate-800 dark:text-slate-100">${contentHtml}</div>
          <div class="flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-slate-500 mt-1 select-none">
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
    banner.className = 'flex justify-center my-2 select-none';
    banner.innerHTML = `
      <div class="bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[10px] sm:text-xs px-3 py-1 rounded-full shadow-2xs backdrop-blur-sm max-w-[90%] text-center truncate">
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
        tickSpan.innerHTML = `<svg class="w-3.5 h-3.5 text-sky-300 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7M5 7l4 4L19 1"/></svg>`;
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

  // --- WEBRTC CORE (GLARE-FREE PEER NEGOTIATION) ---

  // Connect to local signaling server
  function connectSignalingServer() {
    if (socket && socket.connected) return Promise.resolve(socket);

    return new Promise((resolve, reject) => {
      if (typeof io === 'undefined') {
        reject(new Error('Socket.IO client library is not loaded. Ensure local server is running.'));
        return;
      }

      socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 10000
      });

      socket.on('connect', () => {
        myPeerId = socket.id;
        console.log('[SIGNALING] Connected with ID:', myPeerId);
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        console.warn('[SIGNALING] Connection error:', err.message);
      });

      // Forwarded WebRTC Signals (Offer, Answer, Candidate)
      socket.on('signal', handleRemoteSignal);

      // Other peer leaves
      socket.on('user-left', ({ peerId, nickname, roster }) => {
        handlePeerDeparture(peerId, nickname, roster);
      });

      // Socket Fallback Messages (in case WebRTC DataChannel is restricted)
      socket.on('relay-message', (data) => {
        handleIncomingChatMessage(data);
      });

      socket.on('relay-typing', (data) => {
        handleIncomingTyping(data);
      });
    });
  }

  // Create an RTCPeerConnection for a remote peer
  function getOrCreatePeer(remotePeerId, remoteNickname) {
    if (peers.has(remotePeerId)) {
      return peers.get(remotePeerId);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerData = {
      pc,
      dc: null,
      nickname: remoteNickname || 'Member',
      dcOpen: false
    };

    peers.set(remotePeerId, peerData);
    if (!iceCandidateQueues.has(remotePeerId)) {
      iceCandidateQueues.set(remotePeerId, []);
    }

    // ICE Candidate event
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected) {
        socket.emit('signal', {
          to: remotePeerId,
          signal: {
            type: 'candidate',
            candidate: event.candidate
          }
        });
      }
    };

    // Connection State Change
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${remotePeerId} state:`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        handlePeerDeparture(remotePeerId, peerData.nickname);
      }
    };

    return peerData;
  }

  // Setup RTCDataChannel events
  function setupDataChannel(remotePeerId, dc) {
    dc.onopen = () => {
      console.log(`[WebRTC DC] DataChannel OPEN with ${remotePeerId}`);
      const peerData = peers.get(remotePeerId);
      if (peerData) {
        peerData.dcOpen = true;
      }

      // Send handshake
      try {
        dc.send(JSON.stringify({
          type: 'handshake',
          senderId: myPeerId,
          nickname: myNickname,
          isHost: isHost
        }));
      } catch (e) {}

      updateGroupStatus();
    };

    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleDataChannelPayload(remotePeerId, data);
      } catch (e) {
        console.warn('[WebRTC DC] Failed to parse message:', e);
      }
    };

    dc.onclose = () => {
      console.log(`[WebRTC DC] DataChannel CLOSED with ${remotePeerId}`);
      const peerData = peers.get(remotePeerId);
      if (peerData) {
        peerData.dcOpen = false;
      }
    };

    dc.onerror = (err) => {
      console.warn(`[WebRTC DC] Error with ${remotePeerId}:`, err);
    };
  }

  // Drain queued ICE candidates once remoteDescription is set
  async function drainIceCandidates(remotePeerId, pc) {
    const queue = iceCandidateQueues.get(remotePeerId) || [];
    while (queue.length > 0) {
      const candidate = queue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] Error adding queued candidate:', e);
      }
    }
  }

  // INITIATOR: Joiner initiates WebRTC connection with an existing peer
  async function initiatePeerConnection(remotePeerId, remoteNickname) {
    console.log(`[WebRTC] Initiating offer to existing peer: ${remoteNickname} (${remotePeerId})`);
    const peerData = getOrCreatePeer(remotePeerId, remoteNickname);
    const pc = peerData.pc;

    // Create reliable ordered DataChannel
    const dc = pc.createDataChannel('chatling', { ordered: true });
    peerData.dc = dc;
    setupDataChannel(remotePeerId, dc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (socket && socket.connected) {
        socket.emit('signal', {
          to: remotePeerId,
          signal: {
            type: 'offer',
            sdp: pc.localDescription
          }
        });
      }
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
    }
  }

  // RECEIVER: Handle incoming signaling messages
  async function handleRemoteSignal({ from, signal }) {
    if (!signal) return;

    try {
      // 1. Incoming Offer (We are the receiver)
      if (signal.type === 'offer') {
        console.log(`[WebRTC] Received offer from ${from}`);
        const peerData = getOrCreatePeer(from, 'Member');
        const pc = peerData.pc;

        // Listen for remote DataChannel
        pc.ondatachannel = (e) => {
          peerData.dc = e.channel;
          setupDataChannel(from, e.channel);
        };

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await drainIceCandidates(from, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (socket && socket.connected) {
          socket.emit('signal', {
            to: from,
            signal: {
              type: 'answer',
              sdp: pc.localDescription
            }
          });
        }
      }
      // 2. Incoming Answer (We were the initiator)
      else if (signal.type === 'answer') {
        console.log(`[WebRTC] Received answer from ${from}`);
        const peerData = peers.get(from);
        if (peerData && peerData.pc) {
          await peerData.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await drainIceCandidates(from, peerData.pc);
        }
      }
      // 3. Incoming ICE Candidate
      else if (signal.type === 'candidate' && signal.candidate) {
        const peerData = peers.get(from);
        if (peerData && peerData.pc && peerData.pc.remoteDescription) {
          try {
            await peerData.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('[WebRTC] Candidate error:', e);
          }
        } else {
          // Queue until setRemoteDescription completes
          const queue = iceCandidateQueues.get(from) || [];
          queue.push(signal.candidate);
          iceCandidateQueues.set(from, queue);
        }
      }
    } catch (err) {
      console.error('[WebRTC] handleRemoteSignal error:', err);
    }
  }

  // --- DATACHANNEL MESSAGES ---
  function handleDataChannelPayload(senderPeerId, data) {
    if (!data || !data.type) return;

    if (data.type === 'handshake') {
      const peerData = peers.get(senderPeerId);
      if (peerData) peerData.nickname = data.nickname || 'Member';

      if (!groupRoster.some(m => m.id === senderPeerId)) {
        groupRoster.push({
          id: senderPeerId,
          name: data.nickname || 'Member',
          isHost: !!data.isHost
        });
      }

      showToast(`${data.nickname || 'Participant'} joined via WebRTC!`, 'success');
      appendSystemBanner(`${data.nickname || 'A participant'} joined the group`);
      updateGroupStatus();
      playNotificationSound();
      return;
    }

    if (data.type === 'chat') {
      handleIncomingChatMessage(data);
      // Acknowledge delivery
      const peerData = peers.get(senderPeerId);
      if (peerData && peerData.dc && peerData.dc.readyState === 'open') {
        try { peerData.dc.send(JSON.stringify({ type: 'ack', id: data.id })); } catch (e) {}
      }
      return;
    }

    if (data.type === 'ack') {
      markMessageDelivered(data.id);
      return;
    }

    if (data.type === 'typing' || data.type === 'stop-typing') {
      handleIncomingTyping(data);
      return;
    }

    if (data.type === 'ping') {
      const peerData = peers.get(senderPeerId);
      if (peerData && peerData.dc && peerData.dc.readyState === 'open') {
        try { peerData.dc.send(JSON.stringify({ type: 'pong' })); } catch (e) {}
      }
      return;
    }

    if (data.type === 'leave') {
      handlePeerDeparture(senderPeerId, data.nickname);
      return;
    }
  }

  function handleIncomingChatMessage(data) {
    if (!data || !data.id) return;
    if (seenMessageIds.has(data.id)) return;
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

  function handlePeerDeparture(peerId, explicitName = null, updatedRoster = null) {
    if (!peers.has(peerId) && !groupRoster.some(m => m.id === peerId)) return;

    const peerData = peers.get(peerId);
    const departedName = explicitName || (peerData ? peerData.nickname : 'A participant');

    if (peerData) {
      try {
        if (peerData.dc) peerData.dc.close();
        if (peerData.pc) peerData.pc.close();
      } catch (e) {}
      peers.delete(peerId);
    }
    iceCandidateQueues.delete(peerId);

    if (updatedRoster && Array.isArray(updatedRoster)) {
      groupRoster = updatedRoster.map(m => ({ id: m.id, name: m.nickname || m.name, isHost: m.isHost }));
    } else {
      groupRoster = groupRoster.filter(m => m.id !== peerId);
    }

    if (activeTypers.has(peerId)) {
      clearTimeout(activeTypers.get(peerId).timer);
      activeTypers.delete(peerId);
      updateTypingDisplay();
    }

    updateGroupStatus();
    appendSystemBanner(`${departedName} left the group`);
    showToast(`${departedName} left the group.`, 'info');
  }

  // Broadcast payload across WebRTC DataChannels + Socket Relay fallback
  function broadcastGroupPayload(payload) {
    const raw = JSON.stringify(payload);
    let dcSentCount = 0;

    peers.forEach((peerData) => {
      if (peerData.dc && peerData.dc.readyState === 'open') {
        try {
          peerData.dc.send(raw);
          dcSentCount++;
        } catch (e) {}
      }
    });

    // Fallback: If any peer doesn't have an open DataChannel, relay via socket
    if (socket && socket.connected && dcSentCount < peers.size) {
      if (payload.type === 'chat') {
        socket.emit('relay-message', payload);
      } else if (payload.type === 'typing' || payload.type === 'stop-typing') {
        socket.emit('relay-typing', payload);
      }
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      broadcastGroupPayload({ type: 'ping' });
    }, 15000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  // --- ROOM CREATION (HOST ROLE) ---
  async function createRoomSession() {
    myNickname = getEffectiveNickname();
    isHost = true;

    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    currentRoomCode = roomCode;

    try {
      showToast('Connecting to server...', 'info');
      const sigSocket = await connectSignalingServer();

      // Clean old listeners
      sigSocket.off('room-joined-ack');
      sigSocket.off('user-joined');

      sigSocket.emit('join-room', {
        roomCode,
        nickname: myNickname,
        isHost: true
      });

      sigSocket.once('room-joined-ack', ({ roster }) => {
        groupRoster = [{ id: myPeerId, name: myNickname, isHost: true }];
        if (createdCodeDisplay) createdCodeDisplay.textContent = roomCode;
        if (createActions) createActions.classList.remove('hidden');
        if (btnGenerateCode) btnGenerateCode.classList.add('hidden');
        showToast(`Group Room #${roomCode} created!`, 'success');
      });

      // Existing host listens for new joiners
      // Notice: Existing host DOES NOT create an offer. The new joiner initiates!
      sigSocket.on('user-joined', ({ peerId, nickname, isHost: remoteIsHost, roster }) => {
        if (roster && Array.isArray(roster)) {
          groupRoster = roster.map(m => ({ id: m.id, name: m.nickname || m.name, isHost: m.isHost }));
        } else if (!groupRoster.some(m => m.id === peerId)) {
          groupRoster.push({ id: peerId, name: nickname, isHost: remoteIsHost });
        }
        updateGroupStatus();
      });

    } catch (err) {
      console.error('[ROOM CREATE ERROR]', err);
      showToast('Could not reach local server. Run start.bat!', 'error');
    }
  }

  if (btnGenerateCode) btnGenerateCode.addEventListener('click', createRoomSession);

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

  // --- ROOM JOINING (JOINER ROLE) ---
  async function handleJoinRoom() {
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

    try {
      const sigSocket = await connectSignalingServer();

      sigSocket.off('room-joined-ack');
      sigSocket.off('user-joined');

      sigSocket.emit('join-room', {
        roomCode: code,
        nickname: myNickname,
        isHost: false
      });

      sigSocket.once('room-joined-ack', ({ peerId, existingUsers, roster }) => {
        myPeerId = peerId;

        if (roster && Array.isArray(roster)) {
          groupRoster = roster.map(m => ({ id: m.id, name: m.nickname || m.name, isHost: m.isHost }));
        } else {
          groupRoster = [{ id: myPeerId, name: myNickname, isHost: false }];
        }

        // As the NEW joiner, we initiate WebRTC connections to all EXISTING users
        if (Array.isArray(existingUsers)) {
          existingUsers.forEach(u => {
            initiatePeerConnection(u.id, u.nickname);
          });
        }

        enterChatView(code);
        showToast(`Joined Group #${code}!`, 'success');
        appendSystemBanner(`Joined Group #${code}`);
        updateGroupStatus();
      });

      // Subsequent peers who join after us
      sigSocket.on('user-joined', ({ peerId, nickname, isHost: remoteIsHost, roster }) => {
        if (roster && Array.isArray(roster)) {
          groupRoster = roster.map(m => ({ id: m.id, name: m.nickname || m.name, isHost: m.isHost }));
        } else if (!groupRoster.some(m => m.id === peerId)) {
          groupRoster.push({ id: peerId, name: nickname, isHost: remoteIsHost });
        }
        updateGroupStatus();
      });

    } catch (err) {
      console.error('[JOIN ERROR]', err);
      showToast('Could not connect. Ensure start.bat is running!', 'error');
    }
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

  // --- HOME NAVIGATION TABS ---
  if (tabCreate) tabCreate.addEventListener('click', () => switchHomeTab('create'));
  if (tabJoin) tabJoin.addEventListener('click', () => switchHomeTab('join'));

  // --- GROUP MODAL ---
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

    broadcastGroupPayload({
      type: 'leave',
      senderId: myPeerId,
      nickname: myNickname
    });

    if (socket && socket.connected) {
      socket.emit('leave-room');
    }

    stopHeartbeat();

    // Teardown WebRTC peer connections
    peers.forEach((p) => {
      try {
        if (p.dc) p.dc.close();
        if (p.pc) p.pc.close();
      } catch (e) {}
    });
    peers.clear();
    iceCandidateQueues.clear();

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
        broadcastGroupPayload({
          type: 'typing',
          senderId: myPeerId,
          nickname: myNickname
        });
      }

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
        broadcastGroupPayload({
          type: 'stop-typing',
          senderId: myPeerId
        });
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

    const hasPeers = peers.size > 0;

    // Append outgoing bubble locally
    appendMessage({
      id: tempId,
      senderName: myNickname,
      senderId: myPeerId,
      content: trimmedContent,
      isOutgoing: true,
      timestamp,
      status: hasPeers ? 'sent' : 'delivered'
    });

    const msgPayload = {
      type: 'chat',
      id: tempId,
      senderName: myNickname,
      senderId: myPeerId,
      content: trimmedContent,
      timestamp
    };

    broadcastGroupPayload(msgPayload);

    // Stop typing
    broadcastGroupPayload({
      type: 'stop-typing',
      senderId: myPeerId
    });
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

  // Dismiss keyboard on scroll
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

  // Global offline / online
  window.addEventListener('offline', () => {
    if (connectionBanner) connectionBanner.classList.remove('hidden');
  });

  window.addEventListener('online', () => {
    if (connectionBanner) connectionBanner.classList.add('hidden');
    showToast('Network back online.', 'success');
  });
});
