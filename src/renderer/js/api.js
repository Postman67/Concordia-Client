//  REST helpers â€” Federation (uses FEDERATION_URL + token)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Session refresh: identity tokens are short-lived (~1h); when the Federation
// answers 401 we rotate the refresh token once and retry. A failed rotation
// (revoked / expired / reused) means the session is really over.
let _refreshInFlight = null;
async function tryRefreshSession() {
  if (!refreshToken) return false;
  if (_refreshInFlight) return _refreshInFlight; // de-dupe concurrent 401s

  _refreshInFlight = (async () => {
    try {
      const res = await fetch(`${FEDERATION_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      token = data.token;
      refreshToken = data.refresh_token;
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_refresh_token', refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      _refreshInFlight = null;
    }
  })();
  return _refreshInFlight;
}

async function fedPost(path, body) {
  const doFetch = () => fetch(`${FEDERATION_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let res = await doFetch();
  if (res.status === 401 && token && (await tryRefreshSession())) res = await doFetch();
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && token) { handleSessionExpired(); }
    throw new Error(data.message ?? data.error ?? 'Request failed');
  }
  return data;
}

async function fedGet(path) {
  const doFetch = () => fetch(`${FEDERATION_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefreshSession())) res = await doFetch();
  if (!res.ok) {
    if (res.status === 401) { handleSessionExpired(); return null; }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function fedPatch(path, body) {
  const doFetch = () => fetch(`${FEDERATION_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefreshSession())) res = await doFetch();
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
  return data;
}

async function fedPut(path, body) {
  const doFetch = () => fetch(`${FEDERATION_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefreshSession())) res = await doFetch();
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
  return data;
}

async function fedDelete(path) {
  const doFetch = () => fetch(`${FEDERATION_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefreshSession())) res = await doFetch();
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
}

// â”€â”€â”€ REST helpers â€” active server (uses activeServerUrl + token) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Server-scoped tokens: chat servers never see the Federation identity token.
// The client exchanges it (POST /api/auth/server-token) for a short-lived
// token whose `aud` claim is pinned to one server's origin, and sends only that.

function normalizeServerOrigin(input) {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return new URL(withScheme).origin.toLowerCase();
}

async function getServerToken(serverUrl) {
  const origin = normalizeServerOrigin(serverUrl);
  const cached = serverTokenCache[origin];
  // Refresh 60s before expiry so in-flight requests never race the cutoff
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const data = await fedPost('/api/auth/server-token', { server: origin });
  serverTokenCache[origin] = {
    token: data.token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.token;
}

async function apiPost(path, body) {
  const serverToken = await getServerToken(activeServerUrl);
  const res = await fetch(`${activeServerUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) { handleSessionExpired(); throw new Error('Session expired'); }
    throw new Error(data.message ?? data.error ?? 'Request failed');
  }
  return data;
}

async function apiGet(path) {
  const serverToken = await getServerToken(activeServerUrl);
  const res = await fetch(`${activeServerUrl}${path}`, {
    headers: { Authorization: `Bearer ${serverToken}` },
  });
  if (!res.ok) {
    if (res.status === 401) { handleSessionExpired(); throw new Error('Session expired'); }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiDelete(path) {
  const serverToken = await getServerToken(activeServerUrl);
  const res = await fetch(`${activeServerUrl}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${serverToken}` },
  });
  if (!res.ok) {
    if (res.status === 401) { handleSessionExpired(); throw new Error('Session expired'); }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
}

async function apiPatch(path, body) {
  const serverToken = await getServerToken(activeServerUrl);
  const res = await fetch(`${activeServerUrl}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) { handleSessionExpired(); throw new Error('Session expired'); }
    throw new Error(data.message ?? data.error ?? 'Request failed');
  }
  return data;
}

async function apiPut(path, body) {
  const serverToken = await getServerToken(activeServerUrl);
  const res = await fetch(`${activeServerUrl}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) { handleSessionExpired(); throw new Error('Session expired'); }
    throw new Error(data.message ?? data.error ?? 'Request failed');
  }
  return data;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Utilities
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 38%)`;
}
