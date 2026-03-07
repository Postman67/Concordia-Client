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
let userServers    = [];      // [{ id, server_address, server_name, position }]
let activeServerId = null;    // federation entry id
let activeServerUrl= null;    // http:// URL for the active server
let socket         = null;
let channels       = [];
let activeChannelId= null;
let messages       = {};      // channelId → [msg, ...]
let typingUsers    = {};      // channelId → Set<username>
let typingTimer    = null;
let lastMsgMeta    = null;    // { userId, timestamp } — message grouping
let avatarCache    = {};      // userId → avatarUrl
let currentUserRole = 'member'; // 'member' | 'moderator' | 'admin'
let dragSrcId      = null;       // federation server id being dragged
let dragOverTarget = null;       // { id: serverId|null, insertBefore: bool }

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
const serverContextMenu    = document.getElementById('server-context-menu');
const ctxServerInfo        = document.getElementById('ctx-server-info');
const ctxServerSettings    = document.getElementById('ctx-server-settings');
const ctxServerLeave       = document.getElementById('ctx-server-leave');
const serverInfoOverlay    = document.getElementById('server-info-overlay');
const serverInfoName       = document.getElementById('server-info-name');
const serverInfoBody       = document.getElementById('server-info-body');
const btnCloseServerInfo   = document.getElementById('btn-close-server-info');
const leaveServerOverlay   = document.getElementById('leave-server-overlay');
const leaveServerMessage   = document.getElementById('leave-server-message');
const leaveServerError     = document.getElementById('leave-server-error');
const btnCancelLeaveServer = document.getElementById('btn-cancel-leave-server');
const btnConfirmLeaveServer= document.getElementById('btn-confirm-leave-server');

// Channel sidebar
const serverNameLabel  = document.getElementById('server-name-label');
const btnServerName    = document.getElementById('btn-server-name');
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

