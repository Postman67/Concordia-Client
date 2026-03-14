//  Channels
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// --- Permission helpers -------------------------------------------------
function hasPerm(key) {
  if (currentUserRole === 'admin') return true;
  if (myPermissions?.is_owner) return true;
  return myPermissions?.resolved?.[key] === true;
}

async function fetchMyPermissions() {
  try {
    myPermissions = await apiGet('/api/roles/@me/permissions');
  } catch (_) {
    myPermissions = null;
  }
}

async function loadChannels(restoreChannelId = null) {
  try {
    const [ch, cats, perms] = await Promise.all([
      apiGet('/api/channels'),
      apiGet('/api/categories').catch(() => []),
      apiGet('/api/roles/@me/permissions').catch(() => null),
    ]);
    channels         = ch;
    serverCategories = cats;
    myPermissions    = perms;
    renderChannelList();
    // Restore last channel if valid, otherwise fall back to first channel
    const target = (restoreChannelId && channels.find(c => c.id === restoreChannelId))
      ? restoreChannelId
      : channels[0]?.id ?? null;
    if (target) selectChannel(target);
  } catch (err) {
    console.error('Failed to load channels:', err);
    showServerError('Unable to connect to server');
  }
}

function showServerError(msg) {
  channelView.classList.add('hidden');
  noChannelPlaceholder.classList.remove('hidden');
  const p = noChannelPlaceholder.querySelector('#placeholder-default p');
  p.textContent = msg;
  p.style.color = 'var(--red)';
}

function renderHomeSidebar() {
  serverNameLabel.textContent = 'Direct Messages';
  btnServerName.disabled = true;
  document.getElementById('server-name-chevron').style.display = 'none';
  channelList.innerHTML = '';
  // Delegate to home.js which builds the live sidebar with real API data.
  // Pass true so the last-visited panel is restored after loading.
  loadHomeSidebar(true);
}

