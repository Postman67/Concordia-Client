// ═════════════════════════════════════════════════════════════════════════════
//  REST helpers — Social (social.concordiachat.com)
// ═════════════════════════════════════════════════════════════════════════════

const SOCIAL_URL = 'https://social.concordiachat.com';

async function socialGet(path) {
  const res = await fetch(`${SOCIAL_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) { handleSessionExpired(); return null; }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function socialPost(path, body) {
  const res = await fetch(`${SOCIAL_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
  return data;
}

async function socialPatch(path, body) {
  const res = await fetch(`${SOCIAL_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
  return data;
}

async function socialDelete(path) {
  const res = await fetch(`${SOCIAL_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
}
