// ═════════════════════════════════════════════════════════════════════════════
//  Home page — Direct Messages, Friends & Friend Requests
// ═════════════════════════════════════════════════════════════════════════════

'use strict';

// ─── DM message normalisation ─────────────────────────────────────────────
// Social API returns { id, sender_id, content, is_edited, created_at }.
// appendMessage() expects user_id / username / avatar_url fields.
function normalizeDmMsg(msg) {
  const senderId = msg.sender_id;
  const username = msg.username
    ?? (String(senderId) === String(currentUser?.id) ? (userSettings?.display_name || currentUser?.username) : null)
    ?? avatarCache[String(senderId) + ':name']  // seeded below in selectConversation
    ?? 'Unknown';
  const avatarUrl = msg.avatar_url
    ?? avatarCache[String(senderId)]
    ?? null;

  return {
    ...msg,
    user_id: senderId,
    username,
    avatar_url: avatarUrl,
  };
}

// ─── Home sidebar ─────────────────────────────────────────────────────────

async function loadHomeSidebar(restorePanel = false) {
  // Fetch conversations and pending incoming friend requests in parallel
  const [convRes, reqRes] = await Promise.all([
    socialGet('/api/conversations').catch(() => null),
    socialGet('/api/friends/incoming').catch(() => null),
  ]);

  conversations    = convRes?.conversations ?? [];
  incomingRequests = reqRes?.requests       ?? [];

  buildHomeSidebarStructure();

  if (restorePanel) restoreLastHomePanel();
}

function restoreLastHomePanel() {
  const last = localStorage.getItem('last_home_panel') ?? 'friends';
  if (last === 'requests') {
    showRequestsPanel();
  } else if (last.startsWith('conv:')) {
    const convId = parseInt(last.slice(5), 10);
    const conv = conversations.find(c => c.id === convId);
    if (conv) { selectConversation(conv); } else { showFriendsPanel(); }
  } else {
    showFriendsPanel();
  }
}

function buildHomeSidebarStructure() {
  channelList.innerHTML = '';

  // ── Friends button ────────────────────────────────────────────────────────
  const friendsLi = document.createElement('li');
  friendsLi.className = 'home-nav-item';
  friendsLi.id = 'home-nav-friends';
  const friendsBtn = document.createElement('button');
  friendsBtn.className = 'home-nav-btn';
  friendsBtn.innerHTML =
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
       <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05C16.19 13.85 17 15 17 16.5V19h6v-2.5C23 14.17 18.33 13 16 13z"/>
     </svg><span>Friends</span>`;
  friendsBtn.addEventListener('click', showFriendsPanel);
  friendsLi.appendChild(friendsBtn);
  channelList.appendChild(friendsLi);

  // ── Message Requests button ───────────────────────────────────────────────
  const requestsLi = document.createElement('li');
  requestsLi.className = 'home-nav-item';
  requestsLi.id = 'home-nav-requests';
  const requestsBtn = document.createElement('button');
  requestsBtn.className = 'home-nav-btn';
  requestsBtn.innerHTML =
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
       <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
     </svg><span>Message Requests</span><span class="home-nav-badge hidden" id="home-requests-badge">0</span>`;
  requestsBtn.addEventListener('click', showRequestsPanel);
  requestsLi.appendChild(requestsBtn);
  channelList.appendChild(requestsLi);

  // Update badge immediately
  updateRequestsBadge();

  // ── Divider ───────────────────────────────────────────────────────────────
  const divLi = document.createElement('li');
  divLi.className = 'home-nav-divider-item';
  channelList.appendChild(divLi);

  // ── DM section header ─────────────────────────────────────────────────────
  const headerLi = document.createElement('li');
  headerLi.className = 'channel-section-label home-dm-header';
  headerLi.innerHTML = '<span class="channel-section-label-text">Direct Messages</span>';
  channelList.appendChild(headerLi);

  // ── DM conversation items ─────────────────────────────────────────────────
  if (conversations.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'home-dm-empty';
    emptyLi.textContent = 'No conversations yet';
    channelList.appendChild(emptyLi);
  } else {
    conversations.forEach(conv => {
      channelList.appendChild(buildDmItem(conv));
    });
  }
}

