const TOKEN_KEY = 'tea-parlor-ops-token';

const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const tokenInput = document.getElementById('tokenInput');
const banner = document.getElementById('banner');

let token = localStorage.getItem(TOKEN_KEY) || '';

function showBanner(text, bad = false) {
  banner.hidden = !text;
  banner.textContent = text || '';
  banner.classList.toggle('is-bad', Boolean(bad));
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    options = { ...options, body: JSON.stringify(options.body) };
  }
  const res = await fetch(path, { ...options, headers, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.reason || `http_${res.status}`);
    error.status = res.status;
    error.body = data;
    throw error;
  }
  return data;
}

function enterApp() {
  loginView.hidden = true;
  appView.hidden = false;
}

function leaveApp() {
  token = '';
  localStorage.removeItem(TOKEN_KEY);
  loginView.hidden = false;
  appView.hidden = true;
}

function switchTab(id) {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === id);
  });
  document.querySelectorAll('[data-panel]').forEach((panel) => {
    panel.hidden = panel.getAttribute('data-panel') !== id;
  });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

async function loadOverview() {
  const [summaryRes, gamesRes] = await Promise.all([
    api('/admin/ledger/summary'),
    api('/admin/games'),
  ]);
  const s = summaryRes.summary;
  const games = gamesRes.games || [];
  document.getElementById('overviewMetrics').innerHTML = [
    ['建档用户', s.userCount],
    ['冻结', s.frozenCount],
    ['上线玩法', games.filter((game) => game.enabled).length],
    ['平台收益', formatMoney(s.platformRevenue || s.rakeToHouse || 0)],
    ['金币台费', formatMoney(s.rakeGold || 0)],
    ['赛季积分事件', s.pendingRevenueEvents || 0],
    ['发放合计', formatMoney(s.issued)],
    ['账本条数', s.ledgerCount],
  ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
  document.getElementById('overviewGames').innerHTML = games.map((game) => `
    <article class="item-card">
      <div>
        <b>${esc(game.name)}</b>
        <div class="item-meta">${esc(game.summary)}</div>
      </div>
      <span class="tag ${game.enabled ? 'on' : 'off'}">${game.enabled ? '上线' : '下线'}</span>
    </article>
  `).join('');
}

async function loadRooms() {
  const { configs } = await api('/admin/room-configs');
  const root = document.getElementById('roomList');
  root.innerHTML = (configs || []).map((room) => `
    <article class="item-card" data-room="${esc(room.gameId)}:${esc(room.roomKey)}">
      <div>
        <b>${esc(room.name)}</b>
        <div class="item-meta">${esc(room.gameId)} / ${esc(room.roomKey)} · 底分 ${formatMoney(room.baseRoomScore)} · 带入 ${formatMoney(room.buyIn)}</div>
      </div>
      <span class="tag ${room.enabled !== false ? 'on' : 'off'}">${room.enabled !== false ? '启用' : '停用'}</span>
    </article>
  `).join('') || '<p class="muted">暂无场次</p>';
  root.querySelectorAll('[data-room]').forEach((card) => {
    card.addEventListener('click', () => {
      const [gameId, roomKey] = card.getAttribute('data-room').split(':');
      const room = configs.find((item) => item.gameId === gameId && item.roomKey === roomKey);
      if (!room) return;
      const form = document.getElementById('roomForm');
      form.gameId.value = room.gameId;
      form.roomKey.value = room.roomKey;
      form.name.value = room.name || '';
      form.baseRoomScore.value = room.baseRoomScore;
      form.buyIn.value = room.buyIn;
      form.enabled.checked = room.enabled !== false;
    });
  });
}

async function loadGames() {
  const { games } = await api('/admin/games');
  const root = document.getElementById('gameList');
  root.innerHTML = games.map((game) => `
    <article class="item-card">
      <div>
        <b>${esc(game.name)}</b>
        <div class="item-meta">${esc(game.id)} · ${esc(game.summary)}</div>
      </div>
      <label class="check">
        <span class="tag ${game.enabled ? 'on' : 'off'}">${game.enabled ? '上线' : '下线'}</span>
        <input type="checkbox" data-game-toggle="${game.id}" ${game.enabled ? 'checked' : ''} />
      </label>
    </article>
  `).join('');
  root.querySelectorAll('[data-game-toggle]').forEach((input) => {
    input.addEventListener('change', async () => {
      try {
        await api(`/admin/games/${input.getAttribute('data-game-toggle')}`, {
          method: 'PUT',
          body: { enabled: input.checked },
        });
        showBanner(input.checked ? '玩法已上线，大厅刷新后生效' : '玩法已下线，大厅入口将隐藏');
        await loadGames();
      } catch (error) {
        showBanner(error.message, true);
      }
    });
  });
}

async function loadAppearance(kind) {
  const path = kind === 'characters' ? '/admin/characters' : '/admin/skins';
  const listKey = kind === 'characters' ? 'characters' : 'skins';
  const rootId = kind === 'characters' ? 'characterList' : 'skinList';
  const payload = await api(path);
  const items = payload[listKey] || [];
  const root = document.getElementById(rootId);
  const groups = [...new Set(items.map((item) => item.group))];
  root.innerHTML = groups.map((group) => {
    const rows = items.filter((item) => item.group === group).map((item) => `
      <article class="item-card">
        <div>
          <b>${esc(item.name)}</b>
          <div class="item-meta">
            ${esc(item.id)}${item.summary ? ` · ${esc(item.summary)}` : ''}
            ${kind === 'skins' ? ` · ${esc(item.slotType || 'table_skin')} · ${esc(item.rarity || 'common')} · ${esc(item.source || '内部配置')}${item.limited ? ' · 限时' : ''}${item.coBranded ? ' · 联名' : ''}` : ''}
          </div>
        </div>
        <label class="check">
          <span class="tag ${item.enabled ? 'on' : 'off'}">${item.enabled ? '上线' : '下线'}</span>
          <input type="checkbox" data-appear="${esc(kind)}" data-appear-id="${esc(item.id)}" ${item.enabled ? 'checked' : ''} />
        </label>
      </article>
    `).join('');
    return `<div class="stack"><h3>${esc(group)}</h3>${rows}</div>`;
  }).join('');
  root.querySelectorAll('[data-appear-id]').forEach((input) => {
    input.addEventListener('change', async () => {
      const type = input.getAttribute('data-appear');
      const id = input.getAttribute('data-appear-id');
      try {
        await api(`/admin/${type}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: { enabled: input.checked },
        });
        showBanner(type === 'characters'
          ? (input.checked ? '人物已上线' : '人物已下线，大厅将隐藏该人设')
          : (input.checked ? '皮肤已上线' : '皮肤已下线，大厅将不再提供切换'));
        await loadAppearance(type);
        await loadOverview();
      } catch (error) {
        showBanner(error.message, true);
      }
    });
  });
}

async function loadCostumeLogos() {
  const { costumeLogos } = await api('/admin/costume-logos');
  const form = document.getElementById('logoForm');
  if (!form || !costumeLogos) return;
  form.enabled.checked = costumeLogos.enabled !== false;
  form.leftId.value = costumeLogos.leftId || 'eth';
  form.rightId.value = costumeLogos.rightId || 'triple-bar';
  form.size.value = costumeLogos.size || 'md';
}

function fillSelect(select, items, valueKey, labelKey, extra = []) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = [...extra, ...items].map((item) => (
    `<option value="${esc(item[valueKey])}">${esc(item[labelKey])}</option>`
  )).join('');
  if (current) select.value = current;
}

async function loadAds() {
  const { placements, categories, logos } = await api('/admin/ad-placements');
  const form = document.getElementById('adForm');
  fillSelect(form?.categoryId, categories || [], 'id', 'name');
  fillSelect(form?.logoId, logos || [], 'id', 'name', [{ id: '', name: '无 Logo' }]);

  const catRoot = document.getElementById('categoryList');
  if (catRoot) {
    catRoot.innerHTML = (categories || []).map((item) => `
      <article class="item-card">
        <div><b>${esc(item.name)}</b><div class="item-meta">${esc(item.id)}</div></div>
        <span class="tag ${item.enabled ? 'on' : 'off'}">${item.enabled ? '可用' : '停用'}</span>
      </article>
    `).join('');
  }

  const logoRoot = document.getElementById('logoList');
  if (logoRoot) {
    logoRoot.innerHTML = (logos || []).map((item) => `
      <article class="item-card">
        <div><b>${esc(item.name)}</b><div class="item-meta">${esc(item.id)} · ${item.builtin ? '内置' : '自传'}</div></div>
        ${item.builtin ? '' : `<button type="button" class="ghost" data-del-logo="${esc(item.id)}">删除</button>`}
      </article>
    `).join('');
    logoRoot.querySelectorAll('[data-del-logo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/admin/ad-logos/${encodeURIComponent(btn.getAttribute('data-del-logo'))}`, { method: 'DELETE' });
          showBanner('Logo 已删除');
          await loadAds();
          await loadCostumeLogos();
        } catch (error) {
          showBanner(error.message, true);
        }
      });
    });
  }

  const root = document.getElementById('adList');
  root.innerHTML = placements.map((ad) => `
    <article class="item-card" data-ad="${ad.slotId}">
      <div>
        <b>${esc(ad.advertiserName)} · ${esc(ad.campaignTitle)}</b>
        <div class="item-meta">
          ${esc(ad.gameId || 'general')} · ${esc(ad.surface)} · ${esc(ad.slotType)}
          ${ad.seatIndex === null || ad.seatIndex === undefined ? '' : ` · 座位 ${esc(ad.seatIndex)}`}
          · ${esc(ad.categoryName || ad.categoryId || '未分类')} · ${esc(ad.slotId)}
        </div>
        <div class="item-meta">${esc(ad.copy)}${ad.startAt || ad.endAt ? ` · ${esc(formatAdRange(ad))}` : ''}</div>
      </div>
      <span class="tag ${ad.enabled ? 'on' : 'off'}">${ad.enabled ? '启用' : '停用'}</span>
    </article>
  `).join('');
  root.querySelectorAll('[data-ad]').forEach((card) => {
    card.addEventListener('click', () => {
      const ad = placements.find((item) => item.slotId === card.getAttribute('data-ad'));
      if (!ad) return;
      const adForm = document.getElementById('adForm');
      for (const [key, value] of Object.entries(ad)) {
        if (!adForm.elements[key]) continue;
        if (adForm.elements[key].type === 'checkbox') adForm.elements[key].checked = Boolean(value);
        else if (adForm.elements[key].type === 'datetime-local') adForm.elements[key].value = toDateTimeLocal(value);
        else adForm.elements[key].value = value ?? '';
      }
    });
  });

  const left = document.querySelector('#logoForm [name="leftId"]');
  const right = document.querySelector('#logoForm [name="rightId"]');
  const costumeMarks = [{ id: 'none', name: '不显示' }, ...(logos || [])];
  fillSelect(left, costumeMarks, 'id', 'name');
  fillSelect(right, costumeMarks, 'id', 'name');
}

