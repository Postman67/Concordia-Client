// â”€â”€â”€ Splash + auto-restore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(async () => {
  const splash = document.getElementById('splash-screen');
  const MIN_MS = 1700;
  const t0     = Date.now();

  const savedToken = localStorage.getItem('auth_token');
  const savedUser  = JSON.parse(localStorage.getItem('auth_user') ?? 'null');

  let authed = false;
  if (savedToken && savedUser) {
    await onAuthenticated(savedToken, savedUser);
    authed = !!token; // null if fedGet triggered a 401 logout
  }

  // Ensure animation has enough time to play
  const remaining = MIN_MS - (Date.now() - t0);
  if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

  if (!authed) authScreen.classList.remove('hidden');
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

// Deterministic colour from username string (for avatar backgrounds)
