'use strict';

// ════════════════════════════════════════════════════════════════════
//  Server Settings — Roles · Members (granular) · Channels
// ════════════════════════════════════════════════════════════════════

// ─── Permission flags (excludes ADMINISTRATOR — admin-only bit 1) ──
const PERM_FLAGS = [
  { key: 'VIEW_CHANNELS',        bit: 2,    label: 'View Channels',       desc: 'See channels in the sidebar.' },
  { key: 'SEND_MESSAGES',        bit: 4,    label: 'Send Messages',        desc: 'Post messages in text channels.' },
  { key: 'READ_MESSAGE_HISTORY', bit: 8,    label: 'Read Message History', desc: 'Read past messages in a channel.' },
  { key: 'MANAGE_MESSAGES',      bit: 16,   label: 'Manage Messages',      desc: "Edit or delete any user's messages." },
  { key: 'MANAGE_CHANNELS',      bit: 32,   label: 'Manage Channels',      desc: 'Create, edit, and delete channels.' },
  { key: 'MANAGE_CATEGORIES',    bit: 64,   label: 'Manage Categories',    desc: 'Create, edit, and delete categories.' },
  { key: 'MANAGE_ROLES',         bit: 128,  label: 'Manage Roles',         desc: 'Create, edit, assign, and delete roles.' },
  { key: 'KICK_MEMBERS',         bit: 256,  label: 'Kick Members',         desc: 'Remove members from this server.' },
  { key: 'BAN_MEMBERS',          bit: 512,  label: 'Ban Members',          desc: 'Permanently ban members.' },
  { key: 'MANAGE_SERVER',        bit: 1024, label: 'Manage Server',        desc: 'Edit server name and description.' },
];

// ─── Module state ──────────────────────────────────────────────────
let ssLocalRoles = [];
let ssSelectedRoleId = null;

// ─── DOM refs ──────────────────────────────────────────────────────
const ssRolesList       = document.getElementById('ss-roles-list');
const ssRoleEditor      = document.getElementById('ss-role-editor');
const ssRoleCreateBtn   = document.getElementById('ss-role-create-btn');
const ssChTree          = document.getElementById('ss-ch-tree');

// Channel / Category settings overlay
const chsOverlay    = document.getElementById('ch-settings-overlay');
const chsTargetName = document.getElementById('chs-target-name');
const chsNavItems   = document.querySelectorAll('.ss-nav-item[data-chs-panel]');
const chsPanelInfo  = document.getElementById('chs-panel-info');
const chsPanelPerms = document.getElementById('chs-panel-perms');
const chsCloseBtn   = document.getElementById('chs-close-btn');