function renderChannelList() {
  channelList.innerHTML = '';
  const isAdmin = currentUserRole === 'admin';

  // Group channels by category, preserving API sort order (category_position, then position)
  const byCategory = new Map(); // category key â†’ { label, categoryId, position, channels[] }
  // Pre-populate with all known categories so empty ones still appear
  serverCategories.forEach(cat => {
    byCategory.set(cat.id, { label: cat.name, categoryId: cat.id, position: cat.position, channels: [] });
  });
  channels.forEach((ch) => {
    const key = ch.category_id ?? '__none__';
    if (!byCategory.has(key)) {
      byCategory.set(key, {
        label:      ch.category_name     ?? null,
        categoryId: ch.category_id       ?? null,
        position:   ch.category_position ?? Infinity,
        channels:   [],
      });
    }
    byCategory.get(key).channels.push(ch);
  });

  // Sort categories by position; uncategorized (null) goes last
  const sorted = [...byCategory.values()].sort((a, b) => a.position - b.position);

  // Helper: insert a drop-line indicator before or after a DOM element
  const showDropLine = (refEl, before) => {
    document.querySelectorAll('.ch-drop-line').forEach(el => el.remove());
    const line = document.createElement('li');
    line.className = 'ch-drop-line';
    channelList.insertBefore(line, before ? refEl : refEl.nextSibling);
  };

  sorted.forEach((group) => {
    if (group.label) {
      const label = document.createElement('li');
      label.className = 'channel-section-label';
      const labelText = document.createElement('span');
      labelText.className = 'channel-section-label-text';
      labelText.textContent = group.label;
      label.appendChild(labelText);
      if (hasPerm('MANAGE_CHANNELS')) {
        const catAddBtn = document.createElement('button');
        catAddBtn.className = 'cat-add-channel-btn';
        catAddBtn.title = 'Create channel in this category';
        catAddBtn.textContent = '+';
        catAddBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openCreateChannelModal(group.categoryId);
        });
        label.appendChild(catAddBtn);
      }

      if (isAdmin && group.categoryId) {
        label.draggable = true;

        label.addEventListener('dragstart', (e) => {
          catDragSrcId = group.categoryId;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(group.categoryId));
          requestAnimationFrame(() => label.classList.add('ch-dragging'));
        });

        label.addEventListener('dragend', () => {
          document.querySelectorAll('.ch-drop-line').forEach(el => el.remove());
          channelList.querySelectorAll('.ch-dragging').forEach(el => el.classList.remove('ch-dragging'));
          catDragSrcId  = null;
          catDropBeforeId = null;
        });

        label.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (catDragSrcId) {
            // Category-over-category: show line above this label
            if (group.categoryId === catDragSrcId) return;
            catDropBeforeId = group.categoryId;
            showDropLine(label, true);
          } else if (chDragSrcId) {
            // Channel dropped onto category header: insert as first channel in this category
            const firstOther = group.channels.find(c => c.id !== chDragSrcId);
            chDropInfo = { toCategoryId: group.categoryId, beforeChannelId: firstOther?.id ?? null };
            showDropLine(label, false);
          }
        });

        label.addEventListener('drop', (e) => {
          e.preventDefault();
          if (catDragSrcId) finalizeCategoryDrop();
          else if (chDragSrcId) finalizeChannelDrop();
        });
      }

      // Right-click: edit/rename (MANAGE_CATEGORIES) / delete (admin)
      if (group.categoryId && (hasPerm('MANAGE_CATEGORIES') || hasPerm('MANAGE_CHANNELS'))) {
        label.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showCatContextMenu(e.clientX, e.clientY, group);
        });
      }

      channelList.appendChild(label);
    }

    group.channels.forEach((ch) => {
      const li = document.createElement('li');
      li.textContent = ch.name;
      li.dataset.id = ch.id;
      if (ch.id === activeChannelId) li.classList.add('active');
      li.addEventListener('click', () => selectChannel(ch.id));

      // Right-click: edit/rename (MANAGE_CHANNELS) / delete (admin)
      if (hasPerm('MANAGE_CHANNELS')) {
        li.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showChContextMenu(e.clientX, e.clientY, ch, group.categoryId);
        });
      }

      if (isAdmin) {
        li.draggable = true;

        li.addEventListener('dragstart', (e) => {
          chDragSrcId = ch.id;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(ch.id));
          requestAnimationFrame(() => li.classList.add('ch-dragging'));
        });

        li.addEventListener('dragend', () => {
          document.querySelectorAll('.ch-drop-line').forEach(el => el.remove());
          channelList.querySelectorAll('.ch-dragging').forEach(el => el.classList.remove('ch-dragging'));
          chDragSrcId = null;
          chDropInfo  = null;
        });

        li.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!chDragSrcId || ch.id === chDragSrcId) return;
          e.dataTransfer.dropEffect = 'move';
          const rect = li.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            // Upper half â†’ insert before this channel
            chDropInfo = { toCategoryId: group.categoryId, beforeChannelId: ch.id };
            showDropLine(li, true);
          } else {
            // Lower half â†’ insert before the next channel in this category (or append)
            const idx  = group.channels.indexOf(ch);
            const next = group.channels.slice(idx + 1).find(c => c.id !== chDragSrcId);
            chDropInfo = { toCategoryId: group.categoryId, beforeChannelId: next?.id ?? null };
            showDropLine(li, false);
          }
        });

        li.addEventListener('drop', (e) => { e.preventDefault(); finalizeChannelDrop(); });
      }

      channelList.appendChild(li);
    });
  });
}

function finalizeCategoryDrop() {
  const srcId  = catDragSrcId;
  const beforeId = catDropBeforeId;
  catDragSrcId   = null;
  catDropBeforeId = null;
  document.querySelectorAll('.ch-drop-line').forEach(el => el.remove());
  channelList.querySelectorAll('.ch-dragging').forEach(el => el.classList.remove('ch-dragging'));
  if (!srcId || srcId === beforeId) return;

  // Re-order categories optimistically
  const sorted = [...serverCategories].sort((a, b) => a.position - b.position);
  const withoutSrc = sorted.filter(c => c.id !== srcId);
  const src = serverCategories.find(c => c.id === srcId);
  if (!src) return;

  const insertIdx = beforeId === null
    ? withoutSrc.length
    : (() => { const i = withoutSrc.findIndex(c => c.id === beforeId); return i === -1 ? withoutSrc.length : i; })();
  withoutSrc.splice(insertIdx, 0, src);
  withoutSrc.forEach((c, i) => { c.position = i; });

  renderChannelList();

  const payload = withoutSrc.map(c => ({ id: c.id, position: c.position }));
  apiPut('/api/categories/reorder', payload)
    .then(updated => { serverCategories = updated; renderChannelList(); })
    .catch(async () => {
      try { serverCategories = await apiGet('/api/categories'); renderChannelList(); } catch (_) {}
    });
}

