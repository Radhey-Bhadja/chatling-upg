# Chatling - Private Ephemeral Group & 1-to-1 Web Chat

A secure, high-performance, ephemeral group web chat application built for instant communication with **multiple participants**. Operates entirely peer-to-peer via WebRTC (PeerJS) with **zero database** and **zero server storage**.

---

## Key Features

- 👥 **Multi-User Full Mesh Group Chat**: Seamless real-time conversation between multiple friends simultaneously.
- 🔒 **Zero Database & Ephemeral Security**: Messages flow directly between users' browsers encrypted over WebRTC DataChannels. Nothing is stored on any server or database. Once you leave, the chat is cleared immediately.
- 🔑 **6-Digit Room Codes & Instant Links**: Generate a room with 1-click. Share the 6-digit code or direct link (`?room=123456`) with group members for instant join.
- 🏷️ **Dynamic Sender Initial Avatars & Colors**: Each group participant is automatically assigned an identifiable avatar initial and WhatsApp-style colored name tag.
- 📱 **Mobile Responsive Layout & Non-Wrapping Navigation**: Compact, uniform action buttons (`Invite`, `Clear Chat`, `Theme`, `Leave`) guaranteed never to wrap or squish title/status areas on screens from 320px up to 4K desktops.
- ✍️ **Multi-User Live Typing Indicators**: Real-time feedback showing exactly who is typing (e.g. `Alex and Sam are typing`).
- 👥 **Group Members Flyout Modal**: Tap the group header to inspect all participants currently online.
- 🎨 **WhatsApp Aesthetic & Instant Dark/Light Theme**: WhatsApp bubble aesthetics, delivered ticks, dynamic flex scroll spacer, and theme toggle with system preference auto-detection.
- ⚡ **100% Serverless & CDN-Ready**: Static architecture deploys in seconds to Vercel, GitHub Pages, Netlify, or Cloudflare Pages without backend costs.

---

## Deployment to Vercel

Because Chatling runs peer-to-peer via WebRTC, it deploys as a **100% static web application**:

1. Push this repository to GitHub.
2. In your [Vercel Dashboard](https://vercel.com/dashboard), import your repository.
3. Settings:
   - **Framework Preset**: `Other`
   - **Build Command**: `npm run build` (or leave default)
   - **Output Directory**: `public` (or leave default)
4. Click **Deploy**. Vercel will build and serve your static web app in seconds.

---

## Local Development & Optional Server

To run locally with the optional Express server:

```bash
# Double-click start.bat or run:
node server/server.js
```

Then open `http://localhost:3000` in your browser.
