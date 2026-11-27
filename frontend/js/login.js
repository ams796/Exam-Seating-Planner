// Shared: login page. Sends the login, stores the session, goes to the page for the user's role.
const form = document.querySelector('#login-form');
const message = document.querySelector('#login-message');

if (new URLSearchParams(window.location.search).has('expired')) {
  showMessage(message, 'Your session has expired. Please log in again.');
}

const existing = getSession();
if (existing) window.location.href = HOME_BY_ROLE[existing.user.role];

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const login = form.login.value.trim();
  const password = form.password.value;
  if (login.length < 3 || !password) {
    showMessage(message, 'Enter your email or student code and your password.');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: { login, password } });
    saveSession({ token: result.token, user: result.user });
    window.location.href = HOME_BY_ROLE[result.user.role];
  } catch (error) {
    showMessage(message, error.message);
  } finally {
    button.disabled = false;
    form.password.value = '';
  }
});
