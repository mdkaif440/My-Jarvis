# JARVIS AI — Personal Android AI Voice Assistant

A complete, production-oriented personal AI assistant built with a futuristic HUD Progressive Web App (**React + TypeScript + Tailwind CSS**), a secure **Node.js / Express** backend integrating **OpenRouter + DeepSeek** with streaming and strict tool-call validation, and an optional **Kotlin Native Android Companion** for authorized notification reading (`NotificationListenerService`), package intents, and foreground wake-word listening.

---

## Project Structure

```text
jarvis-ai/
├── package.json
├── README.md
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── src/
│   │   ├── config/env.js
│   │   ├── middleware/security.js
│   │   ├── tools/registry.js
│   │   ├── services/openrouterService.js
│   │   ├── routes/api.js
│   │   └── server.js
│   └── tests/server.test.js
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   ├── manifest.json
│   │   ├── service-worker.js
│   │   └── icons/
│   └── src/
│       ├── main.tsx
│       ├── index.css
│       ├── App.tsx
│       ├── types/jarvis.ts
│       ├── settings/settingsStore.ts
│       ├── memory/
│       ├── voice/
│       ├── services/
│       ├── automation/
│       ├── hooks/
│       ├── components/
│       ├── pages/
│       └── __tests__/jarvis.test.ts
└── android-companion/
    ├── settings.gradle.kts
    ├── build.gradle.kts
    ├── gradle.properties
    └── app/
        ├── build.gradle.kts
        └── src/main/
            ├── AndroidManifest.xml
            ├── res/
            └── java/com/jarvis/companion/
```

---

## Quick Start (VS Code / Terminal / GitHub Codespaces)

1. **Configure OpenRouter API Key (Server-Side Only):**
   ```bash
   cp backend/.env.example backend/.env
   ```
   Edit `backend/.env`:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here
   OPENROUTER_MODEL=deepseek/deepseek-chat
   PORT=5000
   ```
   *(Never put your OpenRouter API key in `frontend/`.)*

2. **Install Dependencies:**
   ```bash
   npm run install:all
   ```

3. **Run Backend + Frontend Together:**
   ```bash
   npm run dev
   ```
   - Backend API: `http://localhost:5000`
   - Frontend PWA: `http://localhost:5173`

4. **Run Automated Tests:**
   ```bash
   npm test
   ```

---

## Installing as an Android App (PWA)

1. Deploy over **HTTPS** (`npm run build` followed by `NODE_ENV=production npm start` on Render, Railway, Fly.io, or Nginx/Caddy with TLS).
2. Open your HTTPS URL in **Android Chrome**.
3. Tap **Install** in the JARVIS header (or Chrome `⋮` → **Install app**).
4. **Offline Mode:** The service worker caches the app shell so the interface loads offline, while DeepSeek AI and cloud speech recognition require an active internet connection.

---

## Optional Native Android Companion Setup (Kotlin)

1. Open `android-companion/` in **Android Studio** (JDK 17, Android SDK 36) and install onto your Android phone.
2. Open **JARVIS Companion** on your phone:
   - Tap **Copy Pairing Token for PWA Settings** and paste it into the JARVIS PWA under **Settings → Android Native Companion**.
   - Tap **1. Grant Notification Access** to authorize reading incoming WhatsApp notifications. *(On Android 13+ sideloaded APKs, open App Info → `⋮` → Allow restricted settings first if Notification Access is greyed out.)*
   - Optionally tap **2. Start Foreground Wake-Word Mic Service** for persistent foreground wake-phrase listening with a visible microphone notification.

---

## Security & Platform Honesty

- **No Secret Exposure:** `OPENROUTER_API_KEY` stays strictly in `backend/.env` and is never sent to browser bundles or `/api/config/status`.
- **Strict Tool Allowlist:** Every AI tool call is validated against Zod schemas on the backend; arbitrary shell execution or `javascript:` URIs are blocked.
- **Explicit User Confirmation:** Sensitive actions (`make_call`, `send_whatsapp_message`, `prepare_forward_message`, `share_text`) always display a confirmation modal with recipient and message preview before handoff.
- **Honest Android Boundaries:** Browser PWAs cannot read private WhatsApp databases or run background wake-word detection when closed. Those capabilities are clearly separated into the optional Kotlin Android Companion.
