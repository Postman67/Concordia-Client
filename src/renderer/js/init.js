// â”€â”€â”€ Splash + auto-restore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(async () => {
  const splash = document.getElementById('splash-screen');
  const MIN_MS = 1700;
  const t0     = Date.now();

  const savedToken = localStorage.getItem('auth_token');
  const savedUser  = JSON.parse(localStorage.getItem('auth_user') ?? 'null');

  let authed = false;
  if (savedToken && savedUser) {
    await onAuthenticated(savedToken, savedUser, { showChatNow: false });
    authed = !!token; // null if fedGet triggered a 401 logout
  }

  // Ensure animation has enough time to play
  const remaining = MIN_MS - (Date.now() - t0);
  if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

  // Reveal the appropriate screen only after the splash minimum time has elapsed,
  // preventing the sidebar/channel list from being visible during the splash.
  if (authed) {
    chatScreen.classList.remove('hidden');
  } else {
    authScreen.classList.remove('hidden');
  }
  splash.classList.add('fade-out');
  splash.addEventListener('transitionend', () => splash.remove(), { once: true });
})();

// Restrict Ctrl/Cmd+A (select all): editable fields use default behaviour;
// anywhere else, select all text in the current message list instead.
document.addEventListener('keydown', (e) => {
  const isSelectAll = (e.ctrlKey || e.metaKey) && e.key === 'a';
  if (!isSelectAll) return;
  const tag = document.activeElement?.tagName;
  const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
  if (isEditable) return; // let the browser handle it normally
  e.preventDefault();
  const list = document.getElementById('message-list');
  if (!list) return;
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(list);
  sel.removeAllRanges();
  sel.addRange(range);
}, true);

// ── Mobile: close drawer when user picks a channel/server/DM ─────────────
// The drawer is CSS-driven by a hidden checkbox. Unchecking it collapses it.
function closeMobileDrawer() {
  const toggle = document.getElementById('mobile-nav-toggle');
  if (toggle) toggle.checked = false;
}

// On mobile web, open the drawer by default so the user starts at the nav.
(function openDrawerOnMobileLoad() {
  const toggle = document.getElementById('mobile-nav-toggle');
  if (toggle && window.matchMedia('(max-width: 480px)').matches) {
    toggle.checked = true;
  }
})();

document.addEventListener('click', (e) => {
  const toggle = document.getElementById('mobile-nav-toggle');
  if (!toggle || !toggle.checked) return; // drawer not open or not in web mode

  const target = e.target;
  // Close on: channel list item, server icon, home icon, DM item
  if (
    target.closest('#channel-list li:not(.channel-section-label):not(.home-nav-divider-item)') ||
    target.closest('.server-icon-btn') ||
    target.closest('.home-icon-btn')
  ) {
    // Small delay so the click handler fires before the panel slides away
    setTimeout(closeMobileDrawer, 80);
  }
}, true);

// Deterministic colour from username string (for avatar backgrounds)
