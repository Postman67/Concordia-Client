// ═════════════════════════════════════════════════════════════════════════════
//  Social WebSocket
//  Persistent Socket.io connection to social.concordiachat.com.
//  Handles real-time DM events and friend-request notifications.
// ═════════════════════════════════════════════════════════════════════════════

'use strict';

function connectSocialSocket(jwt) {
  if (socialSocket) { socialSocket.disconnect(); socialSocket = null; }

  socialSocket = window.concordia.createSocket(SOCIAL_URL, jwt);

  socialSocket.on('connect', () => {
    console.log('[social-socket] connected');
  });

  socialSocket.on('connect_error', (err) => {
    console.warn('[social-socket] connection error:', err.message);
  });

  // ─── dm:new ───────────────────────────────────────────────────────────────
  socialSocket.on('dm:new', (msg) => {
    const convId = msg.conversation_id;
    if (!dmMessages[convId]) dmMessages[convId] = [];
    const norm = normalizeDmMsg(msg);
    dmMessages[convId].push(norm);

    if (activeConversationId === convId) {
      appendMessage(norm);
    }

    // Bump conversation preview in sidebar
    const conv = conversations.find(c => c.id === convId);
    if (conv) {
      conv.last_message = {
        id: msg.id,
        content: msg.content,
        sender_id: msg.sender_id,
        sent_at: msg.created_at,
      };
      refreshDmSidebarItem(conv);
    }
  });

  // ─── dm:edited ────────────────────────────────────────────────────────────
  socialSocket.on('dm:edited', (msg) => {
    const convId = msg.conversation_id;
    const cache  = dmMessages[convId];
    if (cache) {
      const m = cache.find(m => m.id === msg.id);
      if (m) { m.content = msg.content; m.is_edited = true; m.edited_at = msg.edited_at; }
    }
    if (activeConversationId === convId) {
      const row = messagesContainer.querySelector(`[data-msg-id="${msg.id}"]`);
      if (row) {
        const contentEl = row.querySelector('.message-content');
        if (contentEl) {
          contentEl.dataset.raw = msg.content;
          contentEl.textContent = msg.content;
          if (!contentEl.querySelector('.message-edited-tag')) {
            const tag = document.createElement('span');
            tag.className = 'message-edited-tag';
            tag.textContent = ' (edited)';
            contentEl.appendChild(tag);
          }
        }
      }
    }
  });

  // ─── dm:deleted ───────────────────────────────────────────────────────────
  socialSocket.on('dm:deleted', ({ message_id, conversation_id }) => {
    if (dmMessages[conversation_id]) {
      dmMessages[conversation_id] = dmMessages[conversation_id].filter(m => m.id !== message_id);
    }
    if (activeConversationId === conversation_id) {
      const row = messagesContainer.querySelector(`[data-msg-id="${message_id}"]`);
      if (row) {
        const block = row.closest('.message');
        row.remove();
        if (block && !block.querySelector('.msg-row')) block.remove();
      }
    }
  });

  // ─── typing:update ────────────────────────────────────────────────────────
  socialSocket.on('typing:update', ({ conversationId, user, isTyping }) => {
    if (!typingUsers[conversationId]) typingUsers[conversationId] = new Map();
    if (isTyping) {
      typingUsers[conversationId].set(String(user.id), user);
    } else {
      typingUsers[conversationId].delete(String(user.id));
    }
    if (activeConversationId === conversationId) renderTypingBar();
  });

  // ─── fr:received ──────────────────────────────────────────────────────────
  socialSocket.on('fr:received', ({ friendship_id, from }) => {
    incomingRequests.push({ friendship_id, sent_at: new Date().toISOString(), from });
    if (onHomePage) updateRequestsBadge();
  });

  // ─── fr:accepted ──────────────────────────────────────────────────────────
  // A DM conversation was auto-created; refresh the sidebar if we're home.
  socialSocket.on('fr:accepted', () => {
    if (onHomePage) loadHomeSidebar();
  });

  // ─── fr:declined ──────────────────────────────────────────────────────────
  socialSocket.on('fr:declined', () => { /* nothing visible to update */ });
}
