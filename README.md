# Concordia Client

The official client for [Concordia](https://concordiachat.com) — an open, federated, decentralised real-time chat platform. Ships as both an **Electron desktop app** and a **web app** (PWA-ready, deployable to Railway or any Node host).

---

## Features

### Identity & Auth
- Register and log in via the Concordia Federation (single global account across all servers)
- JWT-based session with automatic expiry handling
- Profile cards (Discord-style: banner, avatar, bio, roles, status)
- Custom status with optional expiry (15 min → 3 days)
- Live presence: online / idle / DND / invisible / offline with 8-second grace period on disconnect

### Servers & Navigation
- Add servers by address; drag-and-drop reorder with position sync to Federation
- Server health indicators (offline servers are visually disabled)
- Server info modal and leave confirmation
- Separate right-click context menu on server icons (Info + Leave) vs server name dropdown (full options: Info, Settings, Create Channel, Create Category, Leave)
- Per-server last-channel memory (returns to your last channel on re-select)

### Channels & Categories
- Full category and channel hierarchy with collapsible groups  
- Create, rename, and delete channels and categories (permission-gated)
- Channel-specific permission enforcement — message box hidden when `SEND_MESSAGES` is denied
- Real-time channel and category creation/deletion via socket events

### Messaging
- Real-time messages via Socket.IO with grouped message blocks
- Full message history with "Load more" pagination
- Edit and delete your own messages; admins can delete any message
- Typing indicators
- Link auto-detection

### Members & Roles
- Members pane with live status badges
- Role-based permission system (`ADMINISTRATOR`, `VIEW_CHANNELS`, `SEND_MESSAGES`, `MANAGE_MESSAGES`, `MANAGE_CHANNELS`, `MANAGE_CATEGORIES`)
- Clickable avatars and usernames open profile popups

### Direct Messages & Social
- DM conversations via the Federation social layer
- Home screen with DM list and friend/request management

### Server Settings (admin)
- Overview: rename server, update icon
- Roles: create, edit (name, colour, permissions), delete, reorder
- Members: assign/remove roles per member
- Channels: manage channel list and categories
- CDN: configure media storage

### Platforms
- **Electron desktop** — native window, context isolation, no Node in renderer
- **Web** — Express server with on-the-fly HTML patching, PWA manifest, Open Graph/Twitter Card meta tags, iOS safe-area support, mobile-responsive layout
- Platform type (`desktop` / `web` / `mobile_web`) reported to Federation on socket connect

### Themes
- Multiple built-in themes switchable at runtime

---

## Prerequisites

- Node.js 18+
- A running Concordia server to connect to
- A Concordia Federation account (register at [federation.concordiachat.com](https://federation.concordiachat.com) or self-host)

---

## Setup

```bash
npm install
```

## Run

**Web (browser):**
```bash
npm start
# Serves on http://localhost:3000
```

**Electron (desktop):**
```bash
npm run start:electron
```

---

## Project Structure

```
src/
  electron/
    main.js          – Electron main process (BrowserWindow config)
    preload.js       – Context bridge: exposes Socket.IO + platform to renderer
  renderer/
    index.html       – App shell (auth + chat UI)
    css/
      base.css           – Reset, layout, variables
      variables.css      – CSS custom properties / theme tokens
      auth.css           – Login / register screens
      server-sidebar.css – Left server icon rail
      channel-sidebar.css– Channel list, chat pane, message styles
      members-pane.css   – Members panel + profile popup
      menus.css          – Context menus, dropdowns
      modals.css         – Overlays and modal dialogs
      mobile.css         – Mobile / PWA overrides (web only)
    js/
      globals.js         – Shared DOM refs and mutable state
      api.js             – Federation + server REST helpers (fedGet/Post/Patch…)
      auth.js            – Login, register, logout, session restore
      servers.js         – Server sidebar, health checks, context menus, settings
      channels.js        – Channel list, permissions, create/rename/delete
      messages.js        – Message rendering, send, edit, delete, pagination
      socket.js          – Server Socket.IO connection + event handlers
      fed-socket.js      – Federation Socket.IO connection + event handlers
      social-socket.js   – Social/DM socket events
      social-api.js      – Friend and conversation REST calls
      home.js            – Home screen: DM list, friend requests
      profile.js         – Profile popup component
      server-settings.js – Server settings panels (overview, roles, members…)
      theme.js           – Theme switcher
      platform.js        – Browser-side window.concordia shim (web only)
      init.js            – App bootstrap
  web/
    server.js        – Express server (web client host, HTML patching, PWA)
    manifest.json    – PWA manifest
branding/            – Logos and brand assets
Concordia-Docs/      – API reference (Federation, Server, Social)
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the web server listens on |
| `RAILWAY_PUBLIC_DOMAIN` | — | Set automatically by Railway for correct OG URLs |

The Federation URL and default server URL are defined as constants in `src/renderer/js/globals.js`.
