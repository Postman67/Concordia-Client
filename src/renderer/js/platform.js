// platform.js — browser-only fallback for window.concordia
//
// In Electron, preload.js sets window.concordia via contextBridge before any
// page script runs, so this entire block is skipped.
//
// In a browser (served by src/web/server.js), the server injects the
// socket.io-client bundle as a <script> tag just before this file loads,
// making `io` available as a global when this code executes.

if (!window.concordia) {
  window.concordia = {
    createSocket(serverUrl, token) {
      const socket = io(serverUrl, {
        auth: { token },
        transports: ['websocket'],
        autoConnect: true,
      });

      return {
        on(event, cb)        { socket.on(event, cb); },
        off(event, cb)       { socket.off(event, cb); },
        emit(event, ...args) { socket.emit(event, ...args); },
        disconnect()         { socket.disconnect(); },
        get connected()      { return socket.connected; },
      };
    },
  };
}