// Server settings overlay
const serverSettingsOverlay = document.getElementById('server-settings-overlay');
const ssServerNameEl        = document.getElementById('ss-server-name');
const ssNavItems            = document.querySelectorAll('.ss-nav-item[data-panel]');
const ssCloseBtn            = document.getElementById('ss-close-btn');
const ssNameInput           = document.getElementById('ss-name');
const ssDescInput           = document.getElementById('ss-description');
const ssBtnSaveOverview     = document.getElementById('ss-btn-save-overview');
const ssOverviewStatus      = document.getElementById('ss-overview-status');
const ssMembersList         = document.getElementById('ss-members-list');
const ssMembersStatus       = document.getElementById('ss-members-status');

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

  // Load settings, server list, and fresh user profile from federation in parallel.
  // Fetching /api/user/me ensures currentUser.id is always the current UUID, even
  // when restoring a session that was cached before the Federation migrated to UUIDs.
  const [settingsRes, serversRes, meRes] = await Promise.all([
    fedGet('/api/settings').catch(() => null),
    fedGet('/api/servers').catch(() => ({ servers: [] })),
    fedGet('/api/user/me').catch(() => null),
  ]);
  if (!token) return; // fedGet triggered logout (token expired)
  userSettings = settingsRes?.settings ?? { theme: 'dark' };
  userServers  = serversRes?.servers   ?? [];

  // Use the freshest user object available (guards against stale localStorage IDs)
  if (meRes?.user) {
    currentUser = meRes.user;
    localStorage.setItem('auth_user', JSON.stringify(meRes.user));
  }

  // Apply federation theme (overrides localStorage)
  const isLight = userSettings.theme === 'light';
  applyTheme(isLight);
  localStorage.setItem('theme', userSettings.theme ?? 'dark');

  updateUserDisplay();

  // Seed avatar cache with current user's PFP
  if (currentUser?.id && userSettings?.avatar_url) {
    avatarCache[String(currentUser.id)] = userSettings.avatar_url;
  }

  authScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  renderServerSidebar();

  // Restore last server/channel, or fall back to first server.
  // Server IDs are Federation UUIDs (strings) — do NOT coerce with Number().
  // Channel IDs are still integers from the chat server.
  const lastServerId  = localStorage.getItem('last_server_id') || null;
  const lastChannelId = Number(localStorage.getItem('last_channel_id')) || null;
  const startServer   = lastServerId && userServers.find(s => String(s.id) === String(lastServerId))
                        ? lastServerId
                        : userServers.length > 0 ? userServers[0].id : null;
  if (startServer) await selectServer(startServer, lastChannelId);
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
    wrap.draggable = true;

    const btn = document.createElement('button');
    btn.className = 'server-icon-btn';
    btn.draggable = false;
    if (srv.id === activeServerId) btn.classList.add('active');
    const label = (srv.server_name || srv.server_address).slice(0, 2).toUpperCase();
    btn.textContent = label;
    btn.title = srv.server_name || srv.server_address;
    btn.setAttribute('aria-label', srv.server_name || srv.server_address);
    btn.style.background = srv.id === activeServerId ? '' : stringToColor(srv.server_name || srv.server_address);
    btn.addEventListener('click', () => selectServer(srv.id));

    // Right-click context menu
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openServerContextMenu(e.clientX, e.clientY, srv.id);
    });

    // Drag-to-reorder
    wrap.addEventListener('dragstart', (e) => {
      dragSrcId = srv.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(srv.id)); // required for Firefox
      // Defer adding class so the ghost image captures the normal appearance
      requestAnimationFrame(() => wrap.classList.add('dragging'));
    });

    wrap.addEventListener('dragend', () => {
      document.querySelectorAll('.drag-drop-line').forEach(el => el.remove());
      serverListIcons.querySelectorAll('.server-icon-wrap.dragging').forEach(el => el.classList.remove('dragging'));
      dragSrcId = null;
      dragOverTarget = null;
    });

    wrap.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragSrcId || srv.id === dragSrcId) return;
      e.dataTransfer.dropEffect = 'move';
      const rect = wrap.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + rect.height / 2;
      dragOverTarget = { id: srv.id, insertBefore };
      document.querySelectorAll('.drag-drop-line').forEach(el => el.remove());
      const line = document.createElement('div');
      line.className = 'drag-drop-line';
      serverListIcons.insertBefore(line, insertBefore ? wrap : wrap.nextSibling);
    });

    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      finalizeDrop();
    });

    wrap.appendChild(btn);
    serverListIcons.appendChild(wrap);
  });

  // Add-server entry — last item in the scrollable list
  const divider = document.createElement('div');
  divider.className = 'server-list-divider';
  // Allow dropping onto the divider to move a server to the end
  divider.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragSrcId) return;
    e.dataTransfer.dropEffect = 'move';
    dragOverTarget = { id: null, insertBefore: false };
    document.querySelectorAll('.drag-drop-line').forEach(el => el.remove());
    const line = document.createElement('div');
    line.className = 'drag-drop-line';
    serverListIcons.insertBefore(line, divider);
  });
  divider.addEventListener('drop', (e) => {
    e.preventDefault();
    finalizeDrop();
  });
  serverListIcons.appendChild(divider);

  const addWrap = document.createElement('div');
  addWrap.className = 'server-icon-wrap';
  const addBtn = document.createElement('button');
  addBtn.className = 'server-icon-btn add-server-btn';
  addBtn.title = 'Add a server';
  addBtn.setAttribute('aria-label', 'Add a server');
  addBtn.textContent = '+';
  addBtn.addEventListener('click', openAddServerModal);
  addWrap.appendChild(addBtn);
  serverListIcons.appendChild(addWrap);
}

function finalizeDrop() {
  document.querySelectorAll('.drag-drop-line').forEach(el => el.remove());
  const srcId  = dragSrcId;
  const target = dragOverTarget;
  dragSrcId      = null;
  dragOverTarget = null;
  if (!srcId || !target) return;

  const sorted = [...userServers].sort((a, b) => a.position - b.position);
  const fromIdx = sorted.findIndex(s => s.id === srcId);
  if (fromIdx === -1) return;

  if (target.id === null) {
    // Move to end
    const [moved] = sorted.splice(fromIdx, 1);
    sorted.push(moved);
  } else {
    const [moved] = sorted.splice(fromIdx, 1);
    // Re-find target index after the splice (it may have shifted)
    const newTargetIdx = sorted.findIndex(s => s.id === target.id);
    if (newTargetIdx === -1) { sorted.splice(fromIdx, 0, moved); return; }
    sorted.splice(target.insertBefore ? newTargetIdx : newTargetIdx + 1, 0, moved);
  }

  sorted.forEach((s, i) => { s.position = i; });
  userServers = sorted;
  renderServerSidebar();
  commitServerOrder();
}

