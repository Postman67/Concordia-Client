//  Messages
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
  if (activeConversationId) {
    // DM load-more — delegated to home.js via custom event
    document.dispatchEvent(new Event('_dmLoadMore'));
    return;
  }
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

  // Update avatar cache
  const msgAvatarUrl = msg.user?.avatar_url ?? msg.avatar_url ?? null;
  if (msgAvatarUrl) {
    avatarCache[String(userId)] = msgAvatarUrl;
  } else if (userId === currentUser?.id && userSettings?.avatar_url) {
    avatarCache[String(userId)] = userSettings.avatar_url;
  }

  const isContinuation =
    lastMsgMeta &&
    lastMsgMeta.userId === userId &&
    (timestamp - lastMsgMeta.timestamp) < GROUP_TIMEOUT_MS;

  lastMsgMeta = { userId, timestamp };

  if (isContinuation) {
    const lastBody = messagesContainer.lastElementChild?.querySelector('.message-body');
    if (lastBody) {
      lastBody.appendChild(buildMsgRow(msg, userId));
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

  const metaEl = document.createElement('div');
  metaEl.className = 'message-meta';
  const authorSpan = document.createElement('span');
  authorSpan.className = 'message-author';
  authorSpan.textContent = username;
  const timeSpan = document.createElement('span');
  timeSpan.className = 'message-time';
  timeSpan.textContent = time;
  metaEl.appendChild(authorSpan);
  metaEl.appendChild(timeSpan);

  bodyEl.appendChild(metaEl);
  bodyEl.appendChild(buildMsgRow(msg, userId));

  el.appendChild(avatarEl);
  el.appendChild(bodyEl);
  messagesContainer.appendChild(el);

  if (doScroll) scrollToBottom();
}

// Builds one .msg-row for a single message (first-in-group and continuations share this)
function buildMsgRow(msg, authorId) {
  const msgId = msg.id;
  const row = document.createElement('div');
  row.className = 'msg-row';
  if (msgId != null) row.dataset.msgId = String(msgId);
  row.dataset.authorId = String(authorId);

  const createdAt = msg.createdAt ?? msg.created_at;
  const hoverTimeEl = document.createElement('span');
  hoverTimeEl.className = 'msg-hover-time';
  hoverTimeEl.textContent = createdAt
    ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  row.appendChild(hoverTimeEl);

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  contentEl.dataset.raw = msg.content ?? '';
  contentEl.textContent = msg.content ?? '';
  if (msg.is_edited) {
    const tag = document.createElement('span');
    tag.className = 'message-edited-tag';
    tag.textContent = ' (edited)';
    contentEl.appendChild(tag);
  }
  row.appendChild(contentEl);

  if (msgId != null) {
    const isOwn     = String(authorId) === String(currentUser?.id);
    const canDelete = isOwn || hasPerm('MANAGE_MESSAGES');

    if (isOwn || canDelete) {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      if (isOwn) {
        const editBtn = document.createElement('button');
        editBtn.className = 'msg-action-btn';
        editBtn.title = 'Edit';
        editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61a.75.75 0 0 1-.35.195l-3.25.75a.75.75 0 0 1-.907-.907l.75-3.25a.75.75 0 0 1 .195-.35l8.612-8.608Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81 3.25 11.311l-.518 2.248 2.25-.518 6.207-6.791Z"/></svg>';
        editBtn.addEventListener('click', () => startMsgEdit(row, msgId));
        actions.appendChild(editBtn);
      }

      if (canDelete) {
        const delBtn = document.createElement('button');
        delBtn.className = 'msg-action-btn msg-action-delete';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25ZM4.997 6.5a.75.75 0 0 0-1.5.077l.418 6.323A1.75 1.75 0 0 0 5.666 14.5h4.668a1.75 1.75 0 0 0 1.75-1.6l.418-6.323a.75.75 0 0 0-1.498-.077l-.419 6.323a.25.25 0 0 1-.25.177H5.666a.25.25 0 0 1-.25-.177L4.997 6.5Z"/></svg>';
        delBtn.addEventListener('click', (e) => {
          if (e.shiftKey) {
            deleteMsgById(msgId);
          } else {
            showDeleteConfirm(
              'Delete Message',
              'Are you sure you want to delete this message? This cannot be undone.',
              () => deleteMsgById(msgId)
            );
          }
        });
        actions.appendChild(delBtn);
      }

      row.appendChild(actions);
    }
  }

  return row;
}

function startMsgEdit(row, msgId) {
  if (editingMsgId != null) cancelMsgEdit();
  editingMsgId = msgId;

  const contentEl = row.querySelector('.message-content');
  const rawText   = contentEl.dataset.raw ?? '';
  contentEl.style.display = 'none';
  const actions = row.querySelector('.msg-actions');
  if (actions) actions.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'msg-edit-input';
  input.value = rawText;
  row.insertBefore(input, actions ?? null);
  input.focus();
  input.select();

  const hint = document.createElement('span');
  hint.className = 'msg-edit-hint';
  hint.textContent = 'Enter to save \u00B7 Esc to cancel';
  row.appendChild(hint);

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      cancelMsgEdit();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const newContent = input.value.trim();
      if (!newContent) return;
      if (newContent === rawText) { cancelMsgEdit(); return; }
      try {
        let updatedContent = newContent;
        if (activeConversationId) {
          // DM edit via Social API
          const updated = await socialPatch(`/api/messages/${msgId}`, { content: newContent });
          updatedContent = updated.content ?? newContent;
          const cache = dmMessages[activeConversationId];
          if (cache) {
            const m = cache.find(m => m.id === msgId);
            if (m) { m.content = updatedContent; m.is_edited = true; }
          }
        } else {
          const updated = await apiPatch(`/api/messages/${msgId}`, { content: newContent });
          updatedContent = updated.content ?? newContent;
          // Update server channel cache
          for (const arr of Object.values(messages)) {
            const m = arr.find(m => m.id === msgId);
            if (m) { m.content = updatedContent; m.is_edited = true; }
          }
        }
        // Update DOM directly
        contentEl.dataset.raw = updatedContent;
        contentEl.textContent = updatedContent;
        const tag = document.createElement('span');
        tag.className = 'message-edited-tag';
        tag.textContent = ' (edited)';
        contentEl.appendChild(tag);
        contentEl.style.removeProperty('display');
        input.remove();
        hint.remove();
        if (actions) actions.style.removeProperty('display');
        editingMsgId = null;
      } catch (err) {
        hint.textContent = err.message;
        hint.style.color = 'var(--red)';
      }
    }
  });
}

