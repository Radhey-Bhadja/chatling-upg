const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable Socket.io with CORS & polling/websocket transports
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback route to serve index.html for root requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-Memory Storage: Room Code -> { users: Array<{ id, nickname, joinedAt }>, createdAt }
const rooms = new Map();

/**
 * Generate a random 6-digit numeric room code
 */
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

/**
 * Clean up empty rooms from memory
 */
function cleanupRoom(code) {
  const room = rooms.get(code);
  if (room && room.users.length === 0) {
    rooms.delete(code);
    console.log(`[PURGED] Room ${code} purged from server memory.`);
  }
}

io.on('connection', (socket) => {
  console.log(`[CONNECTED] Socket ${socket.id}`);

  // Create a new group chat room
  socket.on('create-room', ({ nickname } = {}, callback) => {
    const code = generateRoomCode();
    const userNick = (nickname || 'Host').trim();
    rooms.set(code, {
      code,
      users: [{ id: socket.id, nickname: userNick, joinedAt: Date.now() }],
      createdAt: Date.now()
    });

    socket.join(`room:${code}`);
    socket.currentRoom = code;
    socket.nickname = userNick;

    console.log(`[GROUP ROOM CREATED] ${code} by ${userNick} (${socket.id})`);
    if (typeof callback === 'function') {
      callback({ success: true, code, nickname: userNick });
    }
  });

  // Join an existing group room (allows multiple participants)
  socket.on('join-room', ({ code, nickname }, callback) => {
    const formattedCode = (code || '').trim();
    const room = rooms.get(formattedCode);

    if (!room) {
      if (typeof callback === 'function') {
        return callback({ success: false, message: 'Invalid or expired room code.' });
      }
      return socket.emit('error-message', 'Invalid or expired room code.');
    }

    const userNick = (nickname || 'Member').trim();

    // Add user to room
    room.users.push({ id: socket.id, nickname: userNick, joinedAt: Date.now() });
    socket.join(`room:${formattedCode}`);
    socket.currentRoom = formattedCode;
    socket.nickname = userNick;

    console.log(`[USER JOINED GROUP] ${userNick} (${socket.id}) joined room ${formattedCode}. Total: ${room.users.length}`);

    if (typeof callback === 'function') {
      callback({ success: true, code: formattedCode, users: room.users });
    }

    // Broadcast to room members that a new participant has connected
    io.to(`room:${formattedCode}`).emit('user-joined', {
      id: socket.id,
      nickname: userNick,
      users: room.users,
      userCount: room.users.length
    });
  });

  // Relay chat message to everyone else in the group room
  socket.on('send-message', ({ content, tempId, timestamp }) => {
    const roomCode = socket.currentRoom;
    if (!roomCode || !rooms.has(roomCode)) return;

    const messageData = {
      id: tempId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sender: socket.id,
      senderName: socket.nickname || 'Member',
      content,
      timestamp: timestamp || new Date().toISOString()
    };

    // Broadcast to all other peers in group room
    socket.to(`room:${roomCode}`).emit('receive-message', messageData);

    // Acknowledge delivery back to sender
    socket.emit('message-delivered', { id: messageData.id });
  });

  // Typing indicators
  socket.on('typing', () => {
    if (socket.currentRoom) {
      socket.to(`room:${socket.currentRoom}`).emit('user-typing', {
        id: socket.id,
        nickname: socket.nickname || 'Someone'
      });
    }
  });

  socket.on('stop-typing', () => {
    if (socket.currentRoom) {
      socket.to(`room:${socket.currentRoom}`).emit('user-stop-typing', {
        id: socket.id
      });
    }
  });

  // Explicit leave room action
  socket.on('leave-room', () => {
    const code = socket.currentRoom;
    if (!code || !rooms.has(code)) return;

    const room = rooms.get(code);
    room.users = room.users.filter(u => u.id !== socket.id);
    socket.leave(`room:${code}`);
    socket.currentRoom = null;

    console.log(`[USER LEFT GROUP] ${socket.nickname} (${socket.id}) left room ${code}`);

    // Notify remaining room members
    socket.to(`room:${code}`).emit('user-left', {
      id: socket.id,
      nickname: socket.nickname || 'Member',
      userCount: room.users.length
    });

    cleanupRoom(code);
  });

  // Handle socket disconnection
  socket.on('disconnect', () => {
    console.log(`[DISCONNECTED] Socket ${socket.id}`);
    const code = socket.currentRoom;
    if (code && rooms.has(code)) {
      const room = rooms.get(code);
      room.users = room.users.filter(u => u.id !== socket.id);

      socket.to(`room:${code}`).emit('user-left', {
        id: socket.id,
        nickname: socket.nickname || 'Member',
        userCount: room.users.length
      });

      cleanupRoom(code);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` Chatling Ephemeral Group Chat Server Running `);
  console.log(` Local URL: http://localhost:${PORT}`);
  console.log(` Environment: Zero DB / Volatile In-Memory Group Storage `);
  console.log(`==================================================`);
});

module.exports = server;