function commitServerOrder() {
  userServers.forEach(s =>
    fedPatch(`/api/servers/${s.id}`, { position: s.position }).catch(() => {})
  );
}

// ═══════════════════════════════════════════════════════════════
//  Server Context Menu
// ═══════════════════════════════════════════════════════════════

let contextMenuTargetId = null;

function openServerContextMenu(x, y, fedServerId) {
  contextMenuTargetId = fedServerId;
  btnServerName.dataset.open = 'true';
  serverContextMenu.classList.remove('hidden');

  // Keep menu inside viewport (measure after making visible)
  const menuW = serverContextMenu.offsetWidth  || 170;
  const menuH = serverContextMenu.offsetHeight || 130;
  const left = Math.min(x, window.innerWidth  - menuW - 8);
  const top  = Math.min(y, window.innerHeight - menuH - 8);
  serverContextMenu.style.left = `${left}px`;
  serverContextMenu.style.top  = `${top}px`;
}

function closeServerContextMenu() {
  serverContextMenu.classList.add('hidden');
  btnServerName.dataset.open = 'false';
  contextMenuTargetId = null;
}

// Wire up the server name button → opens dropdown anchored below the header
btnServerName.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!activeServerId) return;
  if (!serverContextMenu.classList.contains('hidden')) {
    closeServerContextMenu();
    return;
  }
  const rect = btnServerName.getBoundingClientRect();
  openServerContextMenu(rect.left, rect.bottom + 4, activeServerId);
});

// Close on any click outside (ignore clicks on the toggle button itself)
document.addEventListener('click', (e) => {
  if (btnServerName.contains(e.target)) return;
  if (!serverContextMenu.contains(e.target)) closeServerContextMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeServerContextMenu();
});