// ─── Tiny helpers ─────────────────────────────────────────────────
function mkEl(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function setSaveStatus(el, msg, isErr) {
  if (!el) return;
  el.textContent = msg;
  el.style.color = isErr ? 'var(--red)' : 'var(--green, #40a02b)';
}

// ════════════════════════════════════════════════════════════════════
//  ROLES PANEL
// ════════════════════════════════════════════════════════════════════

async function loadSSRoles() {
  if (!ssRolesList) return;
  ssRolesList.innerHTML = '<p class="ss-loading" style="padding:0.5rem 0.75rem">Loading…</p>';
  const res = await apiGet('/api/roles');
  if (res.error) {
    ssRolesList.innerHTML = `<p class="ss-error" style="padding:0.5rem 0.75rem">${escapeHtml(res.error)}</p>`;
    return;
  }
  ssLocalRoles = res;
  renderSSRoleList();
}

function renderSSRoleList() {
  ssRolesList.innerHTML = '';
  if (!ssLocalRoles.length) {
    ssRolesList.innerHTML = '<p class="ss-placeholder">No roles yet.</p>';
    return;
  }
  for (const role of ssLocalRoles) {
    const btn = mkEl('button', 'ss-list-item' + (role.id === ssSelectedRoleId ? ' active' : ''));
    const dot = mkEl('span', 'ss-role-dot');
    dot.style.background = role.color || 'var(--subtext0)';
    btn.appendChild(dot);
    const nameSpan = mkEl('span');
    nameSpan.textContent = role.name;
    btn.appendChild(nameSpan);
    btn.addEventListener('click', () => {
      ssSelectedRoleId = role.id;
      renderSSRoleList();
      renderSSRoleEditor(role);
    });
    ssRolesList.appendChild(btn);
  }
}

function renderSSRoleEditor(role) {
  if (!ssRoleEditor) return;
  const isEveryone = role.is_everyone;

  const frag = document.createDocumentFragment();

  // Header
  const header = mkEl('div', 'ss-editor-header');
  const title = mkEl('h3', 'ss-editor-title');
  title.textContent = role.name;
  header.appendChild(title);

  if (!isEveryone) {
    const delBtn = mkEl('button', 'btn-danger btn-sm');
    delBtn.textContent = 'Delete Role';
    delBtn.addEventListener('click', () => {
      showDeleteConfirm(
        'Delete Role',
        `Delete the role "${role.name}"? This cannot be undone.`,
        async () => {
          const r = await apiDelete(`/api/roles/${role.id}`);
          if (r && r.error) { alert(r.error); return; }
          ssLocalRoles = ssLocalRoles.filter(x => x.id !== role.id);
          if (ssSelectedRoleId === role.id) ssSelectedRoleId = null;
          renderSSRoleList();
          ssRoleEditor.innerHTML = '<p class="ss-placeholder">Role deleted. Select another role to edit.</p>';
        }
      );
    });
    header.appendChild(delBtn);
  }
  frag.appendChild(header);

  // Editable fields for non-@everyone roles
  if (!isEveryone) {
    const nameHeading = mkEl('p', 'ss-section-heading');
    nameHeading.textContent = 'ROLE NAME';
    frag.appendChild(nameHeading);

    const nameRow = mkEl('div', 'ss-field-row');
    const nameInput = mkEl('input');
    nameInput.type = 'text';
    nameInput.maxLength = 64;
    nameInput.value = role.name;
    nameInput.placeholder = 'Role name';
    nameRow.appendChild(nameInput);
    frag.appendChild(nameRow);

    const colorHeading = mkEl('p', 'ss-section-heading');
    colorHeading.textContent = 'ROLE COLOR';
    frag.appendChild(colorHeading);

    const colorRow = mkEl('div', 'ss-field-row');
    const colorInput = mkEl('input', 'ss-color-picker');
    colorInput.type = 'color';
    colorInput.value = role.color || '#888888';
    colorRow.appendChild(colorInput);
    frag.appendChild(colorRow);

    // Save bar for name/color
    const identSaveBar = mkEl('div', 'ss-save-bar');
    const identStatus = mkEl('p', 'ss-save-status');
    const identSaveBtn = mkEl('button', 'btn-primary btn-sm');
    identSaveBtn.textContent = 'Save Changes';
    identSaveBtn.addEventListener('click', async () => {
      identSaveBtn.disabled = true;
      const body = { name: nameInput.value.trim(), color: colorInput.value };
      const r = await apiPatch(`/api/roles/${role.id}`, body);
      identSaveBtn.disabled = false;
      if (r && r.error) { setSaveStatus(identStatus, r.error, true); return; }
      role.name = body.name;
      role.color = body.color;
      const idx = ssLocalRoles.findIndex(x => x.id === role.id);
      if (idx !== -1) ssLocalRoles[idx] = { ...ssLocalRoles[idx], ...body };
      renderSSRoleList();
      const titleEl = ssRoleEditor.querySelector('.ss-editor-title');
      if (titleEl) titleEl.textContent = body.name;
      setSaveStatus(identStatus, 'Saved!', false);
    });
    identSaveBar.appendChild(identStatus);
    identSaveBar.appendChild(identSaveBtn);
    frag.appendChild(identSaveBar);
  }

  // Permissions
  const permHeading = mkEl('p', 'ss-section-heading');
  permHeading.textContent = 'PERMISSIONS';
  frag.appendChild(permHeading);

  if (isEveryone) {
    const note = mkEl('p', 'ss-perm-note');
    note.textContent = '@everyone permissions apply to all members by default.';
    frag.appendChild(note);
  }

  let permBits = role.permissions || 0;

  const permContainer = mkEl('div');
  const renderPermToggles = () => {
    permContainer.innerHTML = '';
    for (const flag of PERM_FLAGS) {
      const row = mkEl('div', 'perm-row');
      const info = mkEl('div', 'perm-info');
      const lbl = mkEl('span', 'perm-label'); lbl.textContent = flag.label;
      const desc = mkEl('span', 'perm-desc'); desc.textContent = flag.desc;
      info.appendChild(lbl); info.appendChild(desc);
      row.appendChild(info);

      const isOn = !!(permBits & flag.bit);
      const toggle = mkEl('button', `perm-toggle ${isOn ? 'perm-toggle--on' : 'perm-toggle--off'}`);
      toggle.textContent = isOn ? 'ON' : 'OFF';
      toggle.addEventListener('click', () => {
        permBits ^= flag.bit;
        renderPermToggles();
      });
      row.appendChild(toggle);
      permContainer.appendChild(row);
    }
  };
  renderPermToggles();
  frag.appendChild(permContainer);

  // Permission save bar
  const permSaveBar = mkEl('div', 'ss-save-bar');
  const permStatus = mkEl('p', 'ss-save-status');
  const permSaveBtn = mkEl('button', 'btn-primary btn-sm');
  permSaveBtn.textContent = 'Save Permissions';
  permSaveBtn.addEventListener('click', async () => {
    permSaveBtn.disabled = true;
    const r = await apiPatch(`/api/roles/${role.id}`, { permissions: permBits });
    permSaveBtn.disabled = false;
    if (r && r.error) { setSaveStatus(permStatus, r.error, true); return; }
    const idx = ssLocalRoles.findIndex(x => x.id === role.id);
    if (idx !== -1) ssLocalRoles[idx].permissions = permBits;
    setSaveStatus(permStatus, 'Permissions saved!', false);
  });
  permSaveBar.appendChild(permStatus);
  permSaveBar.appendChild(permSaveBtn);
  frag.appendChild(permSaveBar);

  ssRoleEditor.innerHTML = '';
  ssRoleEditor.appendChild(frag);
}

// Create new role
ssRoleCreateBtn?.addEventListener('click', () => {
  ssSelectedRoleId = '__new__';
  renderSSRoleList();

  if (!ssRoleEditor) return;
  ssRoleEditor.innerHTML = '';

  const header = mkEl('div', 'ss-editor-header');
  const title = mkEl('h3', 'ss-editor-title');
  title.textContent = 'New Role';
  header.appendChild(title);
  ssRoleEditor.appendChild(header);

  const nameHeading = mkEl('p', 'ss-section-heading');
  nameHeading.textContent = 'ROLE NAME';
  ssRoleEditor.appendChild(nameHeading);

  const nameRow = mkEl('div', 'ss-field-row');
  const nameInput = mkEl('input');
  nameInput.type = 'text';
  nameInput.maxLength = 64;
  nameInput.placeholder = 'Role name';
  nameRow.appendChild(nameInput);
  ssRoleEditor.appendChild(nameRow);

  const colorHeading = mkEl('p', 'ss-section-heading');
  colorHeading.textContent = 'ROLE COLOR';
  ssRoleEditor.appendChild(colorHeading);

  const colorRow = mkEl('div', 'ss-field-row');
  const colorInput = mkEl('input', 'ss-color-picker');
  colorInput.type = 'color';
  colorInput.value = '#5865f2';
  colorRow.appendChild(colorInput);
  ssRoleEditor.appendChild(colorRow);

  const saveBar = mkEl('div', 'ss-save-bar');
  const status = mkEl('p', 'ss-save-status');
  const createBtn = mkEl('button', 'btn-primary btn-sm');
  createBtn.textContent = 'Create Role';
  createBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { setSaveStatus(status, 'Name is required.', true); return; }
    createBtn.disabled = true;
    const r = await apiPost('/api/roles', { name, color: colorInput.value, permissions: 0 });
    createBtn.disabled = false;
    if (r && r.error) { setSaveStatus(status, r.error, true); return; }
    ssLocalRoles.push(r);
    ssSelectedRoleId = r.id;
    renderSSRoleList();
    renderSSRoleEditor(r);
  });
  saveBar.appendChild(status);
  saveBar.appendChild(createBtn);
  ssRoleEditor.appendChild(saveBar);
});

