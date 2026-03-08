//  Auth
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  // Seed status from federation profile, then mark online
  currentUserStatus = meRes?.user?.status ?? 'online';
  fedPut('/api/user/status', { status: 'online' }).catch(() => {});
  currentUserStatus = 'online';
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => fedPost('/api/user/heartbeat', {}).catch(() => {}), 30000);

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
  // Server IDs are Federation UUIDs (strings) â€” do NOT coerce with Number().
  // Channel IDs are still integers from the chat server.
  const lastServerId  = localStorage.getItem('last_server_id') || null;
  const startServer   = lastServerId && userServers.find(s => String(s.id) === String(lastServerId))
                        ? lastServerId
                        : userServers.length > 0 ? userServers[0].id : null;
  if (startServer) {
    // Per-server last channel (falls back to global key for backwards compat)
    const lastChannelId = Number(localStorage.getItem(`last_channel_${startServer}`))
                       || Number(localStorage.getItem('last_channel_id'))
                       || null;
    await selectServer(startServer, lastChannelId);
  }
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
  currentUserStatusBadge.dataset.status = currentUserStatus;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Logout
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
  ctxServerSettings.style.display = 'none';
  serverMembers = [];
  serverCategories = [];
  clearInterval(heartbeatInterval);
  heartbeatInterval = null;
  currentUserStatus = 'online';
  memberStatusCache = {};
  channelView.classList.add('hidden');
  noChannelPlaceholder.querySelector('p').textContent = 'Select a channel to start chatting';
  noChannelPlaceholder.querySelector('p').style.color = '';
  noChannelPlaceholder.classList.remove('hidden');
  chatScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  loginForm.reset();
  registerForm.reset();
});

// ─── Status context menu ─────────────────────────────────────────────────────
sidebarUser.addEventListener('click', () => {
  if (!token) return;
  if (!statusContextMenu.classList.contains('hidden')) {
    statusContextMenu.classList.add('hidden');
    return;
  }
  statusContextMenu.querySelectorAll('.ctx-status-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === currentUserStatus);
  });
  statusContextMenu.classList.remove('hidden');
  const footerEl = sidebarUser.closest('.sidebar-footer');
  const fRect    = footerEl.getBoundingClientRect();
  const mH = statusContextMenu.offsetHeight || 180;
  const mW = statusContextMenu.offsetWidth  || 190;
  statusContextMenu.style.left = `${Math.min(fRect.left + 8, window.innerWidth  - mW - 8)}px`;
  statusContextMenu.style.top  = `${Math.max(fRect.top  - mH - 4, 8)}px`;
});

statusContextMenu.querySelectorAll('.ctx-status-item').forEach(btn => {
  btn.addEventListener('click', async () => {
    const status = btn.dataset.status;
    statusContextMenu.classList.add('hidden');
    try {
      await fedPut('/api/user/status', { status });
      currentUserStatus = status;
      updateUserDisplay();
    } catch (_) {}
  });
});

document.addEventListener('click', (e) => {
  if (!sidebarUser.contains(e.target) && !statusContextMenu.contains(e.target)) {
    statusContextMenu.classList.add('hidden');
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