// Info
ctxServerInfo.addEventListener('click', async () => {
  const fedServerId = contextMenuTargetId;
  closeServerContextMenu();
  const srv = userServers.find(s => s.id === fedServerId);
  if (!srv) return;

  serverInfoName.textContent = srv.server_name || srv.server_address;
  serverInfoBody.innerHTML = '<p class="server-info-loading">Loading&hellip;</p>';
  serverInfoOverlay.classList.remove('hidden');

  try {
    const url = buildServerUrl(srv.server_address);
    const res = await fetch(`${url}/api/server/info`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    serverInfoBody.innerHTML = '';
    const rows = [
      { label: 'Name',        value: info.name        ?? '—' },
      { label: 'Description', value: info.description ?? '—' },
      { label: 'Members',     value: info.member_count ?? '—' },
      { label: 'Address',     value: srv.server_address },
    ];
    rows.forEach(({ label, value }) => {
      const row = document.createElement('div');
      row.className = 'server-info-row';
      row.innerHTML = `<label>${label}</label><span>${escapeHtml(String(value))}</span>`;
      serverInfoBody.appendChild(row);
    });
  } catch (err) {
    serverInfoBody.innerHTML = `<p class="server-info-loading">Failed to load: ${escapeHtml(err.message)}</p>`;
  }
});

btnCloseServerInfo.addEventListener('click', () => serverInfoOverlay.classList.add('hidden'));
serverInfoOverlay.addEventListener('click', (e) => {
  if (e.target === serverInfoOverlay) serverInfoOverlay.classList.add('hidden');
});

// Leave
ctxServerLeave.addEventListener('click', () => {
  const fedServerId = contextMenuTargetId;
  closeServerContextMenu();
  const srv = userServers.find(s => s.id === fedServerId);
  if (!srv) return;

  leaveServerMessage.textContent = `Leave "${srv.server_name || srv.server_address}"? You can re-add it later.`;
  leaveServerError.textContent = '';
  btnConfirmLeaveServer.disabled = false;
  leaveServerOverlay.dataset.targetId = fedServerId;
  leaveServerOverlay.classList.remove('hidden');
});

btnCancelLeaveServer.addEventListener('click', () => leaveServerOverlay.classList.add('hidden'));
leaveServerOverlay.addEventListener('click', (e) => {
  if (e.target === leaveServerOverlay) leaveServerOverlay.classList.add('hidden');
});

btnConfirmLeaveServer.addEventListener('click', async () => {
  const fedServerId = Number(leaveServerOverlay.dataset.targetId);
  btnConfirmLeaveServer.disabled = true;
  leaveServerError.textContent = '';
  try {
    await fedDelete(`/api/servers/${fedServerId}`);
    leaveServerOverlay.classList.add('hidden');
    userServers = userServers.filter(s => s.id !== fedServerId);
    if (activeServerId === fedServerId) {
      if (socket) { socket.disconnect(); socket = null; }
      activeServerId  = null;
      activeServerUrl = null;
      activeChannelId = null;
      channels        = [];
      messages        = {};
      typingUsers     = {};
      currentUserRole = 'member';
      serverNameLabel.textContent = 'Channels';
      btnServerName.disabled = true;
      channelList.innerHTML       = '';
      messagesContainer.innerHTML = '';
      channelView.classList.add('hidden');
      noChannelPlaceholder.classList.remove('hidden');
      btnNewChannel.style.display    = 'none';
      btnDeleteChannel.style.display = 'none';
      ctxServerSettings.style.display = 'none';
      localStorage.removeItem('last_server_id');
      localStorage.removeItem('last_channel_id');
    }
    renderServerSidebar();
  } catch (err) {
    leaveServerError.textContent = `Could not leave server: ${err.message}`;
    btnConfirmLeaveServer.disabled = false;
  }
});

// ═══════════════════════════════════════════════════════════════
//  Server Settings
// ═══════════════════════════════════════════════════════════════

ctxServerSettings.addEventListener('click', () => {
  closeServerContextMenu();
  openServerSettings();
});

function openServerSettings() {
  if (!activeServerId || currentUserRole !== 'admin') return;
  const srv = userServers.find(s => s.id === activeServerId);
  ssServerNameEl.textContent = srv?.server_name || 'Server';
  switchSSPanel('overview');
  serverSettingsOverlay.classList.remove('hidden');
  loadSSOverview();
}

function closeServerSettings() {
  serverSettingsOverlay.classList.add('hidden');
}

function switchSSPanel(panelId) {
  ssNavItems.forEach(btn => {
    const isActive = btn.dataset.panel === panelId;
    btn.classList.toggle('active', isActive);
    document.getElementById(`ss-panel-${btn.dataset.panel}`)?.classList.toggle('hidden', !isActive);
  });
}

ssNavItems.forEach(btn => btn.addEventListener('click', () => {
  switchSSPanel(btn.dataset.panel);
  if (btn.dataset.panel === 'members') loadSSMembers();
}));

ssCloseBtn.addEventListener('click', closeServerSettings);
serverSettingsOverlay.addEventListener('click', (e) => {
  if (e.target === serverSettingsOverlay) closeServerSettings();
});

async function loadSSOverview() {
  ssOverviewStatus.textContent = '';
  ssNameInput.value = '';
  ssDescInput.value = '';
  try {
    const settings = await apiGet('/api/server/settings');
    ssNameInput.value = settings.name        ?? '';
    ssDescInput.value = settings.description ?? '';
  } catch (err) {
    ssOverviewStatus.textContent = `Failed to load: ${err.message}`;
    ssOverviewStatus.style.color = 'var(--red)';
  }
}

ssBtnSaveOverview.addEventListener('click', async () => {
  ssOverviewStatus.textContent = '';
  const name        = ssNameInput.value.trim();
  const description = ssDescInput.value.trim();
  if (!name) {
    ssOverviewStatus.textContent = 'Name is required.';
    ssOverviewStatus.style.color = 'var(--red)';
    return;
  }
  try {
    const updated = await apiPatch('/api/server/settings', { name, description });
    const srv = userServers.find(s => s.id === activeServerId);
    if (srv) {
      srv.server_name = updated.name;
      fedPatch(`/api/servers/${activeServerId}`, { server_name: updated.name }).catch(() => {});
    }
    serverNameLabel.textContent = updated.name;
    ssServerNameEl.textContent  = updated.name;
    ssOverviewStatus.textContent = 'Saved!';
    ssOverviewStatus.style.color = 'var(--primary-text)';
  } catch (err) {
    ssOverviewStatus.textContent = err.message;
    ssOverviewStatus.style.color = 'var(--red)';
  }
});

async function loadSSMembers() {
  ssMembersStatus.textContent = '';
  ssMembersList.innerHTML = '<p class="server-info-loading">Loading&hellip;</p>';
  try {
    const { members } = await apiGet('/api/server/members');
    ssMembersList.innerHTML = '';
    if (!members?.length) {
      ssMembersList.innerHTML = '<p class="server-info-loading">No members found.</p>';
      return;
    }
    members.forEach(m => {
      const row = document.createElement('div');
      row.className = 'ss-member-row';

      const avatarEl = document.createElement('div');
      avatarEl.className = 'ss-member-avatar';
      const cached = avatarCache[m.user_id];
      if (cached) {
        const img = document.createElement('img');
        img.src = cached;
        img.alt = '';
        avatarEl.appendChild(img);
      } else {
        avatarEl.textContent = m.username.slice(0, 2).toUpperCase();
        avatarEl.style.background = stringToColor(m.username);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'ss-member-name';
      nameEl.textContent = m.username;

      const select = document.createElement('select');
      select.className = 'ss-member-role-select';
      ['member', 'moderator', 'admin'].forEach(role => {
        const opt = document.createElement('option');
        opt.value = role;
        opt.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        if (role === m.role) opt.selected = true;
        select.appendChild(opt);
      });
      if (String(m.user_id) === String(currentUser.id)) select.disabled = true;

      select.addEventListener('change', async () => {
        const prevRole = m.role;
        select.disabled = true;
        ssMembersStatus.textContent = '';
        try {
          const result = await apiPut(`/api/server/members/${m.user_id}/role`, { role: select.value });
          m.role = result.member.role;
          ssMembersStatus.textContent = `Updated ${m.username} to ${m.role}.`;
          ssMembersStatus.style.color = 'var(--primary-text)';
        } catch (err) {
          select.value = prevRole;
          ssMembersStatus.textContent = err.message;
          ssMembersStatus.style.color = 'var(--red)';
        } finally {
          if (String(m.user_id) !== String(currentUser.id)) select.disabled = false;
        }
      });

      row.appendChild(avatarEl);
      row.appendChild(nameEl);
      row.appendChild(select);
      ssMembersList.appendChild(row);
    });
  } catch (err) {
    ssMembersList.innerHTML = `<p class="server-info-loading">Failed: ${escapeHtml(err.message)}</p>`;
  }
}

function openAddServerModal() {
  document.getElementById('add-server-address').value = '';
  addServerError.textContent = '';
  addServerOverlay.classList.remove('hidden');
}

async function selectServer(fedServerId, restoreChannelId = null) {
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
  localStorage.setItem('last_server_id', fedServerId);

  // Show cached server_name immediately while we wait for the join response
  serverNameLabel.textContent = srv.server_name || 'Channels';
  btnServerName.disabled = false;

  // Reset placeholder to default text before connecting
  noChannelPlaceholder.querySelector('p').textContent = 'Select a channel to start chatting';
  noChannelPlaceholder.querySelector('p').style.color = '';

  renderServerSidebar();
  connectSocket();

  // Notify server this user is a member (idempotent) and read back the real server name
  try {
    const joinRes = await apiPost('/api/server/join', {});
    const realName = joinRes?.server?.name;
    if (realName) {
      serverNameLabel.textContent = realName;
      // Update local cache if changed
      if (srv.server_name !== realName) {
        srv.server_name = realName;
        fedPatch(`/api/servers/${fedServerId}`, { server_name: realName }).catch(() => {});
      }
    }
  } catch (_) {}

  // Fetch current user's role on this server.
  // Normalize both sides to strings so integer IDs and UUID strings compare correctly.
  try {
    const { members } = await apiGet('/api/server/members');
    const me = members?.find(m => String(m.user_id) === String(currentUser.id));
    currentUserRole = me?.role ?? 'member';
  } catch (_) { currentUserRole = 'member'; }
  btnNewChannel.style.display = (currentUserRole === 'moderator' || currentUserRole === 'admin') ? '' : 'none';
  ctxServerSettings.style.display = currentUserRole === 'admin' ? '' : 'none';

  await loadChannels(restoreChannelId);
}

function buildServerUrl(address) {
  if (/^https?:\/\//.test(address)) return address; // explicit scheme wins
  return `https://${address}`;
}

// ─── Add server ────────────────────────────────────────────────

btnCancelAddServer.addEventListener('click', () => addServerOverlay.classList.add('hidden'));
addServerOverlay.addEventListener('click', (e) => {
  if (e.target === addServerOverlay) addServerOverlay.classList.add('hidden');
});
addServerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addServerError.textContent = '';
  const server_address = document.getElementById('add-server-address').value.trim();
  try {
    const { server } = await fedPost('/api/servers', { server_address });
    userServers.push(server);
    addServerOverlay.classList.add('hidden');
    renderServerSidebar();
    selectServer(server.id, null);
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
    if (String(user.id) === String(currentUser.id)) return; // ignore self
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

async function loadChannels(restoreChannelId = null) {
  try {
    channels = await apiGet('/api/channels');
    renderChannelList();
    // Restore last channel if valid for this server, else leave unselected
    if (restoreChannelId && channels.find(c => c.id === restoreChannelId)) {
      selectChannel(restoreChannelId);
    }
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

  // Group channels by category, preserving API sort order (category_position, then position)
  const byCategory = new Map(); // category key → { label, position, channels[] }
  channels.forEach((ch) => {
    const key = ch.category_id ?? '__none__';
    if (!byCategory.has(key)) {
      byCategory.set(key, {
        label:    ch.category_name    ?? null,
        position: ch.category_position ?? Infinity,
        channels: [],
      });
    }
    byCategory.get(key).channels.push(ch);
  });

  // Sort categories by position; uncategorized (null) goes last
  const sorted = [...byCategory.values()].sort((a, b) => a.position - b.position);

  sorted.forEach((group) => {
    if (group.label) {
      const label = document.createElement('li');
      label.className = 'channel-section-label';
      label.textContent = group.label;
      channelList.appendChild(label);
    }
    group.channels.forEach((ch) => {
      const li = document.createElement('li');
      li.textContent = ch.name;
      li.dataset.id = ch.id;
      if (ch.id === activeChannelId) li.classList.add('active');
      li.addEventListener('click', () => selectChannel(ch.id));
      channelList.appendChild(li);
    });
  });
}

async function selectChannel(channelId) {
  // Leave previous channel
  if (activeChannelId && activeChannelId !== channelId) {
    socket.emit('channel:leave', activeChannelId);
  }

  activeChannelId = channelId;
  localStorage.setItem('last_channel_id', channelId);

  // Update sidebar highlight
  channelList.querySelectorAll('li').forEach((li) => {
    li.classList.toggle('active', Number(li.dataset.id) === channelId);
  });

  const ch = channels.find((c) => c.id === channelId);
  channelNameLabel.textContent = ch ? ch.name : channelId;

  // Show/hide delete button based on admin role
  btnDeleteChannel.style.display = currentUserRole === 'admin' ? '' : 'none';

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
  // Normalise both REST shape (user_id/username) and socket shape (user: { id, username })
  const username = msg.user?.username ?? msg.username ?? 'Unknown';
  const userId   = msg.user?.id       ?? msg.user_id  ?? username;
  const createdAt = msg.createdAt ?? msg.created_at;
  const timestamp = createdAt ? new Date(createdAt).getTime() : Date.now();

  // Update avatar cache if we see a known user's data
  if (userId === currentUser?.id && userSettings?.avatar_url) {
    avatarCache[userId] = userSettings.avatar_url;
  }

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
  const avatarUrl = avatarCache[userId] ?? '';

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
  localStorage.removeItem('last_server_id');
  localStorage.removeItem('last_channel_id');
  avatarCache = {};
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
  serverNameLabel.textContent = 'Channels';
  btnServerName.disabled = true;
  currentUserRole             = 'member';
  btnNewChannel.style.display = 'none';
  btnDeleteChannel.style.display = 'none';
  ctxServerSettings.style.display = 'none';
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

async function fedPatch(path, body) {
  const res = await fetch(`${FEDERATION_URL}${path}`, {
    method: 'PATCH',
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

async function apiPatch(path, body) {
  const res = await fetch(`${activeServerUrl}${path}`, {
    method: 'PATCH',
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

async function apiPut(path, body) {
  const res = await fetch(`${activeServerUrl}${path}`, {
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