function buildDmItem(conv) {
  const partner = conv.with;
  const name    = partner?.display_name || partner?.username || 'Unknown';
  const preview = conv.last_message?.content
    ? truncate(conv.last_message.content, 40)
    : '';

  const li = document.createElement('li');
  li.className = 'home-dm-item';
  li.dataset.convId = String(conv.id);

  if (activeConversationId === conv.id) li.classList.add('active');

  // Avatar
  const avatarEl = document.createElement('div');
  avatarEl.className = 'dm-item-avatar';
  const avatarUrl = partner?.avatar_url ?? avatarCache[String(partner?.id)] ?? '';
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = name.slice(0, 2);
    img.addEventListener('error', () => {
      img.remove();
      avatarEl.style.background = stringToColor(name);
      avatarEl.textContent = name.slice(0, 2).toUpperCase();
    });
    avatarEl.appendChild(img);
  } else {
    avatarEl.style.background = stringToColor(name);
    avatarEl.textContent = name.slice(0, 2).toUpperCase();
  }

  const text = document.createElement('div');
  text.className = 'dm-item-text';

  const nameEl = document.createElement('div');
  nameEl.className = 'dm-item-name';
  nameEl.textContent = name;

  const previewEl = document.createElement('div');
  previewEl.className = 'dm-item-preview';
  previewEl.textContent = preview;

  text.appendChild(nameEl);
  text.appendChild(previewEl);
  li.appendChild(avatarEl);
  li.appendChild(text);

  li.addEventListener('click', () => selectConversation(conv));
  return li;
}

function refreshDmSidebarItem(conv) {
  const existing = channelList.querySelector(`[data-conv-id="${conv.id}"]`);
  if (!existing) return;
  const fresh = buildDmItem(conv);
  existing.replaceWith(fresh);
}