function finalizeChannelDrop() {
  const srcId = chDragSrcId;
  const drop  = chDropInfo;
  chDragSrcId = null;
  chDropInfo  = null;
  document.querySelectorAll('.ch-drop-line').forEach(el => el.remove());
  channelList.querySelectorAll('.ch-dragging').forEach(el => el.classList.remove('ch-dragging'));
  if (!srcId || !drop) return;

  const srcCh = channels.find(c => c.id === srcId);
  if (!srcCh) return;

  const { toCategoryId, beforeChannelId } = drop;
  const oldCategoryId = srcCh.category_id ?? null;

  // Move src to new category
  srcCh.category_id = toCategoryId;

  // Re-order within toCategoryId: remove src then insert at target index
  let toCatChans = channels
    .filter(c => (c.category_id ?? null) === toCategoryId)
    .sort((a, b) => a.position - b.position)
    .filter(c => c.id !== srcId);

  if (beforeChannelId !== null) {
    const insertIdx = toCatChans.findIndex(c => c.id === beforeChannelId);
    toCatChans.splice(insertIdx === -1 ? toCatChans.length : insertIdx, 0, srcCh);
  } else {
    toCatChans.push(srcCh);
  }
  toCatChans.forEach((c, i) => { c.position = i; });

  // Re-index old category if the channel moved out of it
  if (oldCategoryId !== toCategoryId) {
    channels
      .filter(c => (c.category_id ?? null) === oldCategoryId)
      .sort((a, b) => a.position - b.position)
      .forEach((c, i) => { c.position = i; });
  }

  // Optimistic re-render
  renderChannelList();

  // Persist via API; update local state from server response
  const payload = channels.map(c => ({
    id: c.id,
    category_id: c.category_id ?? null,
    position: c.position,
  }));
  apiPut('/api/channels/reorder', payload)
    .then(updated => { channels = updated; renderChannelList(); })
    .catch(async () => {
      try { channels = await apiGet('/api/channels'); renderChannelList(); } catch (_) {}
    });
}

async function selectChannel(channelId) {
  if (editingMsgId != null) cancelMsgEdit();

  // Leave DM room if switching from a conversation
  if (activeConversationId) {
    socialSocket?.emit('dm:leave', activeConversationId);
    activeConversationId = null;
    activeConvData = null;
  }

  // Restore server-channel UI state that DM mode may have overridden
  delete channelNameLabel.dataset.dm;
  btnToggleMembers.classList.remove('hidden');
  if (membersPaneVisible) membersPane.classList.remove('hidden');

  // Leave previous channel
  if (activeChannelId && activeChannelId !== channelId) {
    socket.emit('channel:leave', activeChannelId);
  }

  activeChannelId = channelId;
  localStorage.setItem('last_channel_id', channelId);
  localStorage.setItem(`last_channel_${activeServerId}`, channelId);

  // Update sidebar highlight
  channelList.querySelectorAll('li').forEach((li) => {
    li.classList.toggle('active', Number(li.dataset.id) === channelId);
  });

  const ch = channels.find((c) => c.id === channelId);
  const chName = ch ? ch.name : String(channelId);
  channelNameLabel.textContent = chName;
  messageInput.placeholder = `Message #${chName}`;

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

// â”€â”€â”€ Create channel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function openCreateChannelModal(categoryId = null) {
  pendingCategoryId = categoryId ?? null;
  channelError.textContent = '';
  newChannelName.value = '';
  newChannelDesc.value = '';
  modalOverlay.classList.remove('hidden');
  newChannelName.focus();
}

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
      ...(pendingCategoryId != null ? { category_id: pendingCategoryId } : {}),
    });
    channels.push(ch);
    renderChannelList();
    modalOverlay.classList.add('hidden');
    selectChannel(ch.id);
  } catch (err) {
    channelError.textContent = err.message;
  }
});

// â”€â”€â”€ Create category â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function openCreateCategoryModal() {
  createCatInput.value = '';
  createCatError.textContent = '';
  createCatModalOverlay.classList.remove('hidden');
  createCatInput.focus();
}

btnCancelCreateCat.addEventListener('click', () => createCatModalOverlay.classList.add('hidden'));
createCatModalOverlay.addEventListener('click', (e) => {
  if (e.target === createCatModalOverlay) createCatModalOverlay.classList.add('hidden');
});
createCatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createCatError.textContent = '';
  const name = createCatInput.value.trim();
  if (!name) return;
  try {
    const cat = await apiPost('/api/categories', { name });
    if (!serverCategories.find(c => c.id === cat.id)) serverCategories.push(cat);
    renderChannelList();
    createCatModalOverlay.classList.add('hidden');
  } catch (err) {
    createCatError.textContent = err.message;
  }
});

