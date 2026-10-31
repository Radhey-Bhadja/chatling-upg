// Chatling - Private Ephemeral Group Web Chat Engine
// Full Multi-User Group Architecture with Hub-and-Spoke Relay Coordination

document.addEventListener('DOMContentLoaded', () => {
  // WebRTC ICE Server Configuration for Live HTTPS / Mobile Carrier Traversal (STUN + TURN Fallback)
  const PEER_CONFIG = {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        // OpenRelay Public TURN Server fallback for symmetric NAT / strict mobile cellular firewalls
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelay',
          credential: 'openrelay'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelay',
          credential: 'openrelay'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelay',
          credential: 'openrelay'
        }
      ]
    },
    debug: 0
  };

  // State Management for Multi-User Group Chat
  let peer = null;
  let myPeerId = null;
  let myNickname = '';
  let isHost = false;
  let currentRoomCode = null;
  let hostConn = null; // Used by members to communicate with the host

  // Host tracks connected members: Map<peerId, { conn, nickname, isHost }>
  const connectedPeers = new Map();

  // Canonical group roster: Array<{ id: string, name: string, isHost: boolean }>
  let groupRoster = [];

  // Deduplication set for message IDs
  const seenMessageIds = new Set();

  // Typing indicators: Map<senderId, { nickname: string, timer: any }>
  const activeTypers = new Map();

  let typingTimeout = null;
  let isTyping = false;
  let heartbeatInterval = null;

  // Color palette for group participant names (WhatsApp style)
  const NAME_COLORS = [
    '#25D366', // WA Emerald
    '#0284c7', // Sky Blue
    '#8b5cf6', // Purple
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#f97316', // Orange
    '#6366f1', // Indigo
    '#ef4444'  // Coral Red
  ];

  function getSenderColor(nameOrId) {
    if (!nameOrId) return NAME_COLORS[0];
    let hash = 0;
    for (let i = 0; i < nameOrId.length; i++) {
      hash = nameOrId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % NAME_COLORS.length;
    return NAME_COLORS[index];
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

  // Modal Elements
  const membersModal = document.getElementById('members-modal');
  const btnCloseMembers = document.getElementById('btn-close-members');
  const membersList = document.getElementById('members-list');
  const modalMemberCount = document.getElementById('modal-member-count');
  const modalRoomCodeVal = document.getElementById('modal-room-code-val');
  const btnModalCopyCode = document.getElementById('btn-modal-copy-code');
  const btnModalInvite = document.getElementById('btn-modal-invite');

  // Notification Elements
  const toastContainer = document.getElementById('toast-container');
  const connectionBanner = document.getElementById('connection-banner');
  const iconSun = document.getElementById('icon-sun');
  const iconMoon = document.getElementById('icon-moon');

  // --- THEME MANAGEMENT & PERSISTENCE ---
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
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDarkMode = savedTheme ? savedTheme === 'dark' : prefersDark;
  updateThemeUI(isDarkMode);

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const isCurrentlyDark = document.documentElement.classList.contains('dark');
      const nextMode = !isCurrentlyDark;
      updateThemeUI(nextMode);
      localStorage.setItem('chatling_theme', nextMode ? 'dark' : 'light');
    });
  }

  // --- AUDIO FEEDBACK (Synthesized Chime) ---
  function playNotificationSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
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
    const inputVal = userNicknameInput ? userNicknameInput.value.trim() : '';
    if (inputVal) return inputVal.slice(0, 20);
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
      // Fallback single member
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

    // Push browser history state
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

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      if (isHost) {
        broadcastToGroup({ type: 'ping' });
      } else if (hostConn && hostConn.open) {
        try { hostConn.send({ type: 'ping' }); } catch (e) {}
      }
    }, 15000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
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
    const date = isoString ? new Date(isoString) : new Date();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Broadcast a message to all connected members (Host Role)
  function broadcastToGroup(payload, excludePeerId = null) {
    connectedPeers.forEach((peerData, peerId) => {
      if (peerId !== excludePeerId && peerData.conn && peerData.conn.open) {
        try {
          peerData.conn.send(payload);
        } catch (e) {
          console.warn(`[BROADCAST] Failed to send to ${peerId}:`, e);
        }
      }
    });
  }

  // Append a chat bubble
  function appendMessage({ id, senderName, senderId, content, isOutgoing, timestamp, status = 'sent' }) {
    if (!chatMessages) return;
    
    // Check if message is already rendered
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
      // Outgoing Message (Right Aligned, Green Gradient)
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
      // Incoming Group Message (Left Aligned with Sender Avatar & WhatsApp Color Tag)
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

  function setupPeerErrorHandlers(p) {
    p.on('error', (err) => {
      console.warn('[PEER ERROR]', err);
      if (err.type === 'peer-unavailable') {
        showToast('Group room host is offline or code is invalid.', 'error');
      } else if (err.type === 'unavailable-id') {
        showToast('Room code collision. Re-generating...', 'info');
      } else {
        showToast(`Notice: ${err.type || 'Connection alert'}`, 'info');
      }
    });
  }

  // --- HOME EVENT LISTENERS ---
  if (tabCreate) tabCreate.addEventListener('click', () => switchHomeTab('create'));
  if (tabJoin) tabJoin.addEventListener('click', () => switchHomeTab('join'));

  // --- ROOM CREATION (HOST ROLE) ---
  function createRoomSession(retryCount = 0) {
    if (retryCount > 4) {
      showToast('Could not allocate available room. Please try again.', 'error');
      return;
    }

    myNickname = getEffectiveNickname();
    isHost = true;

    // Random 6-digit numeric room code
    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hostPeerId = `chatling-grp-${roomCode}`;

    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }

    peer = new Peer(hostPeerId, PEER_CONFIG);
    setupPeerErrorHandlers(peer);

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        createRoomSession(retryCount + 1);
      }
    });

    peer.on('open', (id) => {
      myPeerId = id;
      currentRoomCode = roomCode;
      groupRoster = [{ id: myPeerId, name: myNickname, isHost: true }];

      if (createdCodeDisplay) createdCodeDisplay.textContent = roomCode;
      if (createActions) createActions.classList.remove('hidden');
      if (btnGenerateCode) btnGenerateCode.classList.add('hidden');
      showToast(`Group Room ${roomCode} created!`, 'success');
    });

    // Accept incoming participants (Group Hub)
    peer.on('connection', (conn) => {
      const joinerPeerId = conn.peer;

      conn.on('open', () => {
        // Connection opened with a joiner
      });

      conn.on('data', (data) => {
        if (!data) return;

        if (data.type === 'ping') return;

        // 1. Join Request from a new participant
        if (data.type === 'join-request') {
          const joinerName = (data.nickname || 'Member').slice(0, 20);
          
          // Add to connected peers map
          connectedPeers.set(data.senderId, {
            conn: conn,
            nickname: joinerName,
            isHost: false
          });

          // Update canonical roster (prevent duplicates)
          groupRoster = groupRoster.filter(m => m.id !== data.senderId);
          groupRoster.push({
            id: data.senderId,
            name: joinerName,
            isHost: false
          });

          // Send approval and full roster back to the new joiner
          try {
            conn.send({
              type: 'join-approved',
              roomCode: currentRoomCode,
              members: groupRoster,
              hostName: myNickname
            });
          } catch (e) {}

          // Broadcast member-joined to all other members
          broadcastToGroup({
            type: 'member-joined',
            member: { id: data.senderId, name: joinerName },
            members: groupRoster
          }, data.senderId);

          // Update Host UI
          showToast(`${joinerName} joined the group!`, 'success');
          appendSystemBanner(`${joinerName} joined the group`);
          updateGroupStatus();
          playNotificationSound();
          return;
        }

        // 2. Incoming Group Message (Relay to all other members)
        if (data.type === 'group-message') {
          if (!seenMessageIds.has(data.id)) {
            seenMessageIds.add(data.id);

            // Display on Host's screen
            appendMessage({
              id: data.id,
              senderName: data.senderName,
              senderId: data.senderId,
              content: data.content,
              isOutgoing: false,
              timestamp: data.timestamp
            });

            playNotificationSound();

            // Relay message to ALL other group members
            broadcastToGroup({
              type: 'group-message',
              id: data.id,
              senderName: data.senderName,
              senderId: data.senderId,
              content: data.content,
              timestamp: data.timestamp
            }, data.senderId);

            // Send delivery acknowledgment back to the sender
            try {
              conn.send({ type: 'msg-ack', id: data.id });
            } catch (e) {}
          }
          return;
        }

        // 3. Typing Indicators (Relay to everyone)
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

          // Relay typing event to other members
          broadcastToGroup(data, data.senderId);
          return;
        }

        if (data.type === 'stop-typing') {
          if (activeTypers.has(data.senderId)) {
            clearTimeout(activeTypers.get(data.senderId).timer);
            activeTypers.delete(data.senderId);
          }
          updateTypingDisplay();

          // Relay stop-typing event to other members
          broadcastToGroup(data, data.senderId);
          return;
        }

        // 4. Member Voluntary Leave
        if (data.type === 'member-leave') {
          handleMemberDeparture(data.senderId, data.nickname);
          return;
        }
      });

      conn.on('close', () => {
        handleMemberDeparture(joinerPeerId);
      });

      conn.on('error', (err) => {
        console.warn(`[HOST] Conn error with ${joinerPeerId}:`, err);
      });
    });
  }

  function handleMemberDeparture(peerId, explicitName = null) {
    if (!connectedPeers.has(peerId)) return;
    const peerData = connectedPeers.get(peerId);
    const departedName = explicitName || (peerData ? peerData.nickname : 'A participant');

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

    // Broadcast departure to all remaining members
    broadcastToGroup({
      type: 'member-left',
      memberId: peerId,
      nickname: departedName,
      members: groupRoster
    });
  }

  if (btnGenerateCode) {
    btnGenerateCode.addEventListener('click', () => {
      if (typeof Peer === 'undefined') {
        showToast('WebRTC library loading... Check internet connection.', 'error');
        return;
      }
      showToast('Creating private group room...', 'info');
      createRoomSession();
    });
  }

  // Copy Code Button
  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      if (currentRoomCode) {
        navigator.clipboard.writeText(currentRoomCode);
        showToast('Room code copied to clipboard!', 'info');
      }
    });
  }

  // Share Direct Invite Link
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

  // Enter Chat Button from Create section
  if (btnEnterChat) {
    btnEnterChat.addEventListener('click', () => {
      if (currentRoomCode) {
        enterChatView(currentRoomCode);
      }
    });
  }

  // --- ROOM JOINING (JOINER ROLE) ---
  function handleJoinRoom() {
    if (!joinCodeInput) return;
    const code = joinCodeInput.value.trim();
    
    if (!/^\d{6}$/.test(code)) {
      showToast('Please enter a valid 6-digit room code.', 'error');
      return;
    }

    if (typeof Peer === 'undefined') {
      showToast('WebRTC library loading... Please wait a moment.', 'error');
      return;
    }

    myNickname = getEffectiveNickname();
    isHost = false;

    showToast(`Connecting to group #${code}...`, 'info');

    const hostPeerId = `chatling-grp-${code}`;

    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }

    peer = new Peer(PEER_CONFIG);
    setupPeerErrorHandlers(peer);

    peer.on('open', (id) => {
      myPeerId = id;
      currentRoomCode = code;

      // Connect to group room host
      hostConn = peer.connect(hostPeerId, { reliable: true });

      hostConn.on('open', () => {
        // Send join request with nickname and self ID
        hostConn.send({
          type: 'join-request',
          senderId: myPeerId,
          nickname: myNickname
        });
      });

      hostConn.on('data', (data) => {
        if (!data) return;

        if (data.type === 'ping') return;

        // 1. Join approved by Host
        if (data.type === 'join-approved') {
          groupRoster = Array.isArray(data.members) ? data.members : [];
          enterChatView(code);
          showToast(`Joined Group #${code}!`, 'success');
          appendSystemBanner(`Joined Group #${code}`);
          updateGroupStatus();
          return;
        }

        // 2. Another member joined
        if (data.type === 'member-joined') {
          if (Array.isArray(data.members)) {
            groupRoster = data.members;
          }
          const joinerName = data.member ? data.member.name : 'A new member';
          showToast(`${joinerName} joined the group!`, 'success');
          appendSystemBanner(`${joinerName} joined the group`);
          updateGroupStatus();
          playNotificationSound();
          return;
        }

        // 3. A member left
        if (data.type === 'member-left') {
          if (Array.isArray(data.members)) {
            groupRoster = data.members;
          }
          const leftName = data.nickname || 'A member';
          showToast(`${leftName} left the group.`, 'info');
          appendSystemBanner(`${leftName} left the group`);
          updateGroupStatus();
          return;
        }

        // 4. Incoming Group Message
        if (data.type === 'group-message') {
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

        // 5. Message Delivery Acknowledgment
        if (data.type === 'msg-ack') {
          markMessageDelivered(data.id);
          return;
        }

        // 6. Typing Indicators
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
          return;
        }

        if (data.type === 'stop-typing') {
          if (activeTypers.has(data.senderId)) {
            clearTimeout(activeTypers.get(data.senderId).timer);
            activeTypers.delete(data.senderId);
          }
          updateTypingDisplay();
          return;
        }

        // 7. Host closed the group
        if (data.type === 'host-closed') {
          showToast(data.message || 'Group host has ended the room.', 'info');
          leaveChatRoom(false);
          return;
        }
      });

      hostConn.on('close', () => {
        showToast('Group room disconnected.', 'info');
        appendSystemBanner('Connection to group room host closed');
      });

      hostConn.on('error', (err) => {
        console.warn('[JOINER] Host conn error:', err);
      });
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

  // Check URL query parameters for auto-join
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam && /^\d{6}$/.test(roomParam)) {
    switchHomeTab('join');
    if (joinCodeInput) joinCodeInput.value = roomParam;
    
    let pollCount = 0;
    const pollPeerInterval = setInterval(() => {
      pollCount++;
      if (typeof Peer !== 'undefined') {
        clearInterval(pollPeerInterval);
        handleJoinRoom();
      } else if (pollCount > 50) {
        clearInterval(pollPeerInterval);
        showToast('Connection timeout loading WebRTC library.', 'error');
      }
    }, 100);
  }

  // --- GROUP MODAL LISTENERS ---
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

  // --- CHAT TOOL ACTIONS ---
  if (headerCodePill) {
    headerCodePill.addEventListener('click', () => {
      if (currentRoomCode) {
        navigator.clipboard.writeText(currentRoomCode);
        showToast(`Room Code ${currentRoomCode} copied!`, 'info');
      }
    });
  }

  if (btnClearChat) {
    btnClearChat.addEventListener('click', () => {
      if (!confirm('Clear all messages from your device?')) return;
      if (chatMessages) {
        const banners = chatMessages.querySelectorAll('div[id^="msg-wrap-"], .select-none:not(:first-child)');
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
      // Host closes the room for everyone
      broadcastToGroup({
        type: 'host-closed',
        message: 'The group host has ended the chat.'
      });
    } else if (hostConn && hostConn.open) {
      // Member notifies host of leave
      try {
        hostConn.send({
          type: 'member-leave',
          senderId: myPeerId,
          nickname: myNickname
        });
      } catch (e) {}
    }

    stopHeartbeat();

    // Close all connections
    connectedPeers.forEach((p) => {
      try { p.conn.close(); } catch (e) {}
    });
    connectedPeers.clear();

    if (hostConn) {
      try { hostConn.close(); } catch (e) {}
      hostConn = null;
    }

    groupRoster = [];
    activeTypers.clear();
    seenMessageIds.clear();

    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }

    currentRoomCode = null;
    myPeerId = null;
    isHost = false;

    // Reset UI to home view
    if (chatView) chatView.classList.add('hidden');
    if (homeView) homeView.classList.remove('hidden');
    if (createActions) createActions.classList.add('hidden');
    if (btnGenerateCode) btnGenerateCode.classList.remove('hidden');
    if (createdCodeDisplay) createdCodeDisplay.textContent = '------';
    if (joinCodeInput) joinCodeInput.value = '';

    // Clear messages
    if (chatMessages) {
      const messages = chatMessages.querySelectorAll('div[id^="msg-wrap-"]');
      messages.forEach(m => m.remove());
    }

    // Clean URL
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    showToast('You left the group chat.', 'info');
  }

  if (btnLeaveChat) {
    btnLeaveChat.addEventListener('click', () => leaveChatRoom(true));
  }

  // --- TYPING INDICATOR EMISSION ---
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
          broadcastToGroup(typingPayload);
        } else if (hostConn && hostConn.open) {
          try { hostConn.send(typingPayload); } catch (e) {}
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
          broadcastToGroup(stopPayload);
        } else if (hostConn && hostConn.open) {
          try { hostConn.send(stopPayload); } catch (e) {}
        }
      }, 2500);
    });
  }

  // --- EMOJI PICKER ACTIONS ---
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

  // --- SEND MESSAGE TRIGGER ---
  function handleSendMessage() {
    if (!messageInput) return;
    const content = messageInput.value.trim();
    if (!content || !currentRoomCode) return;

    const trimmedContent = content.slice(0, 2000);
    const tempId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    // Reset input field immediately
    messageInput.value = '';

    // Record as seen so we don't display it again
    seenMessageIds.add(tempId);

    // Append outgoing bubble locally
    appendMessage({
      id: tempId,
      senderName: myNickname,
      senderId: myPeerId,
      content: trimmedContent,
      isOutgoing: true,
      timestamp,
      status: isHost ? 'delivered' : 'sent'
    });

    const msgPayload = {
      type: 'group-message',
      id: tempId,
      senderName: myNickname,
      senderId: myPeerId,
      content: trimmedContent,
      timestamp
    };

    if (isHost) {
      // Host broadcasts to all connected members
      broadcastToGroup(msgPayload);
    } else if (hostConn && hostConn.open) {
      // Member sends to Host (which relays to everyone)
      try {
        hostConn.send(msgPayload);
      } catch (e) {
        console.warn('[SEND] Failed to send to host:', e);
      }
    }

    const stopPayload = {
      type: 'stop-typing',
      senderId: myPeerId
    };
    if (isHost) {
      broadcastToGroup(stopPayload);
    } else if (hostConn && hostConn.open) {
      try { hostConn.send(stopPayload); } catch (e) {}
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

  // Dismiss keyboard when user scrolls or taps chat history (WhatsApp behavior)
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
    showToast('Network online. Group connected.', 'success');
  });
});
