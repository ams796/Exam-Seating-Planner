// Shared: one helper for every API call (adds the session token, handles errors).
// The token is kept in sessionStorage: it disappears when the browser tab is closed.

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem('session') || 'null');
  } catch {
    return null;
  }
}

function saveSession(session) {
  sessionStorage.setItem('session', JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem('session');
}

// Sends a request and returns the parsed JSON. Throws an Error with the API message if not 2xx.
// 401 = not logged in / session expired -> back to the login page.
async function api(path, { method = 'GET', body } = {}) {
  const session = getSession();
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(API_BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }

  let data = null;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    data = await response.json();
  }

  if (response.status === 401 && !path.startsWith('/api/auth/login')) {
    clearSession();
    window.location.href = 'index.html?expired=1';
    throw new Error('Session expired.');
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}

// Every protected page calls this first. Wrong role -> sent to its own home page.
const HOME_BY_ROLE = { admin: 'allocation.html', proctor: 'proctor.html', student: 'my-seat.html' };

function requirePage(...roles) {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  if (!roles.includes(session.user.role)) {
    window.location.href = HOME_BY_ROLE[session.user.role] || 'index.html';
    return null;
  }
  const who = document.querySelector('#who');
  if (who) who.textContent = `${session.user.name} (${session.user.role})`;
  const logout = document.querySelector('#logout');
  if (logout) {
    logout.addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* already logged out */ }
      clearSession();
      window.location.href = 'index.html';
    });
  }
  return session;
}

// Small helpers to build the page safely: text is always set with textContent (no XSS).
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

function showMessage(target, text, ok = false) {
  target.textContent = text;
  target.className = `message ${ok ? 'ok' : 'error'}`;
}

function formatDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
