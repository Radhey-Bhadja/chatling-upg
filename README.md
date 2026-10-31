# Chatling

**Private, ephemeral group chat using WebRTC — no login, no server storage.**

Share a 6-digit room code with friends and start chatting instantly. Messages are peer-to-peer; nothing is stored on any server.

---

## Features

- 🔐 No login required — just pick a nickname and share a code
- 🔢 6-digit room codes (generate or enter one)
- 📡 WebRTC peer-to-peer via PeerJS Cloud Broker
- 💬 WhatsApp-style message bubbles with delivery ticks
- 👥 Live members list with online count
- ✍️ Typing indicators
- 😊 Emoji picker
- 🌙 Dark / Light theme toggle
- 📱 Fully mobile responsive (safe-area aware)
- 🔗 Share invite links (opens directly in the room)
- ⚡ Pure static site — works on Vercel, Netlify, GitHub Pages

---

## How it Works

```
Topology: Star/Hub model
  - Room Creator = Host peer
  - Host peer ID = "chatling-XXXXXX" (6-digit code)
  - Joiners connect to the host peer ID
  - Host relays all messages to every other participant
  - PeerJS Cloud Broker (0.peerjs.com) handles signaling
  - Google STUN servers handle NAT traversal
```

No messages pass through any server you own — they flow directly between browsers via WebRTC DataChannels.

---

## Deploy to Vercel

### Option 1 — Vercel CLI

```bash
npm i -g vercel
vercel --prod
```

### Option 2 — GitHub Integration

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your GitHub repo
3. Vercel auto-detects `vercel.json` and deploys from the `public/` folder
4. Your app will be live at `https://your-project.vercel.app`

---

## Local Development

No build step needed. Just serve the `public/` folder:

```bash
# Option A: Node.js server (included)
npm start
# Opens at http://localhost:3000

# Option B: Any static server
npx serve public
# or
python -m http.server 3000 --directory public
```

---

## Project Structure

```
chatling/
├── public/              ← Static site (what Vercel deploys)
│   ├── index.html       ← Full single-page app
│   ├── logo.png         ← App icon
│   ├── css/
│   │   └── styles.css   ← WhatsApp-style CSS
│   └── js/
│       └── app.js       ← WebRTC chat engine
├── server/
│   └── server.js        ← Optional local Node.js dev server
├── vercel.json          ← Vercel deployment config
├── package.json
└── .gitignore
```

---

## Browser Support

| Browser         | Support |
|-----------------|---------|
| Chrome 80+      | ✅      |
| Firefox 75+     | ✅      |
| Safari 14+      | ✅      |
| Edge 80+        | ✅      |
| Mobile Chrome   | ✅      |
| Mobile Safari   | ✅      |

> WebRTC requires HTTPS in production (Vercel provides this automatically).

---

## Privacy

- **Zero server storage** — no messages, nicknames, or room data is saved anywhere
- **Ephemeral** — the room disappears when everyone leaves
- **P2P encrypted** — WebRTC DataChannels are DTLS encrypted by the browser
