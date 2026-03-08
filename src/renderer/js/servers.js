//  Server Sidebar
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  // Add-server entry â€” last item in the scrollable list
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Server Context Menu
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

let contextMenuTargetId = null;

function openServerContextMenu(x, y, fedServerId) {
  contextMenuTargetId = fedServerId;
  btnServerName.dataset.open = 'true';
  ctxServerCreateChannel.style.display  = currentUserRole === 'admin' ? '' : 'none';
  ctxServerCreateCategory.style.display = currentUserRole === 'admin' ? '' : 'none';
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

// Wire up the server name button â†’ opens dropdown anchored below the header
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
      { label: 'Name',        value: info.name        ?? 'â€”' },
      { label: 'Description', value: info.description ?? 'â€”' },
      { label: 'Members',     value: info.member_count ?? 'â€”' },
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
      ctxServerSettings.style.display = 'none';
      serverMembers = [];
      membersPaneList.innerHTML = '';
      localStorage.removeItem('last_server_id');
      localStorage.removeItem('last_channel_id');
    }
    renderServerSidebar();
  } catch (err) {
    leaveServerError.textContent = `Could not leave server: ${err.message}`;
    btnConfirmLeaveServer.disabled = false;
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Server Settings
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ctxServerSettings.addEventListener('click', () => {
  closeServerContextMenu();
  openServerSettings();
});

ctxServerCreateChannel.addEventListener('click', () => {
  closeServerContextMenu();
  openCreateChannelModal(null);
});
ctxServerCreateCategory.addEventListener('click', () => {
  closeServerContextMenu();
  openCreateCategoryModal();
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
    // Seed avatar cache from server-supplied avatar_url for every member
    members.forEach(m => {
      if (m.avatar_url) avatarCache[String(m.user_id)] = m.avatar_url;
    });
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

  // No-op if the user clicks the server they're already on
  if (fedServerId === activeServerId) return;

  if (socket) { socket.disconnect(); socket = null; }

  // Reset channel/message state
  activeChannelId = null;
  channels = [];
  messages = {};
  typingUsers = {};
  serverMembers = [];
  serverCategories = [];
  messagesContainer.innerHTML = '';
  channelList.innerHTML = '';
  channelView.classList.add('hidden');
  noChannelPlaceholder.classList.remove('hidden');

  activeServerId  = fedServerId;
  activeServerUrl = buildServerUrl(srv.server_address);
  localStorage.setItem('last_server_id', fedServerId);

  // Resolve which channel to restore: explicit arg > per-server persisted > null
  const channelToRestore = restoreChannelId
    ?? (Number(localStorage.getItem(`last_channel_${fedServerId}`)) || null);

  // Show cached server_name immediately while we wait for the join response
  serverNameLabel.textContent = srv.server_name || 'Channels';
  btnServerName.disabled = false;

  // Reset placeholder to default text before connecting
  noChannelPlaceholder.querySelector('p').textContent = 'Select a channel to start chatting';
  noChannelPlaceholder.querySelector('p').style.color = '';

  renderServerSidebar();
  connectSocket();

  // Notify server this user is a member (idempotent), get back the server name and
  // the caller's effective role in one round-trip.
  try {
    const joinRes = await apiPost('/api/server/join', {});
    const realName = joinRes?.server?.name;
    if (realName) {
      serverNameLabel.textContent = realName;
      if (srv.server_name !== realName) {
        srv.server_name = realName;
        fedPatch(`/api/servers/${fedServerId}`, { server_name: realName }).catch(() => {});
      }
    }
    // join now returns the caller's effective role directly
    if (joinRes?.role) currentUserRole = joinRes.role;
  } catch (_) {}

  // Confirm role via GET /api/server/@me which returns `effective_role` and `avatar_url`.
  // This handles the admin_user_id override case where a user's DB role is
  // "member" but they are the designated admin.
  try {
    const me = await apiGet('/api/server/@me');
    currentUserRole = me?.effective_role ?? me?.role ?? currentUserRole;
    // Server mirrors the Federation avatar â€” seed the cache so messages show our PFP
    if (me?.avatar_url) avatarCache[String(currentUser.id)] = me.avatar_url;
  } catch (_) { /* keep role from join response */ }

  ctxServerSettings.style.display = currentUserRole === 'admin' ? '' : 'none';

  // Load members in background: seed avatar cache and populate member pane
  apiGet('/api/server/members').then(({ members }) => {
    serverMembers = members ?? [];
    serverMembers.forEach(m => {
      if (m.avatar_url) avatarCache[String(m.user_id)] = m.avatar_url;
    });
    renderMembersPane();
  }).catch(() => {});

  await loadChannels(channelToRestore);
}

function buildServerUrl(address) {
  if (/^https?:\/\//.test(address)) return address; // explicit scheme wins
  return `https://${address}`;
}

// â”€â”€â”€ Add server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
