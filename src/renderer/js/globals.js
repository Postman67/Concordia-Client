/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Concordia â€“ Renderer app script
   Auth â†’ Federation â†’ Server list â†’ Per-server chat
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

'use strict';

// â”€â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FEDERATION_URL = 'https://federation.concordiachat.com';

// â”€â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let token          = null;
let currentUser    = null;    // { id, username, email }
let userSettings   = null;    // { display_name, avatar_url, theme }
let userServers    = [];      // [{ id, server_address, server_name, position }]
let activeServerId = null;    // federation entry id
let activeServerUrl= null;    // http:// URL for the active server
let socket         = null;
let channels       = [];
let activeChannelId= null;
let messages       = {};      // channelId â†’ [msg, ...]
let typingUsers    = {};      // channelId â†’ Set<username>
let typingTimer    = null;
let lastMsgMeta    = null;    // { userId, timestamp } â€” message grouping
let avatarCache    = {};      // userId â†’ avatarUrl
let currentUserRole = 'member'; // 'member' | 'moderator' | 'admin'
let myPermissions  = null;     // { bits, resolved: { MANAGE_CHANNELS, MANAGE_CATEGORIES, … } }
let idleTimer      = null;
let autoSetIdle    = false;    // true when idle was auto-set by the inactivity timer
let dragSrcId      = null;       // federation server id being dragged
let dragOverTarget = null;       // { id: serverId|null, insertBefore: bool }
let chDragSrcId    = null;       // channel id being dragged
let chDropInfo     = null;       // { toCategoryId: number|null, beforeChannelId: number|null }
let serverMembers    = [];       // [{ user_id, username, is_owner, role?, avatar_url }]
let serverCategories = [];       // [{ id, name, position }] â€” full list incl. empty ones
let chContextTarget  = null;     // { id, name, categoryId } â€“ channel right-click
let catContextTarget = null;     // { id, name }           â€“ category right-click
let membersPaneVisible = true;
let pendingCategoryId  = null;   // pre-selected category for new channel modal
let currentUserStatus  = 'online';
let memberStatusCache  = {};     // userId → status string
let heartbeatInterval  = null;
let fedSocket          = null;   // Federation Socket.io connection

const GROUP_TIMEOUT_MS = 10 * 60 * 1000;

// â”€â”€â”€ DOM refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const authScreen       = document.getElementById('auth-screen');
const chatScreen       = document.getElementById('chat-screen');

// Auth
const tabBtns          = document.querySelectorAll('.tab');
const loginForm        = document.getElementById('login-form');
const registerForm     = document.getElementById('register-form');
const loginError       = document.getElementById('login-error');
const regError         = document.getElementById('reg-error');

// Server sidebar
const serverListIcons  = document.getElementById('server-list-icons');
const serverContextMenu    = document.getElementById('server-context-menu');
const ctxServerInfo        = document.getElementById('ctx-server-info');
const ctxServerSettings    = document.getElementById('ctx-server-settings');
const ctxServerLeave       = document.getElementById('ctx-server-leave');
const serverInfoOverlay    = document.getElementById('server-info-overlay');
const serverInfoName       = document.getElementById('server-info-name');
const serverInfoBody       = document.getElementById('server-info-body');
const btnCloseServerInfo   = document.getElementById('btn-close-server-info');
const leaveServerOverlay   = document.getElementById('leave-server-overlay');
const leaveServerMessage   = document.getElementById('leave-server-message');
const leaveServerError     = document.getElementById('leave-server-error');
const btnCancelLeaveServer = document.getElementById('btn-cancel-leave-server');
const btnConfirmLeaveServer= document.getElementById('btn-confirm-leave-server');

// Channel sidebar
const serverNameLabel  = document.getElementById('server-name-label');
const btnServerName    = document.getElementById('btn-server-name');
const serverHeaderIcon = document.getElementById('server-header-icon');
const channelList      = document.getElementById('channel-list');
const currentUserLabel = document.getElementById('current-user-label');
const currentUserAvatar= document.getElementById('current-user-avatar');
const btnLogout        = document.getElementById('btn-logout');

// Chat pane
const noChannelPlaceholder = document.getElementById('no-channel-placeholder');
const channelView      = document.getElementById('channel-view');
const channelNameLabel   = document.getElementById('channel-name-label');
const btnToggleMembers   = document.getElementById('btn-toggle-members');
const membersPane        = document.getElementById('members-pane');
const membersPaneList    = document.getElementById('members-pane-list');
const chContextMenu      = document.getElementById('ch-context-menu');
const catContextMenu     = document.getElementById('cat-context-menu');
const ctxChEdit          = document.getElementById('ctx-ch-edit');
const ctxChRename        = document.getElementById('ctx-ch-rename');
const ctxChDelete        = document.getElementById('ctx-ch-delete');
const ctxChDivider       = document.getElementById('ctx-ch-divider');
const ctxCatEdit         = document.getElementById('ctx-cat-edit');
const ctxCatRename       = document.getElementById('ctx-cat-rename');
const ctxCatDelete       = document.getElementById('ctx-cat-delete');
const ctxCatDivider      = document.getElementById('ctx-cat-divider');
const renameModalOverlay = document.getElementById('rename-modal-overlay');
const renameModalTitle   = document.getElementById('rename-modal-title');
const renameModalInput   = document.getElementById('rename-modal-input');
const renameModalForm    = document.getElementById('rename-modal-form');
const btnCancelRename    = document.getElementById('btn-cancel-rename');
const renameModalError   = document.getElementById('rename-modal-error');

