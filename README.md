# Chatling - Private Ephemeral Group Web Chat (WebRTC)

A private, ephemeral group web chat application built for instant communication using **WebRTC DataChannels** by 6-digit room codes. Messages and events flow directly peer-to-peer across users' browsers with **zero database** and **zero server storage**.

---

## 🚀 Quick Start

### Option 1: One-Click Launch (Windows)
Double-click `start.bat`. 
It will verify Node.js, install dependencies if missing, start the local server, and **automatically open the app in your default browser** (`http://localhost:3000`).

### Option 2: Command Line
```bash
npm start
```
Or:
```bash
node server/server.js
```
The server will start and automatically launch `http://localhost:3000`.

---

## 👥 How to Test Group Chat Locally

1. Start the app using `start.bat` or `npm start`.
2. In the first browser tab:
   - Enter your nickname (e.g. `Alice`).
   - Click **Generate Group Room**. A 6-digit room code will appear (e.g. `582914`).
   - Click **Enter Group Chat**.
3. Open a **second tab** (or an incognito window / another browser):
   - Enter another nickname (e.g. `Bob`).
   - Click the **Join Group** tab.
   - Enter the 6-digit code `582914` (or paste the direct invite link).
   - Click **Join Group Chat**.
4. Both peers will instantly negotiate a direct WebRTC connection:
   - Group status lights up green (**Online**).
   - Messages, live typing indicators, delivery ticks, and emoji reactions transmit peer-to-peer over **WebRTC DataChannels**.
   - You can open 3, 4, or more tabs to experience the full mesh group conversation!

---

## 🔑 Key Features

- 👥 **Multi-User Full Mesh WebRTC Group**: Real-time communication directly between participants with no intermediary database.
- 🔒 **Zero Server Storage & Ephemeral**: All messages travel directly across WebRTC `RTCDataChannel`. Leaving the chat room immediately destroys and clears the local history.
- 🔢 **6-Digit Room Codes & Instant Links**: Generate a room code with one click, or share the direct link (`?room=123456`) to join immediately.
- ✍️ **Multi-User Live Typing Indicators**: Real-time indicator showing which participants are actively typing.
- 🎨 **WhatsApp Aesthetic & Theme Toggle**: WhatsApp-style bubble design, sender color tagging, delivery checkmarks, and dark/light mode toggle with system preference auto-detection.
- 📴 **100% Offline-Capable Local Signaling**: Socket.IO client is bundled locally (`js/socket.io.min.js`) so the app works on local offline networks, LAN, or Wi-Fi without depending on external cloud servers.