function cancelMsgEdit() {
  if (editingMsgId == null) return;
  const row = messagesContainer.querySelector(`[data-msg-id="${editingMsgId}"]`);
  if (row) {
    row.querySelector('.msg-edit-input')?.remove();
    row.querySelector('.msg-edit-hint')?.remove();
    const contentEl = row.querySelector('.message-content');
    if (contentEl) contentEl.style.removeProperty('display');
    const actions = row.querySelector('.msg-actions');
    if (actions) actions.style.removeProperty('display');
  }
  editingMsgId = null;
}

async function deleteMsgById(msgId) {
  try {
    if (activeConversationId) {
      await socialDelete(`/api/messages/${msgId}`);
      const cache = dmMessages[activeConversationId];
      if (cache) {
        const idx = cache.findIndex(m => m.id === msgId);
        if (idx !== -1) cache.splice(idx, 1);
      }
    } else {
      await apiDelete(`/api/messages/${msgId}`);
      // Remove from local cache — socket broadcast handles other clients
      for (const arr of Object.values(messages)) {
        const idx = arr.findIndex(m => m.id === msgId);
        if (idx !== -1) { arr.splice(idx, 1); break; }
      }
    }
    const row = messagesContainer.querySelector(`[data-msg-id="${msgId}"]`);
    if (row) {
      const messageBlock = row.closest('.message');
      row.remove();
      // If the block has no more msg-rows, remove the whole block
      if (messageBlock && !messageBlock.querySelector('.msg-row')) {
        messageBlock.remove();
      }
    }
  } catch (err) {
    console.error('[delete msg] failed:', err.message);
  }
}
function scrollToBottom() {
  const list = document.getElementById('message-list');
  list.scrollTop = list.scrollHeight;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Sending messages + typing
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content) return;

  if (activeConversationId) {
    // DM send
    socialSocket?.emit('dm:send', { conversationId: activeConversationId, content });
    messageInput.value = '';
    clearTimeout(typingTimer);
    socialSocket?.emit('typing:stop', activeConversationId);
    return;
  }

  if (!activeChannelId) return;
  socket.emit('message:send', { channelId: activeChannelId, content });
  messageInput.value = '';
  // Stop typing indicator
  clearTimeout(typingTimer);
  socket.emit('typing:stop', activeChannelId);
});

