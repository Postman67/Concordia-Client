//  Socket.IO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
    if (!typingUsers[channelId]) typingUsers[channelId] = new Map();
    if (isTyping) {
      typingUsers[channelId].set(String(user.id), user);
    } else {
      typingUsers[channelId].delete(String(user.id));
    }
    if (channelId === activeChannelId) renderTypingBar();
  });

  socket.on('error', ({ message }) => {
    console.warn('[socket] server error:', message);
  });

  // â”€â”€ Server-push: server info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('server:updated', ({ name, description, icon_url }) => {
    if (name != null) serverNameLabel.textContent = name;
    if (icon_url !== undefined) updateServerHeaderIcon(icon_url);
    // description is shown in the info overlay but doesn't need a live DOM update
  });

  // â”€â”€ Server-push: channels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('channel:created', (ch) => {
    // Guard against double-add when the creator already pushed the channel locally
    if (!channels.find((c) => c.id === ch.id)) {
      channels.push(ch);
      renderChannelList();
    }
  });

  socket.on('channel:updated', (ch) => {
    const idx = channels.findIndex((c) => c.id === ch.id);
    if (idx !== -1) channels[idx] = ch;
    else channels.push(ch);
    renderChannelList();
    // If the renamed/moved channel is currently open, update the header
    if (ch.id === activeChannelId) {
      channelNameLabel.textContent = ch.name;
      messageInput.placeholder = `Message #${ch.name}`;
    }
  });

  socket.on('channel:deleted', ({ id }) => {
    const existed = channels.some((c) => c.id === id);
    channels = channels.filter((c) => c.id !== id);
    if (!existed) return; // already removed locally by the deleter
    if (id === activeChannelId) {
      // Active channel was deleted â€” move to first remaining channel
      activeChannelId = null;
      delete messages[id];
      renderChannelList();
      const next = channels[0];
      if (next) selectChannel(next.id);
      else {
        channelView.classList.add('hidden');
        noChannelPlaceholder.classList.remove('hidden');
      }
    } else {
      renderChannelList();
    }
  });

  socket.on('channels:reordered', (updated) => {
    channels = updated;
    renderChannelList();
  });

  // â”€â”€ Server-push: categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('category:created', (cat) => {
    if (!serverCategories.find(c => c.id === cat.id)) {
      serverCategories.push(cat);
      renderChannelList();
    }
  });

  socket.on('category:updated', ({ id, name, position }) => {
    const cat = serverCategories.find(c => c.id === id);
    if (cat) { if (name != null) cat.name = name; if (position != null) cat.position = position; }
    channels = channels.map((c) => {
      if (c.category_id !== id) return c;
      return { ...c, category_name: name ?? c.category_name, category_position: position ?? c.category_position };
    });
    renderChannelList();
  });

  socket.on('category:deleted', ({ id }) => {
    serverCategories = serverCategories.filter(c => c.id !== id);
    channels = channels.map((c) => {
      if (c.category_id !== id) return c;
      return { ...c, category_id: null, category_name: null, category_position: null };
    });
    renderChannelList();
  });

  socket.on('categories:reordered', (cats) => {
    serverCategories = cats;
    const posMap = new Map(cats.map((cat) => [cat.id, cat.position]));
    channels = channels.map((c) => {
      const newPos = posMap.get(c.category_id);
      return newPos != null ? { ...c, category_position: newPos } : c;
    });
    renderChannelList();
  });

  // â”€â”€ Server-push: members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('member:role_updated', ({ user_id, role }) => {
    if (String(user_id) === String(currentUser.id)) {
      currentUserRole = role;
      // Refresh gated UI elements
      ctxServerSettings.style.display  = role === 'admin' ? '' : 'none';
      renderChannelList(); // admin drag-handles shown/hidden by role
    }
    // Update local members list and re-render pane regardless of whose role changed
    const m = serverMembers.find(m => String(m.user_id) === String(user_id));
    if (m) { m.role = role; renderMembersPane(); }
  });

  // Granular permissions: re-fetch resolved bits when roles or overrides change
  socket.on('member:roles_updated', ({ user_id }) => {
    if (String(user_id) === String(currentUser.id)) {
      fetchMyPermissions().then(() => renderChannelList());
    }
  });

  socket.on('channel:overrides_updated', () => {
    fetchMyPermissions().then(() => renderChannelList());
  });

  socket.on('category:overrides_updated', () => {
    fetchMyPermissions().then(() => renderChannelList());
  });

  // Role CRUD — keep the settings panel in sync
  socket.on('role:created', (role) => {
    if (typeof ssLocalRoles === 'undefined') return;
    if (!ssLocalRoles.find(r => r.id === role.id)) ssLocalRoles.push(role);
    if (!document.getElementById('ss-panel-roles')?.classList.contains('hidden')) renderSSRoleList();
  });

  socket.on('role:updated', (role) => {
    if (typeof ssLocalRoles === 'undefined') return;
    const idx = ssLocalRoles.findIndex(r => r.id === role.id);
    if (idx !== -1) ssLocalRoles[idx] = role;
    if (!document.getElementById('ss-panel-roles')?.classList.contains('hidden')) {
      renderSSRoleList();
      if (typeof ssSelectedRoleId !== 'undefined' && ssSelectedRoleId === role.id) renderSSRoleEditor(role);
    }
  });

  socket.on('role:deleted', ({ id }) => {
    if (typeof ssLocalRoles === 'undefined') return;
    ssLocalRoles = ssLocalRoles.filter(r => r.id !== id);
    if (typeof ssSelectedRoleId !== 'undefined' && ssSelectedRoleId === id) {
      ssSelectedRoleId = null;
      const editor = document.getElementById('ss-role-editor');
      if (editor) editor.innerHTML = '<p class="ss-placeholder">Role was deleted. Select another role to edit.</p>';
    }
    if (!document.getElementById('ss-panel-roles')?.classList.contains('hidden')) renderSSRoleList();
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