// Channel / category settings handled by openChSettings() in server-settings.js

// â”€â”€â”€ Members pane â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getMemberOnlineOfflineCounts() {
  let online = 0, offline = 0;
  serverMembers.forEach(m => {
    const st = memberStatusCache[String(m.user_id)] || 'offline';
    if (st === 'online' || st === 'idle' || st === 'dnd') online++;
    else offline++;
  });
  return { online, offline };
}

function updateMembersPaneHeaderCounts() {
  const el = document.getElementById('members-pane-header-counts');
  if (!el) return;
  const { online, offline } = getMemberOnlineOfflineCounts();
  el.innerHTML = `
    <span class="members-pane-header-count">
      <span class="members-pane-header-dot online"></span>${online}
    </span>
    <span class="members-pane-header-count">
      <span class="members-pane-header-dot offline"></span>${offline}
    </span>`;
}

function renderMembersPane() {
  membersPaneList.innerHTML = '';
  if (!serverMembers.length) return;

  const isOwnerMember = m => m.is_owner === true || m.role === 'admin';
  const isOnline = m => {
    const st = memberStatusCache[String(m.user_id)] || 'offline';
    return st === 'online' || st === 'idle' || st === 'dnd';
  };

  // Groups: Owner (online owners), Online (non-owners online), Offline (everyone offline)
  const ownerOnline   = serverMembers.filter(m =>  isOwnerMember(m) &&  isOnline(m));
  const ownerOffline  = serverMembers.filter(m =>  isOwnerMember(m) && !isOnline(m));
  const memberOnline  = serverMembers.filter(m => !isOwnerMember(m) &&  isOnline(m));
  const memberOffline = serverMembers.filter(m => !isOwnerMember(m) && !isOnline(m));

  const groups = [
    { members: ownerOnline,   label: 'Owner'   },
    { members: memberOnline,  label: 'Online'  },
    { members: [...ownerOffline, ...memberOffline], label: 'Offline' },
  ];

  const buildRow = (m) => {
    const row = document.createElement('div');
    row.className = 'members-pane-row';

    const wrap = document.createElement('div');
    wrap.className = 'avatar-wrap';

    const avatarEl = document.createElement('div');
    avatarEl.className = 'members-pane-avatar';
    const cached = avatarCache[String(m.user_id)];
    if (cached) {
      const img = document.createElement('img');
      img.src = cached;
      img.alt = '';
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = m.username.slice(0, 2).toUpperCase();
      avatarEl.style.background = stringToColor(m.username);
    }

    const badge = document.createElement('span');
    badge.className = 'status-badge';
    badge.dataset.memberId = String(m.user_id);
    badge.dataset.status = memberStatusCache[String(m.user_id)] || 'offline';

    wrap.appendChild(avatarEl);
    wrap.appendChild(badge);

    const nameEl = document.createElement('span');
    nameEl.className = 'members-pane-name';
    nameEl.textContent = m.username;
    if (isOwnerMember(m)) {
      const crown = document.createElement('span');
      crown.className = 'member-owner-crown';
      crown.title = 'Server Owner';
      crown.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M0 8L2 2L5 6L7 0L9 6L12 2L14 8L14 9L0 9Z"/><rect x="0" y="9.5" width="14" height="2" rx="0.5"/></svg>';
      nameEl.appendChild(crown);
    }
    row.appendChild(wrap);
    row.appendChild(nameEl);
    return row;
  };

  groups.forEach(({ members: groupMembers, label }) => {
    if (!groupMembers.length) return;
    const groupLabel = document.createElement('div');
    groupLabel.className = 'members-pane-group-label';
    groupLabel.textContent = `${label} \u2014 ${groupMembers.length}`;
    membersPaneList.appendChild(groupLabel);
    groupMembers.forEach(m => membersPaneList.appendChild(buildRow(m)));
  });

  // Background-fetch statuses for any uncached members, then re-render with correct grouping
  const memberIds = serverMembers.map(m => String(m.user_id));
  const uncached  = memberIds.filter(id => !(id in memberStatusCache));
  if (uncached.length) {
    Promise.allSettled(
      uncached.map(id =>
        fedGet(`/api/user/status/${id}`).then(r => ({ id, status: r.status }))
      )
    ).then(results => {
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          memberStatusCache[r.value.id] = r.value.status;
        }
      });
      renderMembersPane();
    });
  }
  updateMembersPaneHeaderCounts();
}