async function loadLedger(filter = {}) {
  const query = new URLSearchParams(filter);
  const [summaryRes, ledgerRes] = await Promise.all([
    api('/admin/ledger/summary'),
    api(`/admin/ledger?${query}`),
  ]);
  const s = summaryRes.summary;
  document.getElementById('ledgerSummary').innerHTML = [
    ['用户', s.userCount],
    ['冻结', s.frozenCount],
    ['发放合计', formatMoney(s.issued)],
    ['可用', formatMoney(s.available)],
    ['锁定', formatMoney(s.locked)],
    ['结算净额', formatMoney(s.settlementNet)],
    ['流水条数', s.ledgerCount],
    ['结算平衡', s.settlementBalanced ? '是' : '否'],
    ['平台收益', formatMoney(s.platformRevenue || 0)],
    ['金币台费', formatMoney(s.rakeGold || 0)],
    ['赛季积分事件', s.pendingRevenueEvents || 0],
  ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');

  document.getElementById('ledgerBody').innerHTML = (ledgerRes.ledger || []).slice().reverse().slice(0, 80).map((entry) => `
    <tr>
      <td>${entry.createdAt || ''}</td>
      <td>${entry.userId}</td>
      <td>${entry.type}</td>
      <td>${formatMoney(entry.amount)}</td>
      <td>${formatMoney(entry.balanceAfter)}</td>
      <td>${formatMoney(entry.lockedAfter)}</td>
      <td>${entry.idempotencyKey || ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="7">暂无流水</td></tr>';
}

async function loadUsers(userId = '') {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const { users } = await api(`/admin/users${query}`);
  document.getElementById('userList').innerHTML = users.length
    ? users.map((user) => `
      <article class="item-card" data-user="${user.userId}">
        <div>
          <b>${esc(user.profile?.displayName || user.userId)}</b>
          <div class="item-meta">
            ${esc(user.userId)}
            · 可用 ${formatMoney(user.account?.available)}
            · 锁定 ${formatMoney(user.account?.locked)}
            ${user.profile?.note ? ` · ${esc(user.profile.note)}` : ''}
          </div>
        </div>
        <span class="tag ${user.frozen ? 'off' : 'on'}">${user.frozen ? '已冻结' : '正常'}</span>
      </article>
    `).join('')
    : '<p class="muted">暂无用户</p>';

  document.querySelectorAll('[data-user]').forEach((card) => {
    card.addEventListener('click', () => {
      const user = users.find((item) => item.userId === card.getAttribute('data-user'));
      if (!user) return;
      const form = document.getElementById('userForm');
      form.userId.value = user.userId;
      form.displayName.value = user.profile?.displayName || '';
      form.note.value = user.profile?.note || '';
      form.reason.value = user.freeze?.reason || '';
    });
  });
}

async function bootApp() {
  enterApp();
  await Promise.all([
    loadOverview(),
    loadGames(),
    loadRooms(),
    loadAppearance('characters'),
    loadAppearance('skins'),
    loadCostumeLogos(),
    loadAds(),
    loadLedger(),
    loadUsers(),
  ]);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  token = tokenInput.value.trim();
  loginError.hidden = true;
  try {
    await api('/admin/games');
    localStorage.setItem(TOKEN_KEY, token);
    await bootApp();
  } catch (error) {
    leaveApp();
    loginError.hidden = false;
    loginError.textContent = error.status === 401 ? '口令不正确' : error.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', leaveApp);

document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
});

document.getElementById('roomForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  body.enabled = form.enabled.checked;
  body.baseRoomScore = Number(body.baseRoomScore);
  body.buyIn = Number(body.buyIn);
  try {
    await api(`/admin/room-configs/${encodeURIComponent(body.gameId)}/${encodeURIComponent(body.roomKey)}`, {
      method: 'PUT',
      body,
    });
    showBanner('场次已保存');
    await Promise.all([loadRooms(), loadOverview()]);
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('createUserForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  body.amount = Number(body.amount || 0);
  try {
    await api('/admin/users', { method: 'POST', body });
    form.reset();
    form.amount.value = 1000;
    showBanner('用户已在后台建档');
    await Promise.all([loadUsers(), loadLedger(), loadOverview()]);
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('logoForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api('/admin/costume-logos', {
      method: 'PUT',
      body: {
        enabled: form.enabled.checked,
        leftId: form.leftId.value,
        rightId: form.rightId.value,
        size: form.size.value,
      },
    });
    showBanner('服饰 Logo 已保存，大厅刷新后贴到衣服上');
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('categoryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    await api('/admin/ad-categories', { method: 'POST', body });
    form.reset();
    showBanner('品类已添加');
    await loadAds();
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('logoUploadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = form.file.files[0];
  if (!file) return;
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  try {
    await api('/admin/ad-logos', {
      method: 'POST',
      body: { id: form.id.value, name: form.name.value, data },
    });
    form.reset();
    showBanner('Logo 已上传，可在广告和服饰胸标里选用');
    await loadAds();
    await loadCostumeLogos();
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('adForm').querySelector('[data-act="new-ad"]').addEventListener('click', () => {
  document.getElementById('adForm').reset();
  document.getElementById('adForm').enabled.checked = true;
});

document.getElementById('adForm').querySelector('[data-act="delete-ad"]').addEventListener('click', async () => {
  const slotId = document.getElementById('adForm').slotId.value;
  if (!slotId) return;
  try {
    await api(`/admin/ad-placements/${encodeURIComponent(slotId)}`, { method: 'DELETE' });
    document.getElementById('adForm').reset();
    showBanner('广告已删除');
    await loadAds();
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('adForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  body.enabled = form.enabled.checked;
  body.priority = Number(body.priority);
  body.seatIndex = body.seatIndex === '' ? null : Number(body.seatIndex);
  body.startAt = fromDateTimeLocal(body.startAt);
  body.endAt = fromDateTimeLocal(body.endAt);
  try {
    await api(`/admin/ad-placements/${encodeURIComponent(body.slotId)}`, { method: 'PUT', body });
    showBanner('广告已保存，大厅刷新后生效');
    await loadAds();
  } catch (error) {
    showBanner(error.message, true);
  }
});

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

function formatAdRange(ad) {
  const start = ad.startAt ? toDateTimeLocal(ad.startAt).replace('T', ' ') : '立即';
  const end = ad.endAt ? toDateTimeLocal(ad.endAt).replace('T', ' ') : '长期';
  return `${start} 至 ${end}`;
}

document.getElementById('ledgerFilter').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const filter = {};
  if (data.userId) filter.userId = data.userId;
  if (data.type) filter.type = data.type;
  try {
    await loadLedger(filter);
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('userFilter').addEventListener('submit', async (event) => {
  event.preventDefault();
  const userId = new FormData(event.currentTarget).get('userId');
  try {
    await loadUsers(String(userId || ''));
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('userForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api(`/admin/users/${encodeURIComponent(form.userId.value)}`, {
      method: 'PUT',
      body: { displayName: form.displayName.value, note: form.note.value },
    });
    showBanner('用户资料已保存');
    await loadUsers();
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('userForm').querySelector('[data-act="grant"]').addEventListener('click', async () => {
  const form = document.getElementById('userForm');
  try {
    await api(`/admin/users/${encodeURIComponent(form.userId.value)}/grant`, {
      method: 'POST',
      body: { amount: Number(form.amount.value), displayName: form.displayName.value, note: form.note.value },
    });
    showBanner('已发放影子积分');
    await Promise.all([loadUsers(), loadLedger()]);
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('userForm').querySelector('[data-act="freeze"]').addEventListener('click', async () => {
  const form = document.getElementById('userForm');
  try {
    await api(`/admin/users/${encodeURIComponent(form.userId.value)}/freeze`, {
      method: 'POST',
      body: { reason: form.reason.value || 'manual_ops_freeze' },
    });
    showBanner('用户已冻结，大厅将无法开局');
    await loadUsers();
  } catch (error) {
    showBanner(error.message, true);
  }
});

document.getElementById('userForm').querySelector('[data-act="unfreeze"]').addEventListener('click', async () => {
  const form = document.getElementById('userForm');
  try {
    await api(`/admin/users/${encodeURIComponent(form.userId.value)}/unfreeze`, { method: 'POST', body: {} });
    showBanner('用户已解冻');
    await loadUsers();
  } catch (error) {
    showBanner(error.message, true);
  }
});

if (token) {
  api('/admin/games').then(bootApp).catch(leaveApp);
}
