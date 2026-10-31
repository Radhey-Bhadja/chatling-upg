document.addEventListener('DOMContentLoaded', () => {
  // WebRTC ICE Server Configuration for Live HTTPS / Mobile Network Traversal (STUN + TURN Fallback)
  const PEER_CONFIG = {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        // OpenRelay Public TURN Server fallback for symmetric NAT / strict mobile firewalls
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

  // State Management for Multi-User Mesh Group Chat
  let peer = null;
  let myPeerId = null;
  let myNickname = '';
  let isHost = false;
  let currentRoomCode = null;

  // Active Peer connections map: peerId -> DataConnection
  const connections = new Map();
  // Nicknames map: peerId -> nickname string
  const peerNicknames = new Map();
  // Typing state map: peerId -> { nickname: string, timer: number }
  const activeTypers = new Map();

  let typingTimeout = null;
  let isTyping = false;
  let heartbeatInterval = null;

  // Color palette for group participant names (WhatsApp style)
  const NAME_COLORS = [
    '#25D366', // Emerald / WA Green
    '#0284c7', // Sky Blue
    '#8b5cf6', // Purple
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#f97316', // Orange
    '#6366f1', // Indigo
    '#ef4444'  // Red
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
  const btnModalInvite = document.getElementById('btn-modal-invite');

  // Toast Container & Connection Banner
  const toastContainer = document.getElementById('toast-container');
  const connectionBanner = document.getElementById('connection-banner');

  // Theme Icons
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

  function initTheme() {
    let savedTheme = null;
    try {
      savedTheme = localStorage.getItem('chatling_theme');
    } catch (e) {}

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme ? (savedTheme === 'dark') : prefersDark;
    updateThemeUI(isDark);
  }

  initTheme();

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const isDarkNow = document.documentElement.classList.contains('dark');
      const newDark = !isDarkNow;
      updateThemeUI(newDark);
      try {
        localStorage.setItem('chatling_theme', newDark ? 'dark' : 'light');
      } catch (e) {}
    });
  }

  // Load saved nickname if available
  try {
    const savedName = localStorage.getItem('chatling_nickname');
    if (savedName && userNicknameInput) {
      userNicknameInput.value = savedName;
    }
  } catch (e) {}

  function getEffectiveNickname() {
    let name = userNicknameInput ? userNicknameInput.value.trim() : '';
    if (!name) {
      name = 'User_' + Math.floor(1000 + Math.random() * 9000);
      if (userNicknameInput) userNicknameInput.value = name;
    }
    // Limit nickname length to 20 chars
    name = name.slice(0, 20);
    try {
      localStorage.setItem('chatling_nickname', name);
    } catch (e) {}
    return name;
  }

  // --- SAFE NOTIFICATIONS (XSS Protected) ---
  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    const bgColors = {
      info: 'bg-gray-800 text-white dark:bg-white dark:text-gray-900',
      success: 'bg-wa-green text-white',
      error: 'bg-red-600 text-white'
    };

    toast.className = `${bgColors[type] || bgColors.info} px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-lg text-xs sm:text-sm font-medium transition-all transform duration-300 translate-y-2 opacity-0 flex items-center gap-2 pointer-events-auto z-50`;
    
    // Safely assign text via textContent to completely prevent XSS
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);
    
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /**
   * Switch between Home Tabs
   */
  function switchHomeTab(tab) {
    if (!tabCreate || !tabJoin || !sectionCreate || !sectionJoin) return;
    const activeClass = 'flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-emerald-500 text-white shadow-sm transition-all cursor-pointer';
    const inactiveClass = 'flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900';

    if (tab === 'create') {
      tabCreate.className = activeClass;
      tabJoin.className = inactiveClass;
      sectionCreate.classList.remove('hidden');
      sectionJoin.classList.add('hidden');
    } else {
      tabJoin.className = activeClass;
      tabCreate.className = inactiveClass;
      sectionJoin.classList.remove('hidden');
      sectionCreate.classList.add('hidden');
      if (joinCodeInput) joinCodeInput.focus();
    }
  }

  /**
   * Update Group Status & Member Count
   */
  function updateGroupStatus() {
    const totalCount = connections.size + 1; // self + connected peers
    if (badgeMemberCount) badgeMemberCount.textContent = totalCount;
    if (modalMemberCount) modalMemberCount.textContent = `${totalCount} online`;

    if (!statusIndicator || !statusText) return;

    if (connections.size > 0) {
      statusIndicator.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-wa-green border-2 border-white dark:border-slate-900 status-pulse';
      const names = Array.from(peerNicknames.values());
      if (names.length === 0) {
        statusText.textContent = `${connections.size} participant${connections.size > 1 ? 's' : ''} connected`;
      } else if (names.length === 1) {
        statusText.textContent = `${names[0]} is online`;
      } else if (names.length === 2) {
        statusText.textContent = `${names[0]}, ${names[1]} online`;
      } else {
        statusText.textContent = `${names[0]} & ${names.length - 1} others online`;
      }
      statusText.className = 'text-[10px] sm:text-xs text-wa-green font-medium truncate';
      startHeartbeat();
    } else {
      statusIndicator.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500 border-2 border-white dark:border-slate-900';
      statusText.textContent = 'Waiting for friends to join...';
      statusText.className = 'text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium truncate';
      stopHeartbeat();
    }

    renderMembersList();
  }

  /**
   * Render Members in Flyout Modal
   */
  function renderMembersList() {
    if (!membersList) return;
    membersList.innerHTML = '';

    // Self
    const selfItem = document.createElement('li');
    selfItem.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800';
    selfItem.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 select-none shadow-sm" style="background-color: ${getSenderColor(myNickname)}">
          ${escapeHTML(myNickname.charAt(0).toUpperCase())}
        </div>
        <div class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
          ${escapeHTML(myNickname)} <span class="text-emerald-500 font-normal text-xs">(You${isHost ? ' • Creator' : ''})</span>
        </div>
      </div>
      <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
    `;
    membersList.appendChild(selfItem);

    // Other peers
    connections.forEach((conn, peerId) => {
      const name = peerNicknames.get(peerId) || 'Participant';
      const item = document.createElement('li');
      item.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800';
      item.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 select-none shadow-sm" style="background-color: ${getSenderColor(name)}">
            ${escapeHTML(name.charAt(0).toUpperCase())}
          </div>
          <div class="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
            ${escapeHTML(name)}
          </div>
        </div>
        <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
      `;
      membersList.appendChild(item);
    });
  }

  /**
   * Transition to Chat Interface
   */
  function enterChatView(code) {
    currentRoomCode = code;
    if (homeView) homeView.classList.add('hidden');
    if (chatView) chatView.classList.remove('hidden');
    if (headerGroupTitle) headerGroupTitle.textContent = `Group #${code}`;
    if (headerRoomCode) headerRoomCode.textContent = code;
    if (headerCodePill) headerCodePill.classList.remove('hidden');
    if (messageInput) messageInput.focus();
    updateGroupStatus();

    // Push browser history state
    if (window.history && window.history.pushState) {
      window.history.pushState({ inChat: true, room: code }, '', `?room=${code}`);
    }
  }

  // Handle hardware / browser back button navigation
  window.addEventListener('popstate', () => {
    if (chatView && !chatView.classList.contains('hidden')) {
      leaveChatRoom(false);
    }
  });

  /**
   * WebRTC DataChannel Keep-Alive Heartbeat
   */
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      broadcastData({ type: 'ping' });
    }, 15000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  /**
   * Scroll Chat Window to Bottom (Always dynamically looks up live DOM element)
   */
  function scrollToBottom(behavior = 'smooth') {
    if (!chatMessages) return;
    const liveAnchor = document.getElementById('messages-bottom-anchor');
    if (liveAnchor && liveAnchor.parentNode === chatMessages) {
      liveAnchor.scrollIntoView({ behavior, block: 'end' });
    } else {
      chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior
      });
    }

    // Safety fallback for mobile soft-keyboard animation delays
    setTimeout(() => {
      const anchor = document.getElementById('messages-bottom-anchor');
      if (anchor && anchor.parentNode === chatMessages) {
        anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
      } else if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }, 100);
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Format ISO Timestamp to 12h Time string
   */
  function formatTime(isoString) {
    const date = isoString ? new Date(isoString) : new Date();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Broadcast payload to all open peer data connections
   */
  function broadcastData(payload, excludePeerId = null) {
    connections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId && conn.open) {
        try {
          conn.send(payload);
        } catch (e) {
          console.error(`Failed sending data to ${peerId}`, e);
        }
      }
    });
  }

  /**
   * Append Message Bubble to Chat (WhatsApp Group Style with Avatar & Dynamic Sender Tags)
   */
  function appendMessage({ id, senderName, senderId, content, isOutgoing, timestamp, status = 'sent' }) {
    if (!chatMessages) return;
    const wrapper = document.createElement('div');
    wrapper.id = `msg-wrap-${id}`;
    
    const contentHtml = escapeHTML(content).replace(/\n/g, '<br>');
    const timeStr = formatTime(timestamp);

    let statusTicks = '';
    if (isOutgoing) {
      if (status === 'delivered') {
        statusTicks = `<svg class="w-3.5 h-3.5 text-sky-500 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7M5 7l4 4L19 1"/></svg>`;
      } else {
        statusTicks = `<svg class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
      }
    }

    if (isOutgoing) {
      // Outgoing Message (Right Aligned)
      wrapper.className = 'flex items-end justify-end my-1 w-full';
      wrapper.innerHTML = `
        <div class="bubble bubble-out py-2 px-3 sm:px-3.5 rounded-2xl rounded-br-xs text-xs sm:text-sm max-w-[85%] sm:max-w-[70%]">
          <div class="leading-relaxed break-words overflow-wrap-anywhere">${contentHtml}</div>
          <div class="flex items-center justify-end gap-1 text-[10px] text-emerald-100 mt-1 select-none">
            <span>${timeStr}</span>
            <span class="tick-icon">${statusTicks}</span>
          </div>
        </div>
      `;
    } else {
      // Incoming Message from another participant (Left Aligned with Sender Avatar & Color Tag)
      const name = senderName || 'Member';
      const nameColor = getSenderColor(name);
      const initial = escapeHTML(name.charAt(0).toUpperCase());

      wrapper.className = 'flex items-end justify-start gap-1.5 sm:gap-2 my-1 w-full';
      wrapper.innerHTML = `
        <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-bold text-white text-[10px] sm:text-xs shrink-0 select-none shadow-sm" style="background-color: ${nameColor}">
          ${initial}
        </div>
        <div class="bubble bubble-in py-2 px-3 sm:px-3.5 rounded-2xl rounded-bl-xs text-xs sm:text-sm max-w-[80%] sm:max-w-[68%]">
          <div class="font-bold text-[11px] sm:text-xs mb-0.5 select-none flex items-center gap-1.5 truncate max-w-full" style="color: ${nameColor}">
            <span class="truncate">${escapeHTML(name)}</span>
          </div>
          <div class="leading-relaxed text-slate-900 dark:text-slate-100 break-words overflow-wrap-anywhere">${contentHtml}</div>
          <div class="flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-slate-500 mt-1 select-none">
            <span>${timeStr}</span>
          </div>
        </div>
      `;
    }

    const anchor = document.getElementById('messages-bottom-anchor');
    if (anchor && anchor.parentNode === chatMessages) {
      chatMessages.insertBefore(wrapper, anchor);
    } else {
      chatMessages.appendChild(wrapper);
    }
    scrollToBottom();

    // Optional haptic vibration feedback on supported devices
    if (navigator.vibrate) {
      navigator.vibrate(isOutgoing ? 15 : [25, 40, 25]);
    }
  }

  /**
   * System Info Banner in chat
   */
  function appendSystemBanner(text) {
    if (!chatMessages) return;
    const banner = document.createElement('div');
    banner.className = 'flex justify-center my-1.5 select-none';
    banner.innerHTML = `
      <div class="bg-slate-200/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[10px] sm:text-[11px] font-medium px-3 py-0.5 rounded-full shadow-xs text-center max-w-xs sm:max-w-md">
        ${escapeHTML(text)}
      </div>
    `;
    const anchor = document.getElementById('messages-bottom-anchor');
    if (anchor && anchor.parentNode === chatMessages) {
      chatMessages.insertBefore(banner, anchor);
    } else {
      chatMessages.appendChild(banner);
    }
    scrollToBottom();
  }

  /**
   * Update message delivery status to double tick
   */
  function markMessageDelivered(msgId) {
    const msgWrap = document.getElementById(`msg-wrap-${msgId}`);
    if (msgWrap) {
      const tickSpan = msgWrap.querySelector('.tick-icon');
      if (tickSpan) {
        tickSpan.innerHTML = `<svg class="w-3.5 h-3.5 text-sky-500 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7M5 7l4 4L19 1"/></svg>`;
      }
    }
  }

  /**
   * Refresh typing indicator text for groups
   */
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

  // --- WEBRTC CONNECTION HANDLING (MESH WITH COLLISION AVOIDANCE) ---

  function connectToPeer(targetPeerId) {
    if (!peer || targetPeerId === myPeerId) return;

    // Avoid duplicate connection if already open or connecting
    if (connections.has(targetPeerId) && connections.get(targetPeerId).open) {
      return;
    }

    try {
      const conn = peer.connect(targetPeerId, { reliable: true });
      setupConnectionListeners(conn);
    } catch (e) {
      console.warn(`Could not connect to peer ${targetPeerId}`, e);
    }
  }

  function setupConnectionListeners(conn) {
    const peerId = conn.peer;

    conn.on('open', () => {
      // Deduplicate: If an existing open connection exists with this peer, close the redundant one
      if (connections.has(peerId) && connections.get(peerId).open && connections.get(peerId) !== conn) {
        try { conn.close(); } catch (e) {}
        return;
      }

      connections.set(peerId, conn);

      // Send introduction with my nickname and senderId
      conn.send({
        type: 'intro',
        senderId: myPeerId,
        nickname: myNickname
      });

      // If Host: coordinate the mesh without collision.
      // Instruct existing peers to initiate connection to this new peer.
      if (isHost) {
        connections.forEach((c, id) => {
          if (id !== peerId && c.open) {
            c.send({
              type: 'peer-joined',
              peerId: peerId
            });
          }
        });

        // Send room info to newcomer (without telling them to dual-dial)
        const peerList = Array.from(connections.keys()).filter(id => id !== peerId);
        conn.send({
          type: 'peer-list',
          peers: peerList
        });
      }

      updateGroupStatus();
    });

    conn.on('data', (data) => {
      if (!data) return;

      if (data.type === 'ping') {
        return;
      }

      if (data.type === 'intro') {
        const name = (data.nickname || 'Member').slice(0, 20);
        const isNew = !peerNicknames.has(peerId);
        peerNicknames.set(peerId, name);
        if (isNew) {
          showToast(`${name} joined the group!`, 'success');
          appendSystemBanner(`${name} joined the group`);
        }
        updateGroupStatus();
        return;
      }

      // Received by existing peers from the host: connect outwards to the new joiner
      if (data.type === 'peer-joined') {
        if (data.peerId && data.peerId !== myPeerId && !connections.has(data.peerId)) {
          connectToPeer(data.peerId);
        }
        return;
      }

      // Fallback mesh list received by the newcomer
      if (data.type === 'peer-list') {
        if (Array.isArray(data.peers)) {
          // Allow existing peers 3 seconds to connect first, then fallback connect if missing
          setTimeout(() => {
            data.peers.forEach(id => {
              if (id !== myPeerId && !connections.has(id)) {
                connectToPeer(id);
              }
            });
          }, 3000);
        }
        return;
      }

      if (data.type === 'chat-message') {
        appendMessage({
          id: data.id,
          senderName: data.senderName || peerNicknames.get(peerId) || 'Member',
          senderId: peerId,
          content: data.content,
          isOutgoing: false,
          timestamp: data.timestamp
        });

        // Send delivery ACK receipt back to sender
        try {
          conn.send({ type: 'message-delivered', id: data.id });
        } catch (e) {}
        return;
      }

      if (data.type === 'message-delivered') {
        markMessageDelivered(data.id);
        return;
      }

      if (data.type === 'typing') {
        const name = data.nickname || peerNicknames.get(peerId) || 'Someone';
        if (activeTypers.has(peerId)) {
          clearTimeout(activeTypers.get(peerId).timer);
        }
        // Auto-remove typing indicator after 3.5s in case stop-typing packet drops
        const timer = setTimeout(() => {
          activeTypers.delete(peerId);
          updateTypingDisplay();
        }, 3500);

        activeTypers.set(peerId, { nickname: name, timer });
        updateTypingDisplay();
        return;
      }

      if (data.type === 'stop-typing') {
        if (activeTypers.has(peerId)) {
          clearTimeout(activeTypers.get(peerId).timer);
          activeTypers.delete(peerId);
        }
        updateTypingDisplay();
        return;
      }

      if (data.type === 'user-leave') {
        handlePeerDeparture(peerId, data.nickname);
        return;
      }
    });

    conn.on('close', () => {
      handlePeerDeparture(peerId);
    });

    conn.on('error', (err) => {
      console.warn(`[CONN ERROR ${peerId}]`, err);
    });
  }

  function handlePeerDeparture(peerId, explicitName = null) {
    if (!connections.has(peerId)) return;
    const departedName = explicitName || peerNicknames.get(peerId) || 'A participant';
    connections.delete(peerId);
    peerNicknames.delete(peerId);
    if (activeTypers.has(peerId)) {
      clearTimeout(activeTypers.get(peerId).timer);
      activeTypers.delete(peerId);
    }
    updateTypingDisplay();
    updateGroupStatus();
    appendSystemBanner(`${departedName} left the chat`);
    showToast(`${departedName} left the chat.`, 'info');
  }

  function setupPeerErrorHandlers(p) {
    p.on('error', (err) => {
      console.warn('[PEER ERROR]', err);
      if (err.type === 'peer-unavailable') {
        showToast('Room host unavailable or code expired.', 'error');
      } else if (err.type === 'unavailable-id') {
        showToast('Room code collision. Retrying...', 'info');
      } else {
        showToast(`Notice: ${err.type || 'network issue'}`, 'info');
      }
    });
  }

  // --- HOME EVENT LISTENERS ---

  if (tabCreate) tabCreate.addEventListener('click', () => switchHomeTab('create'));
  if (tabJoin) tabJoin.addEventListener('click', () => switchHomeTab('join'));

  // Generate Room Code Action (Host Role)
  function createRoomSession(retryCount = 0) {
    if (retryCount > 4) {
      showToast('Could not find available room ID. Please try again.', 'error');
      return;
    }

    myNickname = getEffectiveNickname();
    isHost = true;

    // Random 6-digit numeric room code
    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hostPeerId = `chatling-v1-${roomCode}`;

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
      if (createdCodeDisplay) createdCodeDisplay.textContent = roomCode;
      if (createActions) createActions.classList.remove('hidden');
      if (btnGenerateCode) btnGenerateCode.classList.add('hidden');
      showToast(`Group Room ${roomCode} ready!`, 'success');
    });

    // Accept incoming joiners
    peer.on('connection', (conn) => {
      setupConnectionListeners(conn);
    });
  }

  if (btnGenerateCode) {
    btnGenerateCode.addEventListener('click', () => {
      if (typeof Peer === 'undefined') {
        showToast('WebRTC library loading... Please check internet connection.', 'error');
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

  // Copy / Share Direct Invite Link Button
  async function shareOrCopyInvite() {
    if (!currentRoomCode) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomCode}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join our private group chat on Chatling',
          text: `Join my private group chat room on Chatling (Code: ${currentRoomCode})`,
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

  // Enter Chat Button
  if (btnEnterChat) {
    btnEnterChat.addEventListener('click', () => {
      if (currentRoomCode) {
        enterChatView(currentRoomCode);
      }
    });
  }

  // Join Room Action (Joiner Role)
  function handleJoinRoom() {
    if (!joinCodeInput) return;
    const code = joinCodeInput.value.trim();
    
    // Strict 6-digit numeric validation
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

    showToast('Connecting to group room ' + code + '...', 'info');

    const hostPeerId = `chatling-v1-${code}`;

    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }

    peer = new Peer(PEER_CONFIG);
    setupPeerErrorHandlers(peer);

    peer.on('open', (id) => {
      myPeerId = id;
      currentRoomCode = code;

      // Connect to the room host
      const hostConn = peer.connect(hostPeerId, { reliable: true });
      setupConnectionListeners(hostConn);

      // Auto enter chat view
      enterChatView(code);
    });

    // Accept connections from other group peers (mesh)
    peer.on('connection', (conn) => {
      setupConnectionListeners(conn);
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

  // Auto Join via URL Query (`?room=839201`) with graceful PeerJS poll
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

  // --- CHAT TOOLBAR EVENT LISTENERS ---

  if (headerCodePill) {
    headerCodePill.addEventListener('click', () => {
      if (currentRoomCode) {
        navigator.clipboard.writeText(currentRoomCode);
        showToast('Room code copied to clipboard!', 'info');
      }
    });
  }

  if (btnClearChat) {
    btnClearChat.addEventListener('click', () => {
      if (!chatMessages) return;
      chatMessages.innerHTML = `
        <div class="flex justify-center my-1 sm:my-2 select-none">
          <div class="bg-amber-500/10 dark:bg-amber-950/40 border border-amber-300/60 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-[10px] sm:text-xs px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl shadow-sm text-center max-w-xs sm:max-w-md flex items-center gap-1.5 sm:gap-2 backdrop-blur-sm">
            <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <span>Direct Peer-to-Peer Mesh • End-to-End Private • Zero DB</span>
          </div>
        </div>
        <div id="messages-bottom-anchor" class="h-0 w-full shrink-0"></div>
      `;
      showToast('Local chat log cleared.', 'info');
    });
  }

  /**
   * Leave Chat Room & Reset State
   */
  function leaveChatRoom(updateHistory = true) {
    // Notify peers before closing
    broadcastData({
      type: 'user-leave',
      peerId: myPeerId,
      nickname: myNickname
    });

    connections.forEach((conn) => {
      try {
        conn.close();
      } catch (e) {}
    });
    connections.clear();
    peerNicknames.clear();

    activeTypers.forEach(t => clearTimeout(t.timer));
    activeTypers.clear();

    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }

    currentRoomCode = null;
    myPeerId = null;
    isHost = false;
    stopHeartbeat();

    if (membersModal) membersModal.classList.add('hidden');
    if (chatView) chatView.classList.add('hidden');
    if (homeView) homeView.classList.remove('hidden');
    if (headerGroupTitle) headerGroupTitle.textContent = 'Group Chat';
    if (createActions) createActions.classList.add('hidden');
    if (btnGenerateCode) btnGenerateCode.classList.remove('hidden');
    if (createdCodeDisplay) createdCodeDisplay.textContent = '------';
    if (joinCodeInput) joinCodeInput.value = '';
    showToast('You left the group.', 'info');

    // Clean up query param from URL
    if (updateHistory && window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  if (btnLeaveChat) {
    btnLeaveChat.addEventListener('click', () => leaveChatRoom(true));
  }

  // Send Message Trigger
  function handleSendMessage() {
    if (!messageInput) return;
    const content = messageInput.value.trim();
    if (!content || !currentRoomCode) return;

    // Limit maximum message length to 2000 chars
    const trimmedContent = content.slice(0, 2000);
    const tempId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    // Reset input field immediately
    messageInput.value = '';

    // Append outgoing bubble locally as 'sent' (single tick)
    appendMessage({
      id: tempId,
      senderName: myNickname,
      senderId: myPeerId,
      content: trimmedContent,
      isOutgoing: true,
      timestamp,
      status: 'sent'
    });

    // Broadcast over WebRTC DataChannel to all connected group members
    broadcastData({
      type: 'chat-message',
      id: tempId,
      senderName: myNickname,
      senderId: myPeerId,
      content: trimmedContent,
      timestamp
    });

    broadcastData({ type: 'stop-typing' });
    isTyping = false;
    clearTimeout(typingTimeout);

    // Keep keyboard open and input focused
    messageInput.focus();
    scrollToBottom();
  }

  if (messageForm) {
    messageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSendMessage();
    });
  }

  // Dismiss keyboard when user scrolls or taps the chat history (WhatsApp behavior)
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
      if (document.activeElement === messageInput) {
        messageInput.blur();
      }
    }, { passive: true });

    chatMessages.addEventListener('touchend', () => {
      setTimeout(() => { isUserScrolling = false; }, 300);
    }, { passive: true });
  }

  if (messageInput) {
    messageInput.addEventListener('focus', () => {
      setTimeout(() => scrollToBottom(), 80);
      setTimeout(() => scrollToBottom(), 250);
    });

    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    messageInput.addEventListener('input', () => {
      if (!isTyping) {
        isTyping = true;
        broadcastData({
          type: 'typing',
          nickname: myNickname
        });
      }

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
        broadcastData({ type: 'stop-typing' });
      }, 1500);
    });
  }

  // Keep chat dynamically anchored to the bottom as the mobile keyboard opens or closes
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (chatView && !chatView.classList.contains('hidden')) {
        scrollToBottom();
      }
    });
    window.visualViewport.addEventListener('scroll', () => {
      if (chatView && !chatView.classList.contains('hidden')) {
        scrollToBottom();
      }
    });
  }

  // Emoji Picker Toggle
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

    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (messageInput) {
          messageInput.value += btn.textContent;
          messageInput.focus();
        }
      });
    });
  }
});