// ════════════════════════════════════════════════════════════════════
//  MEMBERS PANEL  (granular — role chips + add dropdown)
// ════════════════════════════════════════════════════════════════════

async function loadSSMembersNew() {
  if (!ssMembersList) return;
  if (ssMembersStatus) ssMembersStatus.textContent = 'Loading…';
  ssMembersList.innerHTML = '';

  const [membersRes, rolesRes] = await Promise.all([
    apiGet('/api/server/members'),
    apiGet('/api/roles'),
  ]);

  if (membersRes.error) {
    if (ssMembersStatus) { ssMembersStatus.textContent = membersRes.error; ssMembersStatus.style.color = 'var(--red)'; }
    return;
  }

  // API returns { members: [...] }
  const members = Array.isArray(membersRes) ? membersRes : (membersRes.members || []);
  ssLocalRoles = Array.isArray(rolesRes) ? rolesRes : [];
  if (ssMembersStatus) ssMembersStatus.textContent = `${members.length} member(s)`;

  for (const m of members) {
    ssMembersList.appendChild(renderSSMemberRow(m, ssLocalRoles));
  }
}

function renderSSMemberRow(m, allRoles) {
  const row = mkEl('div', 'ss-member-row');

  // Avatar
  const av = mkEl('div', 'member-avatar');
  av.style.background = stringToColor(m.username || m.user_id);
  av.textContent = (m.username || '?')[0].toUpperCase();
  row.appendChild(av);

  // Name + roles area
  const infoArea = mkEl('div', 'ss-member-roles-area');

  const nameLine = mkEl('div');
  nameLine.style.display = 'flex';
  nameLine.style.alignItems = 'center';
  const nameSpan = mkEl('span', 'ss-member-name');
  nameSpan.textContent = m.username || m.user_id;
  nameLine.appendChild(nameSpan);
  if (currentUser && String(m.user_id) === String(currentUser.id)) {
    const badge = mkEl('span', 'ss-you-badge');
    badge.textContent = 'You';
    nameLine.appendChild(badge);
  }
  infoArea.appendChild(nameLine);

  // Custom roles only (no @everyone chip)
  const customRoles = Array.isArray(m.roles) ? m.roles.filter(r => !r.is_everyone) : [];
  const chipsWrap = mkEl('div', 'ss-member-role-chips');

  const rebuildChips = (currentRoles) => {
    chipsWrap.innerHTML = '';
    for (const r of currentRoles) {
      const chip = mkEl('span', 'ss-role-chip');
      const dot = mkEl('span', 'ss-chip-dot');
      dot.style.background = r.color || 'var(--subtext0)';
      chip.appendChild(dot);
      const lbl = mkEl('span');
      lbl.textContent = r.name;
      chip.appendChild(lbl);
      const remove = mkEl('span', 'ss-chip-remove');
      remove.textContent = '×';
      remove.title = `Remove ${r.name}`;
      remove.addEventListener('click', async () => {
        const newIds = currentRoles.filter(x => x.id !== r.id).map(x => x.id);
        const res = await apiPut(`/api/roles/members/${m.user_id}`, { role_ids: newIds });
        if (res && res.error) { alert(res.error); return; }
        const idx = currentRoles.findIndex(x => x.id === r.id);
        if (idx !== -1) currentRoles.splice(idx, 1);
        rebuildChips(currentRoles);
        rebuildAddSelect(currentRoles);
      });
      chip.appendChild(remove);
      chipsWrap.appendChild(chip);
    }
  };

  const addSelectWrap = mkEl('div');
  const rebuildAddSelect = (currentRoles) => {
    addSelectWrap.innerHTML = '';
    const assignable = allRoles.filter(r => !r.is_everyone && !currentRoles.find(x => x.id === r.id));
    if (!assignable.length) return;

    const sel = mkEl('select', 'ss-role-add-select');
    const placeholder = mkEl('option');
    placeholder.value = '';
    placeholder.textContent = '+ Add role…';
    sel.appendChild(placeholder);
    for (const r of assignable) {
      const opt = mkEl('option');
      opt.value = r.id;
      opt.textContent = r.name;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', async () => {
      const roleId = sel.value;
      if (!roleId) return;
      const roleObj = allRoles.find(r => r.id === roleId);
      if (!roleObj) return;
      const newIds = [...currentRoles.map(x => x.id), roleId];
      const res = await apiPut(`/api/roles/members/${m.user_id}`, { role_ids: newIds });
      if (res && res.error) { alert(res.error); sel.value = ''; return; }
      currentRoles.push(roleObj);
      rebuildChips(currentRoles);
      rebuildAddSelect(currentRoles);
    });
    addSelectWrap.appendChild(sel);
  };

  rebuildChips(customRoles);
  rebuildAddSelect(customRoles);

  infoArea.appendChild(chipsWrap);
  infoArea.appendChild(addSelectWrap);
  row.appendChild(infoArea);
  return row;
}

