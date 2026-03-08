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

  // Update avatar cache: prefer server-supplied avatar on the message itself,
  // then fall back to what we already have cached.
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

  // Build avatar element safely â€” shows PFP if available, falls back to initials
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Sending messages + typing
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Typing indicator
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function renderTypingBar() {
  if (!activeChannelId) { typingBar.textContent = ''; return; }
  const users = [...(typingUsers[activeChannelId] ?? [])];
  if (users.length === 0) {
    typingBar.textContent = '';
  } else if (users.length === 1) {
    typingBar.textContent = `${users[0]} is typingâ€¦`;
  } else if (users.length === 2) {
    typingBar.textContent = `${users[0]} and ${users[1]} are typingâ€¦`;
  } else {
    typingBar.textContent = 'Several people are typingâ€¦';
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
