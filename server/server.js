const express = require('express');
const http = require('http');
const path = require('path');
const { exec } = require('child_process');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static assets from project root
const staticDir = path.join(__dirname, '..');
app.use(express.static(staticDir));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Rooms State: Map<roomCode, Map<socketId, { id, nickname, isHost }>>
const rooms = new Map();

io.on('connection', (socket) => {
  let currentRoom = null;
  let userNickname = null;

  // 1. Join room by 6-digit room code
  socket.on('join-room', ({ roomCode, nickname, isHost }) => {
    // If socket was already in another room, leave it
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(socket.id);
      socket.leave(currentRoom);
    }

    currentRoom = String(roomCode).trim();
    userNickname = (nickname || 'Anonymous').trim().slice(0, 20);

    socket.join(currentRoom);

    if (!rooms.has(currentRoom)) {
      rooms.set(currentRoom, new Map());
    }

    const roomMembers = rooms.get(currentRoom);
    roomMembers.set(socket.id, {
      id: socket.id,
      nickname: userNickname,
      isHost: !!isHost
    });

    console.log(`[ROOM ${currentRoom}] ${userNickname} (${socket.id}) joined. Members: ${roomMembers.size}`);

    // Collect all existing peers in the room (excluding this socket)
    const existingUsers = [];
    roomMembers.forEach((member, peerId) => {
      if (peerId !== socket.id) {
        existingUsers.push(member);
      }
    });

    // Send acknowledgment back to the joining user with all existing peers
    socket.emit('room-joined-ack', {
      roomCode: currentRoom,
      peerId: socket.id,
      existingUsers,
      roster: Array.from(roomMembers.values())
    });

    // Notify other peers in the room that a new peer has joined
    socket.to(currentRoom).emit('user-joined', {
      peerId: socket.id,
      nickname: userNickname,
      isHost: !!isHost,
      roster: Array.from(roomMembers.values())
    });
  });

  // 2. WebRTC Signaling: Forward offer / answer / ICE candidate
  socket.on('signal', ({ to, signal }) => {
    if (!to || !signal) return;
    io.to(to).emit('signal', {
      from: socket.id,
      signal
    });
  });

  // 3. Fallback Relay: If WebRTC DataChannel is blocked by strict firewall, relay via socket
  socket.on('relay-message', (data) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('relay-message', data);
  });

  socket.on('relay-typing', (data) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('relay-typing', data);
  });

  // 4. Handle Disconnection or Leave
  function handleLeave() {
    if (currentRoom && rooms.has(currentRoom)) {
      const roomMembers = rooms.get(currentRoom);
      const departing = roomMembers.get(socket.id);
      const name = departing ? departing.nickname : (userNickname || 'A participant');

      roomMembers.delete(socket.id);
      socket.leave(currentRoom);

      console.log(`[ROOM ${currentRoom}] ${name} (${socket.id}) left. Remaining: ${roomMembers.size}`);

      // Notify remaining members
      socket.to(currentRoom).emit('user-left', {
        peerId: socket.id,
        nickname: name,
        roster: Array.from(roomMembers.values())
      });

      if (roomMembers.size === 0) {
        rooms.delete(currentRoom);
        console.log(`[ROOM ${currentRoom}] Room closed (empty).`);
      }

      currentRoom = null;
    }
  }

  socket.on('leave-room', handleLeave);
  socket.on('disconnect', handleLeave);
});

// Auto launch browser
function openBrowser(url) {
  const startCmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
    ? `open "${url}"`
    : `xdg-open "${url}"`;

  exec(startCmd, (err) => {
    if (err) {
      console.log(`[INFO] Could not automatically open browser: ${err.message}`);
    }
  });
}

function startListening(port) {
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('=======================================================');
    console.log('   Chatling Ephemeral Group Chat Server');
    console.log('   WebRTC Mesh Engine (Signaling + P2P DataChannels)');
    console.log('=======================================================');
    console.log(`[READY] Server running at: ${url}`);
    console.log(`[READY] Opening application in your browser...`);
    console.log('=======================================================\n');

    openBrowser(url);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[WARN] Port ${port} is in use, trying port ${port + 1}...`);
      startListening(port + 1);
    } else {
      console.error('[ERROR] Server listen failed:', err);
    }
  });
}

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
startListening(DEFAULT_PORT);