// ════════════════════════════════════════════════════════════════════
//  CHANNELS & CATEGORIES PANEL
// ════════════════════════════════════════════════════════════════════

async function loadSSChannels() {
  if (!ssChTree) return;
  ssChTree.innerHTML = '<p class="ss-loading">Loading…</p>';

  const [catsRes, chsRes] = await Promise.all([
    apiGet('/api/categories'),
    apiGet('/api/channels'),
  ]);

  if (catsRes.error || chsRes.error) {
    ssChTree.innerHTML = `<p class="ss-error">${escapeHtml(catsRes.error || chsRes.error)}</p>`;
    return;
  }
  renderSSChannelTree(catsRes, chsRes);
}

function renderSSChannelTree(cats, chs) {
  ssChTree.innerHTML = '';

  // Uncategorised channels
  const uncategorised = chs.filter(c => !c.category_id);
  if (uncategorised.length) {
    const catDiv = mkEl('div', 'ss-tree-category');
    const catHeader = mkEl('div', 'ss-tree-cat-header');
    const catName = mkEl('span', 'ss-tree-cat-name');
    catName.textContent = 'Uncategorised';
    catHeader.appendChild(catName);
    catDiv.appendChild(catHeader);
    for (const ch of uncategorised) {
      catDiv.appendChild(buildChannelRow(ch));
    }
    ssChTree.appendChild(catDiv);
  }

  // Categories and their channels
  for (const cat of cats) {
    const catDiv = mkEl('div', 'ss-tree-category');
    const catHeader = mkEl('div', 'ss-tree-cat-header');
    const catName = mkEl('span', 'ss-tree-cat-name');
    catName.textContent = cat.name;
    catHeader.appendChild(catName);
    catDiv.appendChild(catHeader);

    const catChs = chs.filter(c => c.category_id === cat.id);
    for (const ch of catChs) {
      catDiv.appendChild(buildChannelRow(ch));
    }
    ssChTree.appendChild(catDiv);
  }
}

function buildChannelRow(ch) {
  const row = mkEl('div', 'ss-tree-channel');
  const nameSpan = mkEl('span');
  nameSpan.textContent = `# ${ch.name}`;
  row.appendChild(nameSpan);
  return row;
}

// ════════════════════════════════════════════════════════════════════
//  CHANNEL / CATEGORY SETTINGS OVERLAY  (context-menu → Edit)
// ════════════════════════════════════════════════════════════════════