function updateTypingBadges() {
  // Collect IDs of everyone currently typing in any channel on this server
  const typingIds = new Set();
  if (typeof typingUsers !== 'undefined' && typeof activeChannelId !== 'undefined') {
    for (const map of Object.values(typingUsers)) {
      for (const id of map.keys()) typingIds.add(id);
    }
  }
  membersPaneList.querySelectorAll('.status-badge[data-member-id]').forEach(badge => {
    const isTyping = typingIds.has(badge.dataset.memberId);
    if (isTyping && badge.dataset.typing !== 'true') {
      badge.dataset.typing = 'true';
      badge.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    } else if (!isTyping && badge.dataset.typing === 'true') {
      delete badge.dataset.typing;
      // delay dot removal until the morph-out transition finishes (~200ms)
      setTimeout(() => {
        if (badge.dataset.typing !== 'true') badge.innerHTML = '';
      }, 220);
    }
  });
}

btnToggleMembers.addEventListener('click', () => {
  membersPaneVisible = !membersPaneVisible;
  membersPane.classList.toggle('hidden', !membersPaneVisible);
  btnToggleMembers.classList.toggle('active', membersPaneVisible);
});

// â”€â”€â”€ Channel / category context menus â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function positionAndShowMenu(menu, x, y) {
  menu.classList.remove('hidden');
  const w = menu.offsetWidth  || 170;
  const h = menu.offsetHeight || 100;
  menu.style.left = `${Math.min(x, window.innerWidth  - w - 8)}px`;
  menu.style.top  = `${Math.min(y, window.innerHeight - h - 8)}px`;
}

function showChContextMenu(x, y, ch, categoryId) {
  hideCatContextMenu();
  chContextTarget = { id: ch.id, name: ch.name, description: ch.description ?? '', categoryId };
  const canManage = hasPerm('MANAGE_CHANNELS');
  const isAdmin   = currentUserRole === 'admin';
  ctxChEdit.style.display    = canManage ? '' : 'none';
  ctxChDelete.style.display  = isAdmin   ? '' : 'none';
  ctxChDivider.style.display = isAdmin   ? '' : 'none';
  positionAndShowMenu(chContextMenu, x, y);
}

function hideChContextMenu() {
  chContextMenu.classList.add('hidden');
  chContextTarget = null;
}

function showCatContextMenu(x, y, group) {
  hideChContextMenu();
  catContextTarget = { id: group.categoryId, name: group.label };
  const canManageCh  = hasPerm('MANAGE_CHANNELS');
  const canManageCat = hasPerm('MANAGE_CATEGORIES');
  const isAdmin      = currentUserRole === 'admin';
  ctxCatCreateChannel.style.display = canManageCh  ? '' : 'none';
  ctxCatEdit.style.display          = canManageCat ? '' : 'none';
  ctxCatDelete.style.display        = isAdmin      ? '' : 'none';
  ctxCatDivider.style.display       = isAdmin      ? '' : 'none';
  positionAndShowMenu(catContextMenu, x, y);
}

function hideCatContextMenu() {
  catContextMenu.classList.add('hidden');
  catContextTarget = null;
}

document.addEventListener('click', (e) => {
  if (!chContextMenu.contains(e.target))     hideChContextMenu();
  if (!catContextMenu.contains(e.target))    hideCatContextMenu();
  if (!chlistContextMenu.contains(e.target)) hideChlistContextMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { hideChContextMenu(); hideCatContextMenu(); hideChlistContextMenu(); }
});

ctxChEdit.addEventListener('click', () => {
  const t = chContextTarget;
  hideChContextMenu();
  if (!t) return;
  const ch = channels.find(c => c.id === t.id) ?? t;
  openChSettings('channel', ch);
});

ctxChDelete.addEventListener('click', () => {
  const t = chContextTarget;
  hideChContextMenu();
  if (!t) return;
  showDeleteConfirm(
    'Delete Channel',
    `Delete #${t.name}? This cannot be undone.`,
    async () => {
      await apiDelete(`/api/channels/${t.id}`);
      channels = channels.filter(c => c.id !== t.id);
      if (t.id === activeChannelId) {
        delete messages[t.id];
        activeChannelId = null;
        renderChannelList();
        const next = channels[0];
        if (next) selectChannel(next.id);
        else { channelView.classList.add('hidden'); noChannelPlaceholder.classList.remove('hidden'); }
      } else {
        renderChannelList();
      }
    }
  );
});

ctxCatCreateChannel.addEventListener('click', () => {
  const t = catContextTarget;
  hideCatContextMenu();
  if (t) openCreateChannelModal(t.id);
});

