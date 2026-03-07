/* ═══════════════════════════════════════════════════════════════
   Concordia – Renderer app script
   Flows: Auth → Connect socket → Load channels → Chat
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── Config ──────────────────────────────────────────────────────────────────
const SERVER_URL = 'http://localhost:3000';

// ─── State ───────────────────────────────────────────────────────────────────
let token = null;
let currentUser = null;   // { id, username }
let socket = null;
let channels = [];        // [{ id, name, description, created_at }]
let activeChannelId = null;
let messages = {};        // channelId → [msg, ...]
let typingUsers = {};     // channelId → Set<username>
let typingTimer = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const authScreen       = document.getElementById('auth-screen');
const chatScreen       = document.getElementById('chat-screen');

// Auth
const tabBtns          = document.querySelectorAll('.tab');
const loginForm        = document.getElementById('login-form');
const registerForm     = document.getElementById('register-form');
const loginError       = document.getElementById('login-error');
const regError         = document.getElementById('reg-error');

// Sidebar
const channelList      = document.getElementById('channel-list');
const currentUserLabel = document.getElementById('current-user-label');
const btnNewChannel    = document.getElementById('btn-new-channel');
const btnLogout        = document.getElementById('btn-logout');

// Chat pane
const noChannelPlaceholder = document.getElementById('no-channel-placeholder');
const channelView      = document.getElementById('channel-view');
const channelNameLabel = document.getElementById('channel-name-label');
const btnDeleteChannel = document.getElementById('btn-delete-channel');
const messagesContainer= document.getElementById('messages-container');
const btnLoadMore      = document.getElementById('btn-load-more');
const typingBar        = document.getElementById('typing-bar');
const messageForm      = document.getElementById('message-form');
const messageInput     = document.getElementById('message-input');

// Modal
const modalOverlay     = document.getElementById('modal-overlay');
const newChannelForm   = document.getElementById('new-channel-form');
const newChannelName   = document.getElementById('new-channel-name');
const newChannelDesc   = document.getElementById('new-channel-desc');
const btnCancelModal   = document.getElementById('btn-cancel-modal');
const channelError     = document.getElementById('channel-error');

// ═══════════════════════════════════════════════════════════════
//  Auth
// ═══════════════════════════════════════════════════════════════

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    loginForm.classList.toggle('hidden', target !== 'login');
    registerForm.classList.toggle('hidden', target !== 'register');
  });
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await apiPost('/api/auth/login', { username, password });
    onAuthenticated(data.token, data.user);
  } catch (err) {
    loginError.textContent = err.message;
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  regError.textContent = '';
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  try {
    const data = await apiPost('/api/auth/register', { username, password });
    onAuthenticated(data.token, data.user);
  } catch (err) {
    regError.textContent = err.message;
  }
});

function onAuthenticated(jwt, user) {
  token = jwt;
  currentUser = user;
  currentUserLabel.textContent = user.username;
  authScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  connectSocket();
  loadChannels();
}

// ═══════════════════════════════════════════════════════════════
//  Socket.IO
// ═══════════════════════════════════════════════════════════════

function connectSocket() {
  socket = window.concordia.createSocket(SERVER_URL, token);

  socket.on('connect', () => {
    console.log('[socket] connected');
    // Re-join active channel if we reconnected mid-session
    if (activeChannelId) socket.emit('channel:join', activeChannelId);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] connection error:', err.message);
  });

  socket.on('message:new', (msg) => {
    if (!messages[msg.channelId]) messages[msg.channelId] = [];
    messages[msg.channelId].push(msg);
    if (msg.channelId === activeChannelId) {
      appendMessage(msg);
      scrollToBottom();
    }
  });

  socket.on('typing:update', ({ channelId, user, isTyping }) => {
    if (user.id === currentUser.id) return; // ignore self
    if (!typingUsers[channelId]) typingUsers[channelId] = new Set();
    if (isTyping) {
      typingUsers[channelId].add(user.username);
    } else {
      typingUsers[channelId].delete(user.username);
    }
    if (channelId === activeChannelId) renderTypingBar();
  });

  socket.on('error', ({ message }) => {
    console.warn('[socket] server error:', message);
  });
}

// ═══════════════════════════════════════════════════════════════
//  Channels
// ═══════════════════════════════════════════════════════════════

async function loadChannels() {
  try {
    channels = await apiGet('/api/channels');
    renderChannelList();
  } catch (err) {
    console.error('Failed to load channels:', err);
  }
}

function renderChannelList() {
  channelList.innerHTML = '';
  channels.forEach((ch) => {
    const li = document.createElement('li');
    li.textContent = ch.name;
    li.dataset.id = ch.id;
    if (ch.id === activeChannelId) li.classList.add('active');
    li.addEventListener('click', () => selectChannel(ch.id));
    channelList.appendChild(li);
  });
}

async function selectChannel(channelId) {
  // Leave previous channel
  if (activeChannelId && activeChannelId !== channelId) {
    socket.emit('channel:leave', activeChannelId);
  }

  activeChannelId = channelId;

  // Update sidebar highlight
  channelList.querySelectorAll('li').forEach((li) => {
    li.classList.toggle('active', Number(li.dataset.id) === channelId);
  });

  const ch = channels.find((c) => c.id === channelId);
  channelNameLabel.textContent = ch ? ch.name : channelId;

  // Show/hide delete button (only for channel owner — we just show it always;
  // the server will reject the DELETE if the user isn't the owner)
  btnDeleteChannel.style.display = '';

  noChannelPlaceholder.classList.add('hidden');
  channelView.classList.remove('hidden');

  // Load history if not cached
  if (!messages[channelId]) {
    await loadHistory(channelId);
  } else {
    renderMessages(channelId);
  }

  socket.emit('channel:join', channelId);
  renderTypingBar();
  messageInput.focus();
  scrollToBottom();
}

// ─── Create channel ───────────────────────────────────────────
btnNewChannel.addEventListener('click', () => {
  channelError.textContent = '';
  newChannelName.value = '';
  newChannelDesc.value = '';
  modalOverlay.classList.remove('hidden');
  newChannelName.focus();
});
btnCancelModal.addEventListener('click', () => modalOverlay.classList.add('hidden'));
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
});

newChannelForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  channelError.textContent = '';
  try {
    const ch = await apiPost('/api/channels', {
      name: newChannelName.value.trim(),
      description: newChannelDesc.value.trim() || undefined,
    });
    channels.push(ch);
    renderChannelList();
    modalOverlay.classList.add('hidden');
    selectChannel(ch.id);
  } catch (err) {
    channelError.textContent = err.message;
  }
});

// ─── Delete channel ───────────────────────────────────────────
btnDeleteChannel.addEventListener('click', async () => {
  if (!activeChannelId) return;
  const ch = channels.find((c) => c.id === activeChannelId);
  if (!confirm(`Delete #${ch?.name ?? activeChannelId}? This cannot be undone.`)) return;
  try {
    await apiDelete(`/api/channels/${activeChannelId}`);
    channels = channels.filter((c) => c.id !== activeChannelId);
    delete messages[activeChannelId];
    activeChannelId = null;
    channelView.classList.add('hidden');
    noChannelPlaceholder.classList.remove('hidden');
    renderChannelList();
  } catch (err) {
    alert(`Could not delete channel: ${err.message}`);
  }
});

// ═══════════════════════════════════════════════════════════════
//  Messages
// ═══════════════════════════════════════════════════════════════

async function loadHistory(channelId, before = null) {
  let url = `/api/messages/${channelId}?limit=50`;
  if (before) url += `&before=${encodeURIComponent(before)}`;
  try {
    const msgs = await apiGet(url);
    if (!messages[channelId]) messages[channelId] = [];
    if (before) {
      // Prepend older messages
      messages[channelId] = [...msgs, ...messages[channelId]];
      const prevScrollHeight = document.getElementById('message-list').scrollHeight;
      renderMessages(channelId);
      // Maintain scroll position after prepend
      const newScrollHeight = document.getElementById('message-list').scrollHeight;
      document.getElementById('message-list').scrollTop = newScrollHeight - prevScrollHeight;
    } else {
      messages[channelId] = msgs;
      renderMessages(channelId);
      scrollToBottom();
    }
    // Hide "load more" if server returned fewer messages than requested
    btnLoadMore.style.display = msgs.length < 50 ? 'none' : '';
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

btnLoadMore.addEventListener('click', () => {
  if (!activeChannelId) return;
  const msgs = messages[activeChannelId];
  const oldest = msgs && msgs.length ? msgs[0].created_at ?? msgs[0].createdAt : null;
  if (oldest) loadHistory(activeChannelId, oldest);
});

function renderMessages(channelId) {
  messagesContainer.innerHTML = '';
  const msgs = messages[channelId] ?? [];
  msgs.forEach((msg) => appendMessage(msg, false));
}

function appendMessage(msg, doScroll = true) {
  const username = msg.user?.username ?? msg.username ?? 'Unknown';
  const createdAt = msg.createdAt ?? msg.created_at;
  const time = createdAt ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const initials = username.slice(0, 2);
  const avatarColor = stringToColor(username);

  const el = document.createElement('div');
  el.className = 'message';
  el.innerHTML = `
    <div class="avatar" style="background:${avatarColor}">${escapeHtml(initials)}</div>
    <div class="message-body">
      <div class="message-meta">
        <span class="message-author">${escapeHtml(username)}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-content">${escapeHtml(msg.content)}</div>
    </div>
  `;
  messagesContainer.appendChild(el);

  if (doScroll) scrollToBottom();
}

function scrollToBottom() {
  const list = document.getElementById('message-list');
  list.scrollTop = list.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
//  Sending messages + typing
// ═══════════════════════════════════════════════════════════════

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content || !activeChannelId) return;
  socket.emit('message:send', { channelId: activeChannelId, content });
  messageInput.value = '';
  // Stop typing indicator
  clearTimeout(typingTimer);
  socket.emit('typing:stop', activeChannelId);
});

messageInput.addEventListener('input', () => {
  if (!activeChannelId) return;
  socket.emit('typing:start', activeChannelId);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('typing:stop', activeChannelId);
  }, 2000);
});

// ═══════════════════════════════════════════════════════════════
//  Typing indicator
// ═══════════════════════════════════════════════════════════════

function renderTypingBar() {
  if (!activeChannelId) { typingBar.textContent = ''; return; }
  const users = [...(typingUsers[activeChannelId] ?? [])];
  if (users.length === 0) {
    typingBar.textContent = '';
  } else if (users.length === 1) {
    typingBar.textContent = `${users[0]} is typing…`;
  } else if (users.length === 2) {
    typingBar.textContent = `${users[0]} and ${users[1]} are typing…`;
  } else {
    typingBar.textContent = 'Several people are typing…';
  }
}

// ═══════════════════════════════════════════════════════════════
//  Logout
// ═══════════════════════════════════════════════════════════════

btnLogout.addEventListener('click', () => {
  if (socket) socket.disconnect();
  socket = null;
  token = null;
  currentUser = null;
  activeChannelId = null;
  channels = [];
  messages = {};
  typingUsers = {};
  messagesContainer.innerHTML = '';
  channelList.innerHTML = '';
  channelView.classList.add('hidden');
  noChannelPlaceholder.classList.remove('hidden');
  chatScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  loginForm.reset();
  registerForm.reset();
});

// ═══════════════════════════════════════════════════════════════
//  REST helpers
// ═══════════════════════════════════════════════════════════════

async function apiPost(path, body) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
  return data;
}

async function apiGet(path) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) { btnLogout.click(); return []; }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════════

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Deterministic colour from username string (for avatar backgrounds)
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 38%)`;
}