chsNavItems.forEach(btn => {
  btn.addEventListener('click', () => {
    chsNavItems.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.chsPanel;
    chsPanelInfo.classList.toggle('hidden', target !== 'info');
    chsPanelPerms.classList.toggle('hidden', target !== 'perms');
  });
});

chsCloseBtn?.addEventListener('click', () => chsOverlay.classList.add('hidden'));
chsOverlay?.addEventListener('click', e => { if (e.target === chsOverlay) chsOverlay.classList.add('hidden'); });

async function openChSettings(type, target) {
  if (!chsOverlay) return;
  chsNavItems.forEach(b => b.classList.toggle('active', b.dataset.chsPanel === 'info'));
  chsPanelInfo.classList.remove('hidden');
  chsPanelPerms.classList.add('hidden');
  chsTargetName.textContent = target.name;
  chsPanelInfo.innerHTML = '';
  chsPanelPerms.innerHTML = '<p class="ss-loading">Loading…</p>';
  chsOverlay.classList.remove('hidden');

  if (type === 'channel') renderChsInfoChannel(target);
  else renderChsInfoCategory(target);

  const [overridesRes, rolesRes] = await Promise.all([
    apiGet(type === 'channel' ? `/api/roles/overrides/channel/${target.id}` : `/api/roles/overrides/category/${target.id}`),
    apiGet('/api/roles'),
  ]);
  if (overridesRes.error || rolesRes.error) {
    chsPanelPerms.innerHTML = `<p class="ss-error">${escapeHtml(overridesRes.error || rolesRes.error)}</p>`;
    return;
  }
  ssLocalRoles = rolesRes;
  renderChsPermsPanel(chsPanelPerms, target.id, overridesRes, rolesRes, type);
}

function renderChsInfoChannel(ch) {
  chsPanelInfo.innerHTML = '';
  const title = mkEl('h2', 'ss-panel-title'); title.textContent = 'Name and Description';
  chsPanelInfo.appendChild(title);

  const section = mkEl('div', 'ss-detail-section');

  const nameRow = mkEl('div', 'ss-field-row');
  const nameLbl = mkEl('label'); nameLbl.textContent = 'Name';
  const nameInput = mkEl('input'); nameInput.type = 'text'; nameInput.value = ch.name; nameInput.maxLength = 64;
  nameRow.appendChild(nameLbl); nameRow.appendChild(nameInput);
  section.appendChild(nameRow);

  const descRow = mkEl('div', 'ss-field-row');
  const descLbl = mkEl('label'); descLbl.textContent = 'Description';
  const descInput = mkEl('input'); descInput.type = 'text'; descInput.value = ch.description || ''; descInput.maxLength = 200;
  descRow.appendChild(descLbl); descRow.appendChild(descInput);
  section.appendChild(descRow);

  const saveBar = mkEl('div', 'ss-save-bar');
  const status = mkEl('p', 'ss-save-status');
  const saveBtn = mkEl('button', 'btn-primary btn-sm'); saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const r = await apiPatch(`/api/channels/${ch.id}`, { name: nameInput.value.trim(), description: descInput.value.trim() });
    saveBtn.disabled = false;
    if (r && r.error) { setSaveStatus(status, r.error, true); return; }
    ch.name = nameInput.value.trim();
    chsTargetName.textContent = ch.name;
    const idx = channels.findIndex(c => c.id === ch.id);
    if (idx !== -1) channels[idx] = { ...channels[idx], name: ch.name, description: descInput.value.trim() };
    if (typeof renderChannelList === 'function') renderChannelList();
    if (activeChannelId === ch.id) {
      channelNameLabel.textContent = ch.name;
      messageInput.placeholder = `Message #${ch.name}`;
    }
    setSaveStatus(status, 'Saved!', false);
  });
  saveBar.appendChild(status); saveBar.appendChild(saveBtn);
  section.appendChild(saveBar);
  chsPanelInfo.appendChild(section);
}

function renderChsInfoCategory(cat) {
  chsPanelInfo.innerHTML = '';
  const title = mkEl('h2', 'ss-panel-title'); title.textContent = 'Name';
  chsPanelInfo.appendChild(title);

  const section = mkEl('div', 'ss-detail-section');

  const nameRow = mkEl('div', 'ss-field-row');
  const nameLbl = mkEl('label'); nameLbl.textContent = 'Name';
  const nameInput = mkEl('input'); nameInput.type = 'text'; nameInput.value = cat.name; nameInput.maxLength = 64;
  nameRow.appendChild(nameLbl); nameRow.appendChild(nameInput);
  section.appendChild(nameRow);

  const saveBar = mkEl('div', 'ss-save-bar');
  const status = mkEl('p', 'ss-save-status');
  const saveBtn = mkEl('button', 'btn-primary btn-sm'); saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const r = await apiPatch(`/api/categories/${cat.id}`, { name: nameInput.value.trim() });
    saveBtn.disabled = false;
    if (r && r.error) { setSaveStatus(status, r.error, true); return; }
    cat.name = nameInput.value.trim();
    chsTargetName.textContent = cat.name;
    if (typeof serverCategories !== 'undefined') {
      const c = serverCategories.find(x => x.id === cat.id); if (c) c.name = cat.name;
    }
    channels = channels.map(c => c.category_id === cat.id ? { ...c, category_name: cat.name } : c);
    if (typeof renderChannelList === 'function') renderChannelList();
    setSaveStatus(status, 'Saved!', false);
  });
  saveBar.appendChild(status); saveBar.appendChild(saveBtn);
  section.appendChild(saveBar);
  chsPanelInfo.appendChild(section);
}

