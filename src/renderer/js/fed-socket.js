// ═══════════════════════════════════════════════════════════════════════════
//  Federation WebSocket
//  Handles the persistent Socket.io connection to the Federation server.
//  Events: status_change · settings_sync · server_list_sync ·
//          session_revoked · account_updated · admin_notice · heartbeat_ack
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

function connectFedSocket(jwt) {
  if (fedSocket) {
    fedSocket.disconnect();
    fedSocket = null;
  }

  fedSocket = window.concordia.createSocket(FEDERATION_URL, jwt);

  fedSocket.on('connect', () => {
    console.log('[fed-socket] connected to Federation');
  });

  fedSocket.on('connect_error', (err) => {
    console.warn('[fed-socket] connection error:', err.message);
  });

  // ─── heartbeat_ack ────────────────────────────────────────────────────────
  // Confirms the server received our ping. Log clock skew in dev builds.
  fedSocket.on('heartbeat_ack', ({ server_time }) => {
    const skewMs = Date.now() - new Date(server_time).getTime();
    if (Math.abs(skewMs) > 5000) {
      console.warn(`[fed-socket] clock skew: ${skewMs}ms`);
    }
  });

  // ─── status_change ────────────────────────────────────────────────────────
  // Broadcast to all connected clients when any user's visible status changes.
  // invisible users are always delivered as "offline" to other clients.
  fedSocket.on('status_change', ({ userId, status }) => {
    const id = String(userId);
    memberStatusCache[id] = status;

    // Patch member pane badges live
    membersPaneList.querySelectorAll(`.status-badge[data-member-id]`).forEach(badge => {
      if (badge.dataset.memberId === id) badge.dataset.status = status;
    });

    // Update current user's own badge (their real status when set from another client)
    if (currentUser && id === String(currentUser.id)) {
      currentUserStatus = status;
      currentUserStatusBadge.dataset.status = status;
    }
  });

  // ─── settings_sync ────────────────────────────────────────────────────────
  // Fired when PUT /api/settings succeeds on a different session.
  // Apply the new settings immediately so all open clients stay in sync.
  fedSocket.on('settings_sync', (settings) => {
    userSettings = { ...userSettings, ...settings };

    if (settings.theme) {
      applyTheme(settings.theme);
      localStorage.setItem('theme', normalizeTheme(settings.theme));
    }

    // Keep avatar cache current
    if (settings.avatar_url && currentUser?.id) {
      avatarCache[String(currentUser.id)] = settings.avatar_url;
    }

    updateUserDisplay();
  });

  // ─── server_list_sync ─────────────────────────────────────────────────────
  // Fired after any server list mutation (add / rename / remove / reorder)
  // on another session. Contains the full updated list.
  fedSocket.on('server_list_sync', ({ servers }) => {
    userServers = servers ?? [];
    renderServerSidebar();
    // If the active server was removed, fall back to the first available one
    if (activeServerId && !userServers.find(s => String(s.id) === String(activeServerId))) {
      const first = userServers[0];
      if (first) selectServer(first.id);
      else {
        activeServerId  = null;
        activeServerUrl = null;
        serverNameLabel.textContent = 'Channels';
        channelList.innerHTML = '';
        channelView.classList.add('hidden');
        noChannelPlaceholder.classList.remove('hidden');
      }
    }
  });

  // ─── session_revoked ──────────────────────────────────────────────────────
  // Admin deleted this user's account. Clear all state and return to auth.
  fedSocket.on('session_revoked', ({ reason }) => {
    showAdminNotice(reason ?? 'Your session has been revoked by an administrator.', 'critical');
    // Give the user a moment to read the message before forcing logout
    setTimeout(() => btnLogout.click(), 4000);
  });

  // ─── account_updated ──────────────────────────────────────────────────────
  // Admin edited this user's account. Re-fetch profile to get latest data
  // (avatar_url is not included in the event payload).
  fedSocket.on('account_updated', async ({ user }) => {
    // Apply what we have from the event immediately
    if (user) {
      currentUser = { ...currentUser, ...user };
      localStorage.setItem('auth_user', JSON.stringify(currentUser));
      if (user.display_name !== undefined) {
        userSettings = { ...userSettings, display_name: user.display_name };
      }
      if (user.theme) {
        userSettings = { ...userSettings, theme: user.theme };
        applyTheme(user.theme);
        localStorage.setItem('theme', normalizeTheme(user.theme));
      }
    }
    // Always re-fetch to pick up avatar_url and anything else not in the event
    const meRes = await fedGet('/api/user/me').catch(() => null);
    if (!meRes?.user) { updateUserDisplay(); return; }
    currentUser  = meRes.user;
    localStorage.setItem('auth_user', JSON.stringify(meRes.user));
    userSettings = {
      ...userSettings,
      display_name: meRes.user.display_name,
      avatar_url:   meRes.user.avatar_url,
      theme:        meRes.user.theme,
    };
    if (meRes.user.avatar_url) avatarCache[String(meRes.user.id)] = meRes.user.avatar_url;
    if (meRes.user.theme) {
      applyTheme(meRes.user.theme);
      localStorage.setItem('theme', normalizeTheme(meRes.user.theme));
    }
    updateUserDisplay();
  });

  // ─── admin_notice ─────────────────────────────────────────────────────────
  // Federation-wide broadcast from an admin. Show as an in-app toast.
  fedSocket.on('admin_notice', ({ message, severity }) => {
    showAdminNotice(message, severity ?? 'info');
  });
}

// ─── Admin / system notice toast ──────────────────────────────────────────
const _noticeToast   = document.getElementById('admin-notice-toast');
const _noticeMessage = document.getElementById('admin-notice-message');
const _noticeClose   = document.getElementById('admin-notice-close');
let   _noticeTimer   = null;

_noticeClose.addEventListener('click', () => {
  _noticeToast.classList.add('hidden');
  clearTimeout(_noticeTimer);
});

function showAdminNotice(message, severity = 'info') {
  _noticeMessage.textContent = message;
  _noticeToast.dataset.severity = severity;
  _noticeToast.classList.remove('hidden');

  clearTimeout(_noticeTimer);
  // Critical notices stay until dismissed manually; others auto-hide
  if (severity !== 'critical') {
    const delay = severity === 'warning' ? 12000 : 8000;
    _noticeTimer = setTimeout(() => _noticeToast.classList.add('hidden'), delay);
  }
}
