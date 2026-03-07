// The preload script runs in a privileged context with access to Node's require.
// It exposes a minimal, typed bridge to the renderer via contextBridge so the
// renderer never needs nodeIntegration=true.
const { contextBridge } = require('electron');
const { io } = require('socket.io-client');

// We expose a thin API surface only — no raw Node or Electron objects leak.
contextBridge.exposeInMainWorld('concordia', {
  // ─── Socket factory ────────────────────────────────────────────────────────
  // Returns a lightweight proxy so the renderer can communicate over Socket.IO
  // without having direct access to the socket object.
  createSocket(serverUrl, token) {
    const socket = io(serverUrl, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
    });

    const listeners = {};

    return {
      on(event, cb) {
        socket.on(event, cb);
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
      },
      off(event, cb) {
        socket.off(event, cb);
      },
      emit(event, ...args) {
        socket.emit(event, ...args);
      },
      disconnect() {
        socket.disconnect();
      },
      get connected() {
        return socket.connected;
      },
    };
  },
});