function renderChsPermsPanel(container, targetId, overrides, roles, type) {
  container.innerHTML = '';
  const title = mkEl('h2', 'ss-panel-title'); title.textContent = 'Permissions';
  container.appendChild(title);

  const overrideSection = mkEl('div', 'ss-detail-section');
  const overrideTitle = mkEl('p', 'ss-section-heading'); overrideTitle.textContent = 'PERMISSION OVERRIDES';
  overrideSection.appendChild(overrideTitle);

  const overrideMap = {};
  for (const ov of (Array.isArray(overrides) ? overrides : [])) overrideMap[ov.role_id] = ov;

  const splitDiv = mkEl('div', 'ss-override-split');
  const roleList = mkEl('div', 'ss-override-role-list');
  const editorDiv = mkEl('div', 'ss-override-editor');
  editorDiv.innerHTML = '<p class="ss-placeholder" style="margin-top:1rem">Select a role to edit its overrides.</p>';

  for (const role of roles) {
    const hasOverride = !!overrideMap[role.id];
    const btn = mkEl('button', 'ss-list-item' + (hasOverride ? ' ss-list-item--has-override' : ''));
    const dot = mkEl('span', 'ss-role-dot'); dot.style.background = role.color || 'var(--subtext0)';
    btn.appendChild(dot);
    const span = mkEl('span'); span.textContent = role.name; btn.appendChild(span);
    if (hasOverride) { const badge = mkEl('span', 'ss-override-badge'); badge.textContent = 'set'; btn.appendChild(badge); }
    btn.addEventListener('click', () => {
      roleList.querySelectorAll('.ss-list-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderOverrideEditor(editorDiv, targetId, role, overrideMap, type, () => {
        const ov = overrideMap[role.id];
        const hasBadge = btn.querySelector('.ss-override-badge');
        if (ov && (ov.allow_bits || ov.deny_bits)) {
          if (!hasBadge) { const b = mkEl('span', 'ss-override-badge'); b.textContent = 'set'; btn.appendChild(b); }
          btn.classList.add('ss-list-item--has-override');
        } else {
          if (hasBadge) hasBadge.remove();
          btn.classList.remove('ss-list-item--has-override');
        }
      });
    });
    roleList.appendChild(btn);
  }

  splitDiv.appendChild(roleList);
  splitDiv.appendChild(editorDiv);
  overrideSection.appendChild(splitDiv);
  container.appendChild(overrideSection);
}

// ════════════════════════════════════════════════════════════════════
//  SHARED OVERRIDE EDITOR  (3-state: deny / inherit / allow)
// ════════════════════════════════════════════════════════════════════

