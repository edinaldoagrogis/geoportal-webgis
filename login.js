// login.js – simple client‑side authentication

// Utility: SHA‑256 hash using Web Crypto API
async function hash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function setCurrentUser(user) {
  localStorage.setItem('currentUser', user);
}

function getCurrentUser() {
  return localStorage.getItem('currentUser');
}

function getUsers() {
  return JSON.parse(localStorage.getItem('users') || '{}');
}

function saveUsers(users) {
  localStorage.setItem('users', JSON.stringify(users));
}

async function handleLogin() {
  const user = document.getElementById('user').value.trim();
  const pass = document.getElementById('pass').value;
  // Default credentials
  if (user === 'NDBAGRICOLA' && pass === 'NDBAGRICOLA') {
    const hashed = await hash(pass);
    const users = getUsers();
    users[user] = hashed;
    saveUsers(users);
    setCurrentUser(user);
    window.location.href = 'index.html';
    return;
  }
  if (!user || !pass) return alert('Preencha usuário e senha');
  const users = getUsers();
  const hashed = await hash(pass);
  if (users[user] && users[user] === hashed) {
    setCurrentUser(user);
    window.location.href = 'index.html';
  } else if (!users[user]) {
    // first‑time registration
    users[user] = hashed;
    saveUsers(users);
    setCurrentUser(user);
    window.location.href = 'index.html';
  } else {
    alert('Senha incorreta');
  }
}

async function handleChangePassword() {
  const user = document.getElementById('user').value.trim();
  const oldPass = document.getElementById('oldPass').value;
  const newPass = document.getElementById('newPass').value;
  const users = getUsers();
  if (!users[user]) return alert('Usuário inexistente');
  const oldHash = await hash(oldPass);
  if (users[user] !== oldHash) return alert('Senha atual incorreta');
  users[user] = await hash(newPass);
  saveUsers(users);
  alert('Senha alterada!');
  window.location.href = 'login.html';
}

function renderLogin() {
  document.getElementById('loginBtn').onclick = handleLogin;
  document.getElementById('changeLink').onclick = () => {
    // render change password UI inside same page
    document.body.innerHTML = `
      <div class="login-card">
        <h1>Alterar senha</h1>
        <input id="user" type="text" placeholder="Usuário" autocomplete="username" />
        <input id="oldPass" type="password" placeholder="Senha atual" autocomplete="current-password" />
        <input id="newPass" type="password" placeholder="Nova senha" autocomplete="new-password" />
        <button id="saveBtn">Salvar</button>
        <p class="link" id="backLink">Voltar ao login</p>
      </div>`;
    document.getElementById('saveBtn').onclick = handleChangePassword;
    document.getElementById('backLink').onclick = () => location.reload();
  };
}

// If already logged in, go to main app
if (getCurrentUser()) {
  window.location.href = 'index.html';
} else {
  renderLogin();
}