// Confirm modal
const confirmModalOverlay = document.getElementById('confirm-modal-overlay');
const confirmModalTitle   = document.getElementById('confirm-modal-title');
const confirmModalMessage = document.getElementById('confirm-modal-message');
const confirmModalError   = document.getElementById('confirm-modal-error');
const btnCancelConfirm    = document.getElementById('btn-cancel-confirm');
const btnOkConfirm        = document.getElementById('btn-ok-confirm');

const messagesContainer  = document.getElementById('messages-container');
const btnLoadMore      = document.getElementById('btn-load-more');
const typingBar        = document.getElementById('typing-bar');
const messageForm      = document.getElementById('message-form');
const messageInput     = document.getElementById('message-input');

// Channel modal
const modalOverlay     = document.getElementById('modal-overlay');
const newChannelForm   = document.getElementById('new-channel-form');
const newChannelName   = document.getElementById('new-channel-name');
const newChannelDesc   = document.getElementById('new-channel-desc');
const btnCancelModal   = document.getElementById('btn-cancel-modal');
const channelError     = document.getElementById('channel-error');

// Create channel / category modals + context menus
const chlistContextMenu      = document.getElementById('chlist-context-menu');
const ctxChlistCreateChannel  = document.getElementById('ctx-chlist-create-channel');
const ctxChlistCreateCategory = document.getElementById('ctx-chlist-create-category');
const ctxServerCreateChannel  = document.getElementById('ctx-server-create-channel');
const ctxServerCreateCategory = document.getElementById('ctx-server-create-category');
const ctxCatCreateChannel     = document.getElementById('ctx-cat-create-channel');
const createCatModalOverlay   = document.getElementById('create-cat-modal-overlay');
const createCatForm           = document.getElementById('create-cat-form');
const createCatInput          = document.getElementById('create-cat-input');
const createCatError          = document.getElementById('create-cat-error');
const btnCancelCreateCat      = document.getElementById('btn-cancel-create-cat');

// Add-server modal
const addServerOverlay  = document.getElementById('add-server-overlay');
const addServerForm     = document.getElementById('add-server-form');
const btnCancelAddServer= document.getElementById('btn-cancel-add-server');
const addServerError    = document.getElementById('add-server-error');

// Settings
const settingsOverlay     = document.getElementById('settings-overlay');
const btnSettings         = document.getElementById('btn-settings');
const btnCloseSettings    = document.getElementById('btn-close-settings');
const settingsDisplayName = document.getElementById('settings-display-name');
const settingsAvatarUrl   = document.getElementById('settings-avatar-url');
const btnSaveSettings     = document.getElementById('btn-save-settings');
const settingsSaveStatus  = document.getElementById('settings-save-status');

// Server settings overlay
const serverSettingsOverlay = document.getElementById('server-settings-overlay');
const ssServerNameEl        = document.getElementById('ss-server-name');
const ssNavItems            = document.querySelectorAll('.ss-nav-item[data-panel]');
const ssCloseBtn            = document.getElementById('ss-close-btn');
const ssNameInput           = document.getElementById('ss-name');
const ssDescInput           = document.getElementById('ss-description');
const ssBtnSaveOverview     = document.getElementById('ss-btn-save-overview');
const ssOverviewStatus      = document.getElementById('ss-overview-status');
const ssMembersList         = document.getElementById('ss-members-list');
const ssMembersStatus       = document.getElementById('ss-members-status');

// Status
const statusContextMenu      = document.getElementById('status-context-menu');
const currentUserStatusBadge = document.getElementById('current-user-status-badge');
const sidebarUser            = document.getElementById('sidebar-user');

// Edit Channel modal
const editChannelOverlay    = document.getElementById('edit-channel-overlay');
const editChannelForm       = document.getElementById('edit-channel-form');
const editChannelNameInput  = document.getElementById('edit-channel-name');
const editChannelDescInput  = document.getElementById('edit-channel-desc');
const btnCancelEditChannel  = document.getElementById('btn-cancel-edit-channel');
const editChannelError      = document.getElementById('edit-channel-error');

// Edit Category modal
const editCatOverlay        = document.getElementById('edit-cat-overlay');
const editCatForm           = document.getElementById('edit-cat-form');
const editCatNameInput      = document.getElementById('edit-cat-name');
const btnCancelEditCat      = document.getElementById('btn-cancel-edit-cat');
const editCatError          = document.getElementById('edit-cat-error');

