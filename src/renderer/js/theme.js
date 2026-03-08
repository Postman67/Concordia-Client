// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Theme
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function applyTheme(isLight) {
  document.body.classList.toggle('light', isLight);
  themeToggle.setAttribute('aria-checked', isLight ? 'true' : 'false');
}

// Init from localStorage until federation settings load
applyTheme(localStorage.getItem('theme') === 'light');

themeToggle.addEventListener('click', async () => {
  const isLight = document.body.classList.toggle('light');
  themeToggle.setAttribute('aria-checked', isLight ? 'true' : 'false');
  const newTheme = isLight ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
  if (token) {
    try { await fedPut('/api/settings', { theme: newTheme }); } catch (_) {}
  }
});

// Settings modal open/close
btnSettings.addEventListener('click', () => {
  if (userSettings) {
    settingsDisplayName.value = userSettings.display_name ?? '';
    settingsAvatarUrl.value   = userSettings.avatar_url   ?? '';
  }
  settingsSaveStatus.textContent = '';
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
  body.theme = document.body.classList.contains('light') ? 'light' : 'dark';
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
