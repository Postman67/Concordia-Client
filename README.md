# Concordia Electron Client

A real-time desktop chat client for the Concordia server, built with Electron.

## Features

- Register & login with JWT authentication
- Browse and create channels
- Real-time messaging via Socket.IO
- Message history with pagination (load older messages)
- Typing indicators
- Delete channels (owner only)

## Prerequisites

- Node.js 18+
- A running Concordia server (default: `http://localhost:3000`)

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

## Project structure

```
src/
  main.js          – Electron main process (creates BrowserWindow)
  preload.js       – Privileged bridge: exposes Socket.IO to renderer
  renderer/
    index.html     – App shell (auth + chat screens)
    styles.css     – All styles
    app.js         – All renderer logic (auth, REST, socket, UI)
package.json
```

## Configuration

The server URL is hardcoded in `src/renderer/app.js` as `SERVER_URL`.  
Change it there (or extend it to read from an `.env` file) for non-local deployments.
