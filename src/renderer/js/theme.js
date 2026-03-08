// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Theme
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function normalizeTheme(t) {
  if (!t || t === 'dark') return 'concordia';
  if (t === 'light')      return 'mono-light';
  if (t === 'concordia' || t === 'mono-dark' || t === 'mono-light') return t;
  return 'concordia';
}

function applyTheme(nameOrLegacy) {
  const name = normalizeTheme(
    typeof nameOrLegacy === 'boolean'
      ? (nameOrLegacy ? 'mono-light' : 'concordia')
      : nameOrLegacy
  );
  document.body.classList.remove('theme-mono-dark', 'theme-mono-light');
  if (name === 'mono-dark')  document.body.classList.add('theme-mono-dark');
  if (name === 'mono-light') document.body.classList.add('theme-mono-light');
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === name);
  });
  return name;
}

// Init from localStorage until federation settings load
applyTheme(normalizeTheme(localStorage.getItem('theme')));

// Theme swatch click handlers
document.querySelectorAll('.theme-swatch').forEach(btn => {
  btn.addEventListener('click', async () => {
    const applied = applyTheme(btn.dataset.theme);
    localStorage.setItem('theme', applied);
    if (token) {
      try { await fedPut('/api/settings', { theme: applied }); } catch (_) {}
    }
  });
});

// ─── Settings panel nav ───────────────────────────────────────────
const _usNavItems   = document.querySelectorAll('.us-nav-item[data-panel]');
const _usPanelTitle = document.getElementById('us-panel-title');
const _panelTitles  = { profile: 'Profile', appearance: 'Themes', about: 'About' };

function openSettingsPanel(panelName) {
  _usNavItems.forEach(btn => btn.classList.toggle('active', btn.dataset.panel === panelName));
  ['profile', 'appearance', 'about'].forEach(name => {
    document.getElementById(`us-panel-${name}`)?.classList.toggle('hidden', name !== panelName);
  });
  if (_usPanelTitle) _usPanelTitle.textContent = _panelTitles[panelName] ?? panelName;
}

_usNavItems.forEach(btn => btn.addEventListener('click', () => openSettingsPanel(btn.dataset.panel)));

// ─── Settings modal open / close ──────────────────────────────────
btnSettings.addEventListener('click', () => {
  if (userSettings) {
    settingsDisplayName.value = userSettings.display_name ?? '';
    settingsAvatarUrl.value   = userSettings.avatar_url   ?? '';
  }
  settingsSaveStatus.textContent = '';
  openSettingsPanel('profile');
  const fedEl = document.getElementById('info-federation-url');
  if (fedEl) fedEl.textContent = FEDERATION_URL;
  settingsOverlay.classList.remove('hidden');
});
btnCloseSettings.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
});

btnSaveSettings.addEventListener('click', async () => {
  settingsSaveStatus.textContent = '';
  const body = {};
  const dn = settingsDisplayName.value.trim();
  const av = settingsAvatarUrl.value.trim();
  if (dn) body.display_name = dn;
  if (av) body.avatar_url   = av;
  body.theme = normalizeTheme(localStorage.getItem('theme'));
  try {
    const { settings } = await fedPut('/api/settings', body);
    userSettings = settings;
    updateUserDisplay();
    settingsSaveStatus.textContent = 'Saved!';
    settingsSaveStatus.style.color = 'var(--primary-text)';
  } catch (err) {
    settingsSaveStatus.textContent = err.message;
    settingsSaveStatus.style.color = 'var(--red)';
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