ctxCatEdit.addEventListener('click', () => {
  const t = catContextTarget;
  hideCatContextMenu();
  if (t) openChSettings('category', t);
});

ctxCatDelete.addEventListener('click', () => {
  const t = catContextTarget;
  hideCatContextMenu();
  if (!t) return;
  showDeleteConfirm(
    'Delete Category',
    `Delete category "${t.name}"? Channels inside will become uncategorized.`,
    async () => {
      await apiDelete(`/api/categories/${t.id}`);
      channels = channels.map(c =>
        c.category_id === t.id
          ? { ...c, category_id: null, category_name: null, category_position: null }
          : c
      );
      renderChannelList();
    }
  );
});

// ─── Confirm / delete modal ────────────────────────────────────────────────
let _confirmCallback = null;

function showDeleteConfirm(title, message, onConfirm) {
  confirmModalTitle.textContent = title;
  confirmModalMessage.textContent = message;
  confirmModalError.textContent = '';
  btnOkConfirm.disabled = false;
  confirmModalOverlay.classList.remove('hidden');
  _confirmCallback = onConfirm;
}

btnCancelConfirm.addEventListener('click', () => {
  confirmModalOverlay.classList.add('hidden');
  _confirmCallback = null;
});

btnOkConfirm.addEventListener('click', async () => {
  if (!_confirmCallback) return;
  confirmModalError.textContent = '';
  btnOkConfirm.disabled = true;
  try {
    await _confirmCallback();
    confirmModalOverlay.classList.add('hidden');
    _confirmCallback = null;
  } catch (err) {
    confirmModalError.textContent = err.message;
    btnOkConfirm.disabled = false;
  }
});

let renameTarget = null;

function openRenameModal(type, id, currentName) {
  renameTarget = { type, id };
  renameModalTitle.textContent = type === 'channel' ? 'Rename Channel' : 'Rename Category';
  renameModalInput.value = currentName;
  renameModalError.textContent = '';
  renameModalOverlay.classList.remove('hidden');
  requestAnimationFrame(() => { renameModalInput.select(); renameModalInput.focus(); });
}

renameModalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!renameTarget) return;
  const newName = renameModalInput.value.trim();
  if (!newName) return;
  renameModalError.textContent = '';
  try {
    if (renameTarget.type === 'channel') {
      const updated = await apiPatch(`/api/channels/${renameTarget.id}`, { name: newName });
      const idx = channels.findIndex(c => c.id === renameTarget.id);
      if (idx !== -1) channels[idx] = { ...channels[idx], ...updated };
      renderChannelList();
      if (renameTarget.id === activeChannelId) {
        channelNameLabel.textContent = newName;
        messageInput.placeholder = `Message #${newName}`;
      }
    } else {
      await apiPatch(`/api/categories/${renameTarget.id}`, { name: newName });
      const cat = serverCategories.find(c => c.id === renameTarget.id);
      if (cat) cat.name = newName;
      channels = channels.map(c =>
        c.category_id === renameTarget.id ? { ...c, category_name: newName } : c
      );
      renderChannelList();
    }
    renameModalOverlay.classList.add('hidden');
    renameTarget = null;
  } catch (err) {
    renameModalError.textContent = err.message;
  }
});

btnCancelRename.addEventListener('click', () => {
  renameModalOverlay.classList.add('hidden');
  renameTarget = null;
});
renameModalOverlay.addEventListener('click', (e) => {
  if (e.target === renameModalOverlay) { renameModalOverlay.classList.add('hidden'); renameTarget = null; }
});

// â”€â”€â”€ Channel list empty-space context menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function hideChlistContextMenu() { chlistContextMenu.classList.add('hidden'); }

channelList.addEventListener('contextmenu', (e) => {
  if (!activeServerId) return;
  if (!hasPerm('MANAGE_CHANNELS') && !hasPerm('MANAGE_CATEGORIES')) return;
  e.preventDefault();
  hideChContextMenu(); hideCatContextMenu();
  ctxChlistCreateCategory.style.display = hasPerm('MANAGE_CATEGORIES') ? '' : 'none';
  positionAndShowMenu(chlistContextMenu, e.clientX, e.clientY);
});

ctxChlistCreateChannel.addEventListener('click', () => {
  hideChlistContextMenu();
  openCreateChannelModal(null);
});
ctxChlistCreateCategory.addEventListener('click', () => {
  hideChlistContextMenu();
  openCreateCategoryModal();
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