function renderOverrideEditor(container, targetId, role, overrideMap, type, onSaved) {
  container.innerHTML = '';

  const existing = overrideMap[role.id] || { allow_bits: 0, deny_bits: 0 };
  // Working copies so user can cancel
  let allowBits = existing.allow_bits || 0;
  let denyBits  = existing.deny_bits  || 0;

  const title = mkEl('p', 'ss-section-heading');
  title.style.marginTop = '0';
  title.textContent = role.name;
  container.appendChild(title);

  const permContainer = mkEl('div');
  const renderRows = () => {
    permContainer.innerHTML = '';
    for (const flag of PERM_FLAGS) {
      const row = mkEl('div', 'perm-row');
      const info = mkEl('div', 'perm-info');
      const lbl = mkEl('span', 'perm-label'); lbl.textContent = flag.label;
      const desc = mkEl('span', 'perm-desc'); desc.textContent = flag.desc;
      info.appendChild(lbl); info.appendChild(desc);
      row.appendChild(info);

      const tristate = mkEl('div', 'perm-tristate');

      const isDeny    = !!(denyBits  & flag.bit);
      const isAllow   = !!(allowBits & flag.bit);
      const isInherit = !isDeny && !isAllow;

      const denyBtn    = mkEl('button', 'perm-state-btn perm-state--deny'    + (isDeny    ? ' active' : ''));
      const inheritBtn = mkEl('button', 'perm-state-btn perm-state--inherit' + (isInherit ? ' active' : ''));
      const allowBtn   = mkEl('button', 'perm-state-btn perm-state--allow'   + (isAllow   ? ' active' : ''));

      denyBtn.textContent    = '✕';
      inheritBtn.textContent = '—';
      allowBtn.textContent   = '✓';
      denyBtn.title    = 'Deny';
      inheritBtn.title = 'Inherit (no override)';
      allowBtn.title   = 'Allow';

      denyBtn.addEventListener('click', () => {
        denyBits  |=  flag.bit;
        allowBits &= ~flag.bit;
        renderRows();
      });
      inheritBtn.addEventListener('click', () => {
        denyBits  &= ~flag.bit;
        allowBits &= ~flag.bit;
        renderRows();
      });
      allowBtn.addEventListener('click', () => {
        allowBits |=  flag.bit;
        denyBits  &= ~flag.bit;
        renderRows();
      });

      tristate.appendChild(denyBtn);
      tristate.appendChild(inheritBtn);
      tristate.appendChild(allowBtn);
      row.appendChild(tristate);
      permContainer.appendChild(row);
    }
  };
  renderRows();
  container.appendChild(permContainer);

  // Save/reset bar
  const saveBar = mkEl('div', 'ss-save-bar');
  const status  = mkEl('p', 'ss-save-status');

  const resetBtn = mkEl('button', 'btn-secondary btn-sm');
  resetBtn.textContent = 'Reset to Inherit';
  resetBtn.addEventListener('click', async () => {
    resetBtn.disabled = true;
    const endpoint = type === 'channel'
      ? `/api/roles/overrides/channel/${targetId}/${role.id}`
      : `/api/roles/overrides/category/${targetId}/${role.id}`;
    const r = await apiDelete(endpoint);
    resetBtn.disabled = false;
    if (r && r.error) { setSaveStatus(status, r.error, true); return; }
    allowBits = 0; denyBits = 0;
    delete overrideMap[role.id];
    renderRows();
    setSaveStatus(status, 'Reset to inherit.', false);
    if (onSaved) onSaved();
    if (typeof fetchMyPermissions === 'function') fetchMyPermissions();
  });

  const saveBtn = mkEl('button', 'btn-primary btn-sm');
  saveBtn.textContent = 'Save Overrides';
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const endpoint = type === 'channel'
      ? `/api/roles/overrides/channel/${targetId}/${role.id}`
      : `/api/roles/overrides/category/${targetId}/${role.id}`;
    const r = await apiPut(endpoint, { allow_bits: allowBits, deny_bits: denyBits });
    saveBtn.disabled = false;
    if (r && r.error) { setSaveStatus(status, r.error, true); return; }
    overrideMap[role.id] = { role_id: role.id, allow_bits: allowBits, deny_bits: denyBits };
    setSaveStatus(status, 'Overrides saved!', false);
    if (onSaved) onSaved();
    if (typeof fetchMyPermissions === 'function') fetchMyPermissions();
  });

  saveBar.appendChild(status);
  saveBar.appendChild(resetBtn);
  saveBar.appendChild(saveBtn);
  container.appendChild(saveBar);
}

// ════════════════════════════════════════════════════════════════════
//  CDN & MEDIA PANEL
// ════════════════════════════════════════════════════════════════════

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function renderCdnHealth(container, health) {
  if (!container) return;
  if (!health || health.error) {
    container.innerHTML = `<p class="ss-error">${escapeHtml(health?.error || 'Failed to load health info')}</p>`;
    return;
  }
  const pct   = health.disk_usage_percent != null ? health.disk_usage_percent.toFixed(1) : '?';
  const used  = formatBytes(health.media_used_bytes);
  const avail = formatBytes(health.disk_available_bytes);
  container.innerHTML = `
    <div class="ss-cdn-stat-grid">
      <div class="ss-cdn-stat">
        <div class="ss-cdn-stat-label">Disk Used</div>
        <div class="ss-cdn-stat-value">${escapeHtml(pct)}%</div>
      </div>
      <div class="ss-cdn-stat">
        <div class="ss-cdn-stat-label">Media Size</div>
        <div class="ss-cdn-stat-value">${escapeHtml(used)}</div>
      </div>
      <div class="ss-cdn-stat">
        <div class="ss-cdn-stat-label">Available</div>
        <div class="ss-cdn-stat-value">${escapeHtml(avail)}</div>
      </div>
    </div>`;
}

function renderCdnMetrics(container, metrics) {
  if (!container) return;
  if (!metrics || metrics.error) {
    container.innerHTML = `<p class="ss-error">${escapeHtml(metrics?.error || 'Failed to load metrics')}</p>`;
    return;
  }
  const up = metrics.totals?.upload   ?? { count: 0, bytes: 0 };
  const dl = metrics.totals?.download ?? { count: 0, bytes: 0 };
  container.innerHTML = `
    <div class="ss-cdn-stat-grid">
      <div class="ss-cdn-stat">
        <div class="ss-cdn-stat-label">Uploads</div>
        <div class="ss-cdn-stat-value">${escapeHtml(String(up.count))} (${escapeHtml(formatBytes(up.bytes))})</div>
      </div>
      <div class="ss-cdn-stat">
        <div class="ss-cdn-stat-label">Downloads</div>
        <div class="ss-cdn-stat-value">${escapeHtml(String(dl.count))} (${escapeHtml(formatBytes(dl.bytes))})</div>
      </div>
    </div>`;
}

