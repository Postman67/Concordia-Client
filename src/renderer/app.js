/* ═══════════════════════════════════════════════════════════════
   Concordia – Renderer app script
   Auth → Federation → Server list → Per-server chat
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── Config ──────────────────────────────────────────────────────────────────
const FEDERATION_URL = 'https://federation.concordiachat.com';

// ─── State ───────────────────────────────────────────────────────────────────
let token          = null;
let currentUser    = null;    // { id, username, email }
let userSettings   = null;    // { display_name, avatar_url, theme }
let userServers    = [];      // [{ id, server_address, nickname, position }]
let activeServerId = null;    // federation entry id
let activeServerUrl= null;    // http:// URL for the active server
let socket         = null;
let channels       = [];
let activeChannelId= null;
let messages       = {};      // channelId → [msg, ...]
let typingUsers    = {};      // channelId → Set<username>
let typingTimer    = null;
let lastMsgMeta    = null;    // { userId, timestamp } — message grouping

const GROUP_TIMEOUT_MS = 10 * 60 * 1000;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const authScreen       = document.getElementById('auth-screen');
const chatScreen       = document.getElementById('chat-screen');

// Auth
const tabBtns          = document.querySelectorAll('.tab');
const loginForm        = document.getElementById('login-form');
const registerForm     = document.getElementById('register-form');
const loginError       = document.getElementById('login-error');
const regError         = document.getElementById('reg-error');

// Server sidebar
const serverListIcons  = document.getElementById('server-list-icons');
const btnAddServer     = document.getElementById('btn-add-server');

// Channel sidebar
const channelList      = document.getElementById('channel-list');
const currentUserLabel = document.getElementById('current-user-label');
const currentUserAvatar= document.getElementById('current-user-avatar');
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

// Channel modal
const modalOverlay     = document.getElementById('modal-overlay');
const newChannelForm   = document.getElementById('new-channel-form');
const newChannelName   = document.getElementById('new-channel-name');
const newChannelDesc   = document.getElementById('new-channel-desc');
const btnCancelModal   = document.getElementById('btn-cancel-modal');
const channelError     = document.getElementById('channel-error');

// Add-server modal
const addServerOverlay  = document.getElementById('add-server-overlay');
const addServerForm     = document.getElementById('add-server-form');
const btnCancelAddServer= document.getElementById('btn-cancel-add-server');
const addServerError    = document.getElementById('add-server-error');

// Settings
const settingsOverlay     = document.getElementById('settings-overlay');
const btnSettings         = document.getElementById('btn-settings');
const btnCloseSettings    = document.getElementById('btn-close-settings');
const themeToggle         = document.getElementById('theme-toggle');
const settingsDisplayName = document.getElementById('settings-display-name');
const settingsAvatarUrl   = document.getElementById('settings-avatar-url');
const btnSaveSettings     = document.getElementById('btn-save-settings');
const settingsSaveStatus  = document.getElementById('settings-save-status');

// ═══════════════════════════════════════════════════════════════
//  Theme
// ═══════════════════════════════════════════════════════════════

function applyTheme(isLight) {
  document.body.classList.toggle('light', isLight);
  themeToggle.setAttribute('aria-checked', isLight ? 'true' : 'false');
}

// Init from localStorage until federation settings load
applyTheme(localStorage.getItem('theme') === 'light');

themeToggle.addEventListener('click', async () => {
  const isLight = document.body.classList.toggle('light');
  themeToggle.setAttribute('aria-checked', isLight ? 'true' : 'false');
  const newTheme = isLight ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
  if (token) {
    try { await fedPut('/api/settings', { theme: newTheme }); } catch (_) {}
  }
});

// Settings modal open/close
btnSettings.addEventListener('click', () => {
  if (userSettings) {
    settingsDisplayName.value = userSettings.display_name ?? '';
    settingsAvatarUrl.value   = userSettings.avatar_url   ?? '';
  }
  settingsSaveStatus.textContent = '';
  settingsOverlay.classList.remove('hidden');
});
btnCloseSettings.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
});

btnSaveSettings.addEventListener('click', async () => {
  settingsSaveStatus.textContent = '';
  const body = {};
  const dn = settingsDisplayName.value.trim();
  const av = settingsAvatarUrl.value.trim();
  if (dn) body.display_name = dn;
  if (av) body.avatar_url   = av;
  body.theme = document.body.classList.contains('light') ? 'light' : 'dark';
  try {
    const { settings } = await fedPut('/api/settings', body);
    userSettings = settings;
    updateUserDisplay();
    settingsSaveStatus.textContent = 'Saved!';
    settingsSaveStatus.style.color = 'var(--primary-text)';
  } catch (err) {
    settingsSaveStatus.textContent = err.message;
    settingsSaveStatus.style.color = 'var(--red)';
  }
});

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
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await fedPost('/api/auth/login', { email, password });
    onAuthenticated(data.token, data.user);
  } catch (err) {
    loginError.textContent = err.message;
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  regError.textContent = '';
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  try {
    const data = await fedPost('/api/auth/register', { username, email, password });
    onAuthenticated(data.token, data.user);
  } catch (err) {
    regError.textContent = err.message;
  }
});

async function onAuthenticated(jwt, user) {
  token = jwt;
  currentUser = user;

  // Persist session so the app restores automatically on relaunch
  localStorage.setItem('auth_token', jwt);
  localStorage.setItem('auth_user', JSON.stringify(user));

  // Load settings and server list from federation in parallel
  const [settingsRes, serversRes] = await Promise.all([
    fedGet('/api/settings').catch(() => null),
    fedGet('/api/servers').catch(() => ({ servers: [] })),
  ]);
  if (!token) return; // fedGet triggered logout (token expired)
  userSettings = settingsRes?.settings ?? { theme: 'dark' };
  userServers  = serversRes?.servers   ?? [];

  // Apply federation theme (overrides localStorage)
  const isLight = userSettings.theme === 'light';
  applyTheme(isLight);
  localStorage.setItem('theme', userSettings.theme ?? 'dark');

  updateUserDisplay();

  authScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  renderServerSidebar();

  // Auto-select first server if available
  if (userServers.length > 0) selectServer(userServers[0].id);
}

function updateUserDisplay() {
  const displayName = userSettings?.display_name || currentUser?.username || '';
  const avatarUrl   = userSettings?.avatar_url ?? '';
  currentUserLabel.textContent = displayName;

  const img      = currentUserAvatar.querySelector('img');
  const initials = currentUserAvatar.querySelector('span');
  if (avatarUrl) {
    img.src = avatarUrl;
    img.style.display = '';
    initials.style.display = 'none';
    currentUserAvatar.style.background = 'transparent';
  } else {
    img.style.display = 'none';
    initials.textContent = displayName.slice(0, 2).toUpperCase();
    initials.style.display = '';
    currentUserAvatar.style.background = stringToColor(displayName);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Server Sidebar
// ═══════════════════════════════════════════════════════════════

function renderServerSidebar() {
  serverListIcons.innerHTML = '';
  [...userServers].sort((a, b) => a.position - b.position).forEach((srv) => {
    const wrap = document.createElement('div');
    wrap.className = 'server-icon-wrap';
    if (srv.id === activeServerId) wrap.classList.add('active');
    wrap.dataset.id = srv.id;

    const btn = document.createElement('button');
    btn.className = 'server-icon-btn';
    if (srv.id === activeServerId) btn.classList.add('active');
    const label = (srv.nickname || srv.server_address).slice(0, 2).toUpperCase();
    btn.textContent = label;
    btn.title = srv.nickname || srv.server_address;
    btn.setAttribute('aria-label', srv.nickname || srv.server_address);
    btn.style.background = srv.id === activeServerId ? '' : stringToColor(srv.nickname || srv.server_address);
    btn.addEventListener('click', () => selectServer(srv.id));

    wrap.appendChild(btn);
    serverListIcons.appendChild(wrap);
  });
}

async function selectServer(fedServerId) {
  const srv = userServers.find((s) => s.id === fedServerId);
  if (!srv) return;

  if (socket) { socket.disconnect(); socket = null; }

  // Reset channel/message state
  activeChannelId = null;
  channels = [];
  messages = {};
  typingUsers = {};
  messagesContainer.innerHTML = '';
  channelList.innerHTML = '';
  channelView.classList.add('hidden');
  noChannelPlaceholder.classList.remove('hidden');

  activeServerId  = fedServerId;
  activeServerUrl = buildServerUrl(srv.server_address);

  // Reset placeholder to default text before connecting
  noChannelPlaceholder.querySelector('p').textContent = 'Select a channel to start chatting';
  noChannelPlaceholder.querySelector('p').style.color = '';

  renderServerSidebar();
  connectSocket();
  await loadChannels();
}

function buildServerUrl(address) {
  if (/^https?:\/\//.test(address)) return address;
  return `http://${address}`;
}

// ─── Add server ────────────────────────────────────────────────
btnAddServer.addEventListener('click', () => {
  document.getElementById('add-server-address').value = '';
  document.getElementById('add-server-nickname').value = '';
  addServerError.textContent = '';
  addServerOverlay.classList.remove('hidden');
});
btnCancelAddServer.addEventListener('click', () => addServerOverlay.classList.add('hidden'));
addServerOverlay.addEventListener('click', (e) => {
  if (e.target === addServerOverlay) addServerOverlay.classList.add('hidden');
});
addServerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addServerError.textContent = '';
  const server_address = document.getElementById('add-server-address').value.trim();
  const nickname       = document.getElementById('add-server-nickname').value.trim() || undefined;
  try {
    const { server } = await fedPost('/api/servers', { server_address, nickname });
    userServers.push(server);
    addServerOverlay.classList.add('hidden');
    renderServerSidebar();
    selectServer(server.id);
  } catch (err) {
    addServerError.textContent = err.message;
  }
});

// ═══════════════════════════════════════════════════════════════
//  Socket.IO
// ═══════════════════════════════════════════════════════════════

function connectSocket() {
  if (!activeServerUrl) return;
  socket = window.concordia.createSocket(activeServerUrl, token);

  socket.on('connect', () => {
    console.log('[socket] connected to', activeServerUrl);
    if (activeChannelId) socket.emit('channel:join', activeChannelId);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] connection error:', err.message);
    showServerError('Unable to connect to server');
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
    showServerError('Unable to connect to server');
  }
}

function showServerError(msg) {
  channelView.classList.add('hidden');
  noChannelPlaceholder.classList.remove('hidden');
  noChannelPlaceholder.querySelector('p').textContent = msg;
  noChannelPlaceholder.querySelector('p').style.color = 'var(--red)';
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
  lastMsgMeta = null;
  const msgs = messages[channelId] ?? [];
  msgs.forEach((msg) => appendMessage(msg, false));
}

function appendMessage(msg, doScroll = true) {
  const username = msg.user?.username ?? msg.username ?? 'Unknown';
  const userId = msg.user?.id ?? msg.user_id ?? username;
  const createdAt = msg.createdAt ?? msg.created_at;
  const timestamp = createdAt ? new Date(createdAt).getTime() : Date.now();

  const isContinuation =
    lastMsgMeta &&
    lastMsgMeta.userId === userId &&
    (timestamp - lastMsgMeta.timestamp) < GROUP_TIMEOUT_MS;

  lastMsgMeta = { userId, timestamp };

  if (isContinuation) {
    // Append just the content line to the existing message block
    const lastBody = messagesContainer.lastElementChild?.querySelector('.message-body');
    if (lastBody) {
      const contentEl = document.createElement('div');
      contentEl.className = 'message-content';
      contentEl.textContent = msg.content;
      lastBody.appendChild(contentEl);
      if (doScroll) scrollToBottom();
      return;
    }
  }

  // Full message block (new author or timed out)
  const time = createdAt ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const initials = username.slice(0, 2);
  const avatarColor = stringToColor(username);
  const avatarUrl = msg.user?.avatar_url ?? '';

  const el = document.createElement('div');
  el.className = 'message';

  // Build avatar element safely — shows PFP if available, falls back to initials
  const avatarEl = document.createElement('div');
  avatarEl.className = 'avatar';
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = initials;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover';
    img.addEventListener('error', () => {
      img.remove();
      avatarEl.style.background = avatarColor;
      avatarEl.textContent = initials;
    });
    avatarEl.appendChild(img);
  } else {
    avatarEl.style.background = avatarColor;
    avatarEl.textContent = initials;
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'message-body';
  bodyEl.innerHTML = `
    <div class="message-meta">
      <span class="message-author">${escapeHtml(username)}</span>
      <span class="message-time">${time}</span>
    </div>
    <div class="message-content">${escapeHtml(msg.content)}</div>
  `;

  el.appendChild(avatarEl);
  el.appendChild(bodyEl);
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
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  if (socket) socket.disconnect();
  socket         = null;
  token          = null;
  currentUser    = null;
  userSettings   = null;
  userServers    = [];
  activeServerId = null;
  activeServerUrl= null;
  activeChannelId= null;
  channels       = [];
  messages       = {};
  typingUsers    = {};
  messagesContainer.innerHTML = '';
  channelList.innerHTML       = '';
  serverListIcons.innerHTML   = '';
  channelView.classList.add('hidden');
  noChannelPlaceholder.querySelector('p').textContent = 'Select a channel to start chatting';
  noChannelPlaceholder.querySelector('p').style.color = '';
  noChannelPlaceholder.classList.remove('hidden');
  chatScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  loginForm.reset();
  registerForm.reset();
});

// ═══════════════════════════════════════════════════════════════
//  REST helpers — Federation (uses FEDERATION_URL + token)
// ═══════════════════════════════════════════════════════════════

async function fedPost(path, body) {
  const res = await fetch(`${FEDERATION_URL}${path}`, {
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

async function fedGet(path) {
  const res = await fetch(`${FEDERATION_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) { btnLogout.click(); return null; }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function fedPut(path, body) {
  const res = await fetch(`${FEDERATION_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
  return data;
}

async function fedDelete(path) {
  const res = await fetch(`${FEDERATION_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
}

// ─── REST helpers — active server (uses activeServerUrl + token) ──────────────

async function apiPost(path, body) {
  const res = await fetch(`${activeServerUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
  return data;
}

async function apiGet(path) {
  const res = await fetch(`${activeServerUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${activeServerUrl}${path}`, {
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

// ─── Splash + auto-restore ───────────────────────────────────────────────────
(async () => {
  const splash = document.getElementById('splash-screen');
  const MIN_MS = 1700;
  const t0     = Date.now();

  const savedToken = localStorage.getItem('auth_token');
  const savedUser  = JSON.parse(localStorage.getItem('auth_user') ?? 'null');

  let authed = false;
  if (savedToken && savedUser) {
    await onAuthenticated(savedToken, savedUser);
    authed = !!token; // null if fedGet triggered a 401 logout
  }

  // Ensure animation has enough time to play
  const remaining = MIN_MS - (Date.now() - t0);
  if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

  if (!authed) authScreen.classList.remove('hidden');
  splash.classList.add('fade-out');
  splash.addEventListener('transitionend', () => splash.remove(), { once: true });
})();

// Deterministic colour from username string (for avatar backgrounds)
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 38%)`;
}