function updateRequestsBadge() {
  const badge = document.getElementById('home-requests-badge');
  if (!badge) return;
  const count = incomingRequests.length;
  if (count > 0) {
    badge.textContent = String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ─── Select a DM conversation ─────────────────────────────────────────────

async function selectConversation(conv) {
  localStorage.setItem('last_home_panel', 'conv:' + conv.id);
  // Deactivate sidebar item for previous conversation
  if (activeConversationId) {
    socialSocket?.emit('dm:leave', activeConversationId);
    const prev = channelList.querySelector(`[data-conv-id="${activeConversationId}"]`);
    if (prev) prev.classList.remove('active');
  }

  // Update state
  activeConversationId = conv.id;
  activeChannelId = null;      // not a server channel
  myPermissions   = null;       // no server permissions in DMs
  activeConvData  = conv;

  // Activate new sidebar item
  const li = channelList.querySelector(`[data-conv-id="${conv.id}"]`);
  if (li) li.classList.add('active');

  // Seed avatar/name caches for the partner so normalizeDmMsg can resolve them
  const partner = conv.with;
  if (partner?.id) {
    const partnerId = String(partner.id);
    if (partner.avatar_url) avatarCache[partnerId] = partner.avatar_url;
    avatarCache[partnerId + ':name'] = partner.display_name || partner.username || 'Unknown';
  }

  // Join the DM room on the social socket
  socialSocket?.emit('dm:join', conv.id);

  // Show channel-view, hide placeholder panels
  noChannelPlaceholder.classList.add('hidden');
  homeFriendsPanel.classList.add('hidden');
  homeRequestsPanel.classList.add('hidden');
  channelView.classList.remove('hidden');

  // Configure the channel header for DM mode (no '#' prefix)
  const partnerName = partner?.display_name || partner?.username || 'Unknown';
  channelNameLabel.textContent = partnerName;
  channelNameLabel.dataset.dm = 'true';

  // Hide members pane in DM mode
  btnToggleMembers.classList.add('hidden');
  membersPane.classList.add('hidden');

  // Update message-input placeholder
  messageInput.placeholder = `Message ${partnerName}`;

  // Load history (use cache if already loaded)
  if (!dmMessages[conv.id]) dmMessages[conv.id] = [];

  try {
    const histRes = await socialGet(`/api/conversations/${conv.id}/messages?limit=50`);
    const msgs = histRes?.messages ?? [];
    dmMessages[conv.id] = msgs.map(normalizeDmMsg);
    renderDmMessages(conv.id);
    scrollToBottom();
    btnLoadMore.style.display = msgs.length < 50 ? 'none' : '';
  } catch (err) {
    console.error('[DM history]', err.message);
  }
}

function renderDmMessages(convId) {
  messagesContainer.innerHTML = '';
  lastMsgMeta = null;
  const msgs = dmMessages[convId] ?? [];
  msgs.forEach(msg => appendMessage(msg, false));
}

// ─── Load more (history scroll-up) ───────────────────────────────────────
// This listener augments the one already in messages.js.
// We intercept when DM mode is active; for server channels the existing handler runs.
document.addEventListener('_dmLoadMore', async () => {
  if (!activeConversationId) return;
  const msgs   = dmMessages[activeConversationId];
  const oldest = msgs?.length ? msgs[0].created_at : null;
  if (!oldest) return;

  const list = document.getElementById('message-list');
  const prevHeight = list.scrollHeight;
  try {
    const res = await socialGet(
      `/api/conversations/${activeConversationId}/messages?limit=50&before=${encodeURIComponent(oldest)}`
    );
    const older = (res?.messages ?? []).map(normalizeDmMsg);
    dmMessages[activeConversationId] = [...older, ...dmMessages[activeConversationId]];
    renderDmMessages(activeConversationId);
    list.scrollTop = list.scrollHeight - prevHeight;
    btnLoadMore.style.display = older.length < 50 ? 'none' : '';
  } catch (err) {
    console.error('[DM load-more]', err.message);
  }
});

// ─── Friends panel ────────────────────────────────────────────────────────

function _setActiveHomeNav(activeId) {
  document.querySelectorAll('.home-nav-btn').forEach(b =>
    b.closest('li')?.classList.toggle('active', b.closest('li')?.id === activeId)
  );
}

async function showFriendsPanel() {
  localStorage.setItem('last_home_panel', 'friends');
  // Collapse channel-view and other panels
  channelView.classList.add('hidden');
  homeRequestsPanel.classList.add('hidden');
  noChannelPlaceholder.classList.remove('hidden');
  placeholderDefault.classList.add('hidden');
  placeholderHome.classList.add('hidden');
  homeFriendsPanel.classList.remove('hidden');
  homeRequestsPanel.classList.add('hidden');

  _setActiveHomeNav('home-nav-friends');

  homeFriendsPanel.innerHTML = '<p class="home-panel-loading">Loading friends\u2026</p>';

  try {
    const res = await socialGet('/api/friends');
    const friends = res?.friends ?? [];

    homeFriendsPanel.innerHTML = '';

    // ── Header row (title + Add Friend button) ────────────────────────────
    const headerRow = document.createElement('div');
    headerRow.className = 'home-panel-header-row';

    const heading = document.createElement('div');
    heading.className = 'home-panel-heading';
    heading.textContent = `Friends — ${friends.length}`;

    const addFriendBtn = document.createElement('button');
    addFriendBtn.className = 'btn-primary btn-sm';
    addFriendBtn.textContent = 'Add Friend';
    addFriendBtn.addEventListener('click', () => toggleAddFriendBar(homeFriendsPanel, addFriendBtn));

    headerRow.appendChild(heading);
    headerRow.appendChild(addFriendBtn);
    homeFriendsPanel.appendChild(headerRow);

    if (friends.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'home-panel-empty';
      empty.textContent = 'No friends yet.';
      homeFriendsPanel.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'home-panel-list';

    friends.forEach(({ friendship_id, user }) => {
      const name = user.display_name || user.username;
      const li = document.createElement('li');
      li.className = 'home-friend-row';

      const av = document.createElement('div');
      av.className = 'dm-item-avatar';
      const url = user.avatar_url ?? avatarCache[String(user.id)] ?? '';
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = name.slice(0, 2);
        img.addEventListener('error', () => { img.remove(); av.textContent = name.slice(0, 2).toUpperCase(); av.style.background = stringToColor(name); });
        av.appendChild(img);
      } else {
        av.textContent = name.slice(0, 2).toUpperCase();
        av.style.background = stringToColor(name);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'home-friend-name';
      nameEl.textContent = name;

      const msgBtn = document.createElement('button');
      msgBtn.className = 'btn-secondary btn-sm home-friend-action';
      msgBtn.textContent = 'Message';
      msgBtn.addEventListener('click', async () => {
        try {
          const data  = await socialPost('/api/conversations', { user_id: user.id });
          const conv  = data.conversation;
          // Ensure conversations list has this entry
          const exist = conversations.find(c => c.id === conv.id);
          if (!exist) {
            conv.with = conv.with ?? user;
            conversations.unshift(conv);
          }
          selectConversation(exist ?? conv);
        } catch (err) {
          console.error('[open DM]', err.message);
        }
      });

      li.appendChild(av);
      li.appendChild(nameEl);
      li.appendChild(msgBtn);
      list.appendChild(li);
    });

    homeFriendsPanel.appendChild(list);
  } catch (err) {
    homeFriendsPanel.innerHTML = `<p class="home-panel-empty" style="color:var(--red)">${err.message}</p>`;
  }
}

// ─── Message Requests panel ───────────────────────────────────────────────

async function showRequestsPanel() {
  localStorage.setItem('last_home_panel', 'requests');
  channelView.classList.add('hidden');
  homeFriendsPanel.classList.add('hidden');
  noChannelPlaceholder.classList.remove('hidden');
  placeholderDefault.classList.add('hidden');
  placeholderHome.classList.add('hidden');
  homeRequestsPanel.classList.remove('hidden');

  _setActiveHomeNav('home-nav-requests');

  renderRequestsPanel();
}

function renderRequestsPanel() {
  homeRequestsPanel.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'home-panel-heading';
  heading.textContent = `Pending Requests — ${incomingRequests.length}`;
  homeRequestsPanel.appendChild(heading);

  if (incomingRequests.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'home-panel-empty';
    empty.textContent = 'No pending friend requests.';
    homeRequestsPanel.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'home-panel-list';

  incomingRequests.forEach(req => {
    const user = req.from;
    const name = user.display_name || user.username;
    const li = document.createElement('li');
    li.className = 'home-friend-row';
    li.dataset.frId = String(req.friendship_id);

    const av = document.createElement('div');
    av.className = 'dm-item-avatar';
    const url = user.avatar_url ?? avatarCache[String(user.id)] ?? '';
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = name.slice(0, 2);
      img.addEventListener('error', () => { img.remove(); av.textContent = name.slice(0, 2).toUpperCase(); av.style.background = stringToColor(name); });
      av.appendChild(img);
    } else {
      av.textContent = name.slice(0, 2).toUpperCase();
      av.style.background = stringToColor(name);
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'home-friend-name';
    nameEl.textContent = name;

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'btn-primary btn-sm home-friend-action';
    acceptBtn.textContent = 'Accept';
    acceptBtn.addEventListener('click', async () => {
      try {
        await socialPatch(`/api/friends/requests/${req.friendship_id}`, { action: 'accept' });
        incomingRequests = incomingRequests.filter(r => r.friendship_id !== req.friendship_id);
        updateRequestsBadge();
        renderRequestsPanel();
        // Refresh sidebar so new DM conversation appears
        loadHomeSidebar();
      } catch (err) {
        console.error('[accept request]', err.message);
      }
    });

    const declineBtn = document.createElement('button');
    declineBtn.className = 'btn-secondary btn-sm home-friend-action';
    declineBtn.textContent = 'Decline';
    declineBtn.addEventListener('click', async () => {
      try {
        await socialPatch(`/api/friends/requests/${req.friendship_id}`, { action: 'decline' });
        incomingRequests = incomingRequests.filter(r => r.friendship_id !== req.friendship_id);
        updateRequestsBadge();
        renderRequestsPanel();
      } catch (err) {
        console.error('[decline request]', err.message);
      }
    });

    li.appendChild(av);
    li.appendChild(nameEl);
    li.appendChild(acceptBtn);
    li.appendChild(declineBtn);
    list.appendChild(li);
  });

  homeRequestsPanel.appendChild(list);
}

// ─── Utility ──────────────────────────────────────────────────────────────
function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// ─── Add Friend bar (inline search + send request) ────────────────────────

let _addFriendSearchTimer = null;

function toggleAddFriendBar(panel, triggerBtn) {
  const existing = panel.querySelector('.add-friend-bar');
  if (existing) {
    existing.remove();
    triggerBtn.textContent = 'Add Friend';
    return;
  }
  triggerBtn.textContent = 'Cancel';

  const bar = document.createElement('div');
  bar.className = 'add-friend-bar';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-friend-input';
  input.placeholder = 'Search by username…';
  input.autocomplete = 'off';

  const results = document.createElement('ul');
  results.className = 'add-friend-results';

  bar.appendChild(input);
  bar.appendChild(results);

  // Insert after the header row
  const headerRow = panel.querySelector('.home-panel-header-row');
  headerRow ? headerRow.insertAdjacentElement('afterend', bar) : panel.prepend(bar);

  input.focus();

  input.addEventListener('input', () => {
    clearTimeout(_addFriendSearchTimer);
    const q = input.value.trim();
    if (!q) { results.innerHTML = ''; return; }
    _addFriendSearchTimer = setTimeout(() => runUserSearch(q, results), 350);
  });
}

async function runUserSearch(q, resultsEl) {
  resultsEl.innerHTML = '<li class="add-friend-result-item add-friend-searching">Searching…</li>';
  try {
    const res = await socialGet(`/api/users/search?q=${encodeURIComponent(q)}`);
    const users = res?.users ?? [];
    resultsEl.innerHTML = '';

    if (users.length === 0) {
      const li = document.createElement('li');
      li.className = 'add-friend-result-item add-friend-no-results';
      li.textContent = 'No users found.';
      resultsEl.appendChild(li);
      return;
    }

    users.forEach(user => {
      if (String(user.id) === String(currentUser?.id)) return; // skip self
      const name = user.display_name || user.username;
      const li = document.createElement('li');
      li.className = 'add-friend-result-item';

      const av = document.createElement('div');
      av.className = 'dm-item-avatar';
      const url = user.avatar_url ?? '';
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = name.slice(0, 2);
        img.addEventListener('error', () => { img.remove(); av.textContent = name.slice(0, 2).toUpperCase(); av.style.background = stringToColor(name); });
        av.appendChild(img);
      } else {
        av.textContent = name.slice(0, 2).toUpperCase();
        av.style.background = stringToColor(name);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'home-friend-name';
      nameEl.textContent = name;

      const sendBtn = document.createElement('button');
      sendBtn.className = 'btn-primary btn-sm home-friend-action';
      sendBtn.textContent = 'Add';
      sendBtn.addEventListener('click', async () => {
        sendBtn.disabled = true;
        sendBtn.textContent = '…';
        try {
          await socialPost('/api/friends/requests', { addressee_id: user.id });
          sendBtn.textContent = 'Sent!';
          sendBtn.className = 'btn-secondary btn-sm home-friend-action';
        } catch (err) {
          sendBtn.disabled = false;
          sendBtn.textContent = err.message.includes('409') ? 'Already sent' : 'Error';
          sendBtn.className = 'btn-secondary btn-sm home-friend-action';
        }
      });

      li.appendChild(av);
      li.appendChild(nameEl);
      li.appendChild(sendBtn);
      resultsEl.appendChild(li);
    });
  } catch (err) {
    resultsEl.innerHTML = `<li class="add-friend-result-item add-friend-searching" style="color:var(--red)">${err.message}</li>`;
  }
}
