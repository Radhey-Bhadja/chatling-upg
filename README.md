# Chatling - Private Ephemeral Group & 1-to-1 Web Chat

A fast, private, ephemeral web group and 1-to-1 chat application built with **PeerJS (WebRTC full mesh)**. Requires **ZERO database setup** and **ZERO user authentication**.

Live ready for **Vercel**, GitHub Pages, or any static hosting platform.

---

## ✨ Features

- 👥 **Group Chatting (WhatsApp Style)**: More than two people can connect directly in a private group room with live full-mesh WebRTC.
- 🔒 **Direct Peer-to-Peer & Zero DB**: Messages flow directly between users' browsers encrypted over WebRTC DataChannels. Nothing is stored on any server or database. Once you leave, the chat is gone.
- 🏷️ **Custom Nicknames & Color-Coded Senders**: Enter your display name; incoming group messages show the sender's name with WhatsApp-style colorful identifiers.
- 🔑 **6-Digit Room Code & 1-Click Invite Links**: Fast room creation, copy code, and direct link (`?room=123456`) auto-join with Web Share API integration.
- 📋 **Live Member Roster**: Tap the group header to see who is currently in the room.
- ✍️ **Group Live Typing Indicators**: Real-time feedback showing who is currently typing in the group.
- 🎨 **Modern WhatsApp UI**: Tailwind CSS, responsive mobile keyboard behaviors, Dark/Light mode toggle, haptic vibration feedback, and custom emoji picker.

---

## 🚀 Deploying Live to Vercel

1. Push your updated code to GitHub:
   ```bash
   git add .
   git commit -m "Upgrade to multi-user group chat"
   git push
   ```
2. Go to your [Vercel Dashboard](https://vercel.com/dashboard).
3. Select your **Chatling** project (or click **"Add New Project"** and import the GitHub repository).
4. Framework Preset: **Other** (Root directory: `./`).
5. Click **Deploy**. Vercel will deploy the site live in seconds!

Because the group chat runs entirely peer-to-peer via WebRTC (PeerJS + STUN/TURN fallback), **it works 100% serverless on Vercel without requiring a dedicated WebSocket server**.

---

## 💻 Optional: Local Node.js Development

If you wish to test with the optional local Node.js Express server:

```bash
# Install dependencies
npm install

# Start local server
npm start
```
Open `http://localhost:3000` in multiple browser windows or devices.
