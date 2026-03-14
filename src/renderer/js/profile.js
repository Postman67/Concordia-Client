// ═════════════════════════════════════════════════════════════════════════════
//  Profile Popup
//  Opens a Discord-style user card when clicking an avatar or username.
// ═════════════════════════════════════════════════════════════════════════════

'use strict';

const profilePopup = document.getElementById('profile-popup');
let _ppOutsideClickListener = null;
let _ppCurrentUserId = null;

function closeProfilePopup() {
  profilePopup.classList.add('hidden');
  _ppCurrentUserId = null;
  if (_ppOutsideClickListener) {
    document.removeEventListener('click', _ppOutsideClickListener, true);
    _ppOutsideClickListener = null;
  }
}

/**
 * Open the profile popup for a given user.
 * @param {string|number} userId  Federation UUID of the user to show.
 * @param {Element}       anchor  DOM element to position the popup relative to.
 * @param {object}        [extra] Optional pre-fetched profile data (e.g. conv.with).
 */
function openProfilePopup(userId, anchor, extra = {}) {
  const uid  = String(userId);
  const isSelf = String(currentUser?.id) === uid;

  // Close any currently open popup first
  closeProfilePopup();
  _ppCurrentUserId = uid;

  // ── Resolve data from all available caches ──────────────────────────────
  const member       = serverMembers.find(m => String(m.user_id) === uid);
  const convPartner  = conversations.find(c => String(c.with?.id) === uid)?.with;

  // Precedence for each field: self-settings > conv partner > extra arg > server member > cache
  const src          = convPartner ?? extra;
  const username     = member?.username
    ?? src.username
    ?? avatarCache[uid + ':name']
    ?? 'Unknown';
  const displayName  = (isSelf ? userSettings?.display_name : null)
    ?? src.display_name
    ?? username;
  const avatarUrl    = (isSelf ? userSettings?.avatar_url : null)
    ?? src.avatar_url
    ?? avatarCache[uid]
    ?? null;
  const bannerUrl    = (isSelf ? userSettings?.banner_url : null)
    ?? src.banner_url
    ?? null;
  const bio          = (isSelf ? userSettings?.bio : null)
    ?? src.bio
    ?? null;
  const profLink     = (isSelf ? userSettings?.profile_link : null)
    ?? src.profile_link
    ?? null;
  const joinedAt     = member?.joined_at ?? null;
  const roles        = member?.roles ?? [];
  const isOwner      = member?.is_owner ?? false;
  const cachedStatus = (isSelf ? currentUserStatus : null)
    ?? memberStatusCache[uid]
    ?? 'offline';

  // ── Banner ───────────────────────────────────────────────────────────────
  const bannerEl = document.getElementById('pp-banner');
  bannerEl.innerHTML = '';
  if (bannerUrl && /^https?:\/\//.test(bannerUrl)) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = bannerUrl;
    img.addEventListener('error', () => img.remove());
    bannerEl.appendChild(img);
    bannerEl.classList.remove('pp-banner-default');
  } else {
    bannerEl.classList.add('pp-banner-default');
  }

  // ── Avatar ───────────────────────────────────────────────────────────────
  const avatarEl = document.getElementById('pp-avatar');
  avatarEl.innerHTML = '';
  avatarEl.style.background = '';
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = '';
    img.addEventListener('error', () => {
      img.remove();
      avatarEl.textContent = username.slice(0, 2).toUpperCase();
      avatarEl.style.background = stringToColor(username);
    });
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = username.slice(0, 2).toUpperCase();
    avatarEl.style.background = stringToColor(username);
  }

  // ── Status badge ─────────────────────────────────────────────────────────
  const badgeEl = document.getElementById('pp-status-badge');
  badgeEl.innerHTML = '';
  badgeEl.dataset.typing = 'false';
  badgeEl.dataset.status = cachedStatus;

  // ── Names ─────────────────────────────────────────────────────────────────
  document.getElementById('pp-display-name').textContent = displayName;
  const usernameEl = document.getElementById('pp-username');
  if (displayName !== username) {
    usernameEl.textContent = username;
    usernameEl.classList.remove('hidden');
  } else {
    usernameEl.classList.add('hidden');
  }

  // ── Custom status (populated async after status fetch) ───────────────────
  const customStatusEl = document.getElementById('pp-custom-status');
  customStatusEl.textContent = '';
  customStatusEl.classList.add('hidden');

  // ── Bio ──────────────────────────────────────────────────────────────────
  const bioSection = document.getElementById('pp-bio-section');
  if (bio) {
    document.getElementById('pp-bio').textContent = bio;
    bioSection.classList.remove('hidden');
  } else {
    bioSection.classList.add('hidden');
  }

  // ── Member since ─────────────────────────────────────────────────────────
  const memberSinceSection = document.getElementById('pp-member-since-section');
  if (joinedAt) {
    document.getElementById('pp-member-since').textContent =
      new Date(joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    memberSinceSection.classList.remove('hidden');
  } else {
    memberSinceSection.classList.add('hidden');
  }

  // ── Roles ─────────────────────────────────────────────────────────────────
  const rolesSection   = document.getElementById('pp-roles-section');
  const rolesContainer = document.getElementById('pp-roles');
  rolesContainer.innerHTML = '';
  const visibleRoles = roles.filter(r => !r.is_everyone);
  if (isOwner || visibleRoles.length) {
    if (isOwner) {
      const pill = document.createElement('span');
      pill.className = 'pp-role-pill';
      pill.textContent = 'Owner';
      pill.style.cssText = 'border-color:#faa61a;color:#faa61a';
      rolesContainer.appendChild(pill);
    }
    visibleRoles.forEach(r => {
      const pill = document.createElement('span');
      pill.className = 'pp-role-pill';
      pill.textContent = r.name;
      if (r.color) pill.style.cssText = `border-color:${r.color};color:${r.color}`;
      rolesContainer.appendChild(pill);
    });
    rolesSection.classList.remove('hidden');
  } else {
    rolesSection.classList.add('hidden');
  }

  // ── Action buttons ────────────────────────────────────────────────────────
  const actionsEl = document.getElementById('pp-actions');
  actionsEl.innerHTML = '';

  if (!isSelf && typeof socialPost === 'function') {
    const msgBtn = document.createElement('button');
    msgBtn.className = 'btn-primary btn-sm pp-action-btn';
    msgBtn.textContent = 'Send Message';
    msgBtn.addEventListener('click', async () => {
      closeProfilePopup();
      try {
        const data = await socialPost('/api/conversations', { user_id: uid });
        const conv  = data.conversation;
        const exist = conversations.find(c => String(c.id) === String(conv.id));
        if (!exist) {
          // Seed with the data we have
          conv.with = conv.with ?? {
            id: uid,
            username,
            display_name: displayName,
            avatar_url: avatarUrl,
          };
          conversations.unshift(conv);
        }
        if (!onHomePage) {
          selectHomePage();
          setTimeout(() => selectConversation(exist ?? conv), 350);
        } else {
          selectConversation(exist ?? conv);
        }
      } catch (err) {
        console.error('[profile → DM]', err.message);
      }
    });
    actionsEl.appendChild(msgBtn);
  }

  if (profLink && /^https?:\/\//.test(profLink)) {
    const link = document.createElement('a');
    link.className = 'btn-secondary btn-sm pp-action-btn';
    link.textContent = 'Profile Link';
    link.href = profLink;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    actionsEl.appendChild(link);
  }

  // ── Position popup ────────────────────────────────────────────────────────
  // Render offscreen first to measure actual height
  profilePopup.style.left  = '-9999px';
  profilePopup.style.top   = '-9999px';
  profilePopup.classList.remove('hidden');

  const PW   = profilePopup.offsetWidth  || 280;
  const PH   = profilePopup.offsetHeight || 380;
  const VW   = window.innerWidth;
  const VH   = window.innerHeight;
  const rect = anchor.getBoundingClientRect();

  // Try left of anchor first; fallback right; clamp to viewport
  let x = rect.left - PW - 8;
  if (x < 8) x = rect.right + 8;
  if (x + PW > VW - 8) x = VW - PW - 8;
  if (x < 8) x = 8;

  let y = rect.top;
  if (y + PH > VH - 8) y = VH - PH - 8;
  if (y < 8) y = 8;

  profilePopup.style.left = `${Math.round(x)}px`;
  profilePopup.style.top  = `${Math.round(y)}px`;

  // ── Async: fetch live status + custom_status ──────────────────────────────
  fedGet(`/api/user/status/${encodeURIComponent(uid)}`).then(r => {
    // Ignore if the popup was closed or switched to a different user
    if (!r || _ppCurrentUserId !== uid) return;
    badgeEl.dataset.status = r.status ?? 'offline';
    if (r.custom_status) {
      customStatusEl.textContent = r.custom_status;
      customStatusEl.classList.remove('hidden');
    }
  }).catch(() => {});

  // ── Close on outside click ────────────────────────────────────────────────
  _ppOutsideClickListener = (e) => {
    if (!profilePopup.contains(e.target)) closeProfilePopup();
  };
  // Defer one tick so the triggering click doesn't immediately close the popup
  setTimeout(() => {
    if (_ppCurrentUserId === uid) {
      document.addEventListener('click', _ppOutsideClickListener, true);
    }
  }, 0);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !profilePopup.classList.contains('hidden')) {
    e.stopPropagation();
    closeProfilePopup();
  }
});