async function loadSSCdn() {
  // Parallel load — any failure is non-fatal
  const [settingsRes, infoRes, healthRes, metricsRes] = await Promise.all([
    apiGet('/api/server/settings').catch(e => ({ _err: e.message })),
    apiGet('/api/server/info').catch(e => ({ _err: e.message })),
    apiGet('/api/cdn/health').catch(e => ({ error: e.message })),
    apiGet('/api/cdn/metrics').catch(e => ({ error: e.message })),
  ]);

  // ── Icon preview ──────────────────────────────────────────────
  const iconPreview     = document.getElementById('ss-cdn-icon-preview');
  const iconPlaceholder = document.getElementById('ss-cdn-icon-placeholder');
  if (iconPreview) {
    const url = infoRes?.icon_url;
    if (url) {
      iconPreview.src = /^https?:\/\//.test(url) ? url : `${activeServerUrl}${url}`;
      iconPreview.style.display = '';
      if (iconPlaceholder) iconPlaceholder.style.display = 'none';
    } else {
      iconPreview.src = '';
      iconPreview.style.display = 'none';
      if (iconPlaceholder) iconPlaceholder.style.display = '';
    }
  }

  // ── Compression level ────────────────────────────────────────
  const compressInput = document.getElementById('ss-cdn-compress-input');
  const compressValue = document.getElementById('ss-cdn-compress-value');
  if (compressInput && settingsRes?.media_compression_level != null) {
    compressInput.value = settingsRes.media_compression_level;
    if (compressValue) compressValue.textContent = settingsRes.media_compression_level;
  }

  // ── Health & Metrics ─────────────────────────────────────────
  renderCdnHealth(document.getElementById('ss-cdn-health'), healthRes);
  renderCdnMetrics(document.getElementById('ss-cdn-metrics'), metricsRes);
}

// ── Icon upload ───────────────────────────────────────────────────
document.getElementById('ss-cdn-icon-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const iconStatus = document.getElementById('ss-cdn-icon-status');
  const formData = new FormData();
  formData.append('icon', file);
  try {
    // Do NOT set Content-Type — the browser must set it (with the multipart boundary)
    const res = await fetch(`${activeServerUrl}/api/upload/icon`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) { setSaveStatus(iconStatus, json.error || 'Upload failed', true); return; }
    if (json.icon_url) updateServerHeaderIcon(json.icon_url);
    setSaveStatus(iconStatus, 'Icon uploaded!', false);
    loadSSCdn();
  } catch (err) {
    setSaveStatus(iconStatus, err.message, true);
  }
  e.target.value = '';
});

// ── Icon delete ───────────────────────────────────────────────────
document.getElementById('ss-cdn-icon-delete-btn')?.addEventListener('click', async () => {
  const iconStatus = document.getElementById('ss-cdn-icon-status');
  try {
    await apiDelete('/api/upload/icon');
    updateServerHeaderIcon(null);
    setSaveStatus(iconStatus, 'Icon removed.', false);
    loadSSCdn();
  } catch (err) {
    setSaveStatus(iconStatus, err.message, true);
  }
});

// ── Compression slider live value ─────────────────────────────────
document.getElementById('ss-cdn-compress-input')?.addEventListener('input', function () {
  const label = document.getElementById('ss-cdn-compress-value');
  if (label) label.textContent = this.value;
});

// ── Compression save ──────────────────────────────────────────────
document.getElementById('ss-cdn-compress-btn')?.addEventListener('click', async () => {
  const input  = document.getElementById('ss-cdn-compress-input');
  const status = document.getElementById('ss-cdn-compress-status');
  const level  = parseInt(input?.value, 10);
  if (isNaN(level) || level < 0 || level > 100) {
    setSaveStatus(status, 'Level must be 0–100', true);
    return;
  }
  try {
    await apiPatch('/api/server/settings', { media_compression_level: level });
    setSaveStatus(status, 'Saved!', false);
  } catch (err) {
    setSaveStatus(status, err.message, true);
  }
});

// ── Bulk optimize ─────────────────────────────────────────────────
document.getElementById('ss-cdn-optimize-btn')?.addEventListener('click', async () => {
  const status = document.getElementById('ss-cdn-optimize-status');
  const btn    = document.getElementById('ss-cdn-optimize-btn');
  btn.disabled = true;
  setSaveStatus(status, 'Running…', false);
  try {
    const r = await apiPost('/api/cdn/optimize', {});
    const saved = r.bytes_saved != null ? ` — ${formatBytes(r.bytes_saved)} saved` : '';
    setSaveStatus(status, `Done! ${r.processed ?? 0} file(s) processed${saved}.`, false);
    loadSSCdn();
  } catch (err) {
    setSaveStatus(status, err.message, true);
  } finally {
    btn.disabled = false;
  }
});