messageInput.addEventListener('input', () => {
  if (activeConversationId) {
    socialSocket?.emit('typing:start', activeConversationId);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      socialSocket?.emit('typing:stop', activeConversationId);
    }, 2000);
    return;
  }
  if (!activeChannelId) return;
  socket.emit('typing:start', activeChannelId);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('typing:stop', activeChannelId);
  }, 2000);
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Typing indicator
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function renderTypingBar() {
  const contextId = activeConversationId ?? activeChannelId;
  if (!contextId) { typingBar.innerHTML = ''; return; }
  const users = [...(typingUsers[contextId]?.values() ?? [])];

  if (!users.length) {
    typingBar.innerHTML = '';
    return;
  }

  // Build the text label first so we can bail out early if nothing changed
  let newText;
  if (users.length === 1) {
    newText = `${users[0].username} is typing\u2026`;
  } else if (users.length === 2) {
    newText = `${users[0].username} and ${users[1].username} are typing\u2026`;
  } else {
    newText = 'Several people are typing\u2026';
  }

  // If the bar is already showing (dots exist), only patch the dynamic parts
  // so the CSS animation on the dots is never interrupted.
  let dotsEl    = typingBar.querySelector('.typing-dots');
  let avatarsEl = typingBar.querySelector('.typing-avatars');
  let textEl    = typingBar.querySelector('.typing-label');

  if (dotsEl && textEl && textEl.textContent === newText) {
    // Nothing visible has changed — leave the DOM entirely alone
    return;
  }

  if (!dotsEl) {
    // First appearance — build the whole bar
    typingBar.innerHTML = '';

    dotsEl = document.createElement('span');
    dotsEl.className = 'typing-dots';
    dotsEl.appendChild(document.createElement('span'));
    dotsEl.appendChild(document.createElement('span'));
    dotsEl.appendChild(document.createElement('span'));
    typingBar.appendChild(dotsEl);

    avatarsEl = document.createElement('span');
    avatarsEl.className = 'typing-avatars';
    typingBar.appendChild(avatarsEl);

    textEl = document.createElement('span');
    textEl.className = 'typing-label';
    typingBar.appendChild(textEl);
  }

  // Update avatars
  avatarsEl.innerHTML = '';
  users.slice(0, 3).forEach(u => {
    const wrap = document.createElement('span');
    wrap.className = 'typing-avatar';
    const url = avatarCache[String(u.id)];
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      wrap.appendChild(img);
    } else {
      wrap.textContent = u.username.slice(0, 2).toUpperCase();
      wrap.style.background = stringToColor(u.username);
    }
    avatarsEl.appendChild(wrap);
  });

  // Update text
  textEl.textContent = newText;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
