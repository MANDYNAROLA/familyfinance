import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, set, get, push, onValue, update, remove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { T, LANGUAGES, CURRENCIES } from "./i18n.js";

// ── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCEkQGmMb5u6NiMASd3an4BoX5BYI2EYZo",
  authDomain: "finacialdashboard-ff730.firebaseapp.com",
  databaseURL: "https://finacialdashboard-ff730-default-rtdb.firebaseio.com",
  projectId: "finacialdashboard-ff730",
  storageBucket: "finacialdashboard-ff730.firebasestorage.app",
  messagingSenderId: "798530658376",
  appId: "1:798530658376:web:bef63d32fdf3d1347ff87d"
};
// ─────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ── STATE ─────────────────────────────────────────────────────
let currentUser = null;
let userData = null;
let familyData = null;
let familyMembers = {};
let allTransactions = [];
let familyGoals = [];
let familyAlerts = [];
let currentTxType = 'expense';
let contributeGoalId = null;
let changeRoleMemberId = null;
let monthChart, donutChart;
let unreadAlerts = 0;
let customCategories = [];

// ── PREFERENCES ───────────────────────────────────────────────
let currentLang = 'en';
let currentCurrency = { code: 'USD', symbol: '$' };
let currentTheme = 'light';

const CAT_ICONS = {
  '🍔 Food':'🍔','🚌 Transport':'🚌','🏠 Housing':'🏠','🎬 Entertainment':'🎬',
  '💊 Health':'💊','🛍️ Shopping':'🛍️','⚡ Utilities':'⚡','💼 Salary':'💼','📦 Other':'📦'
};
const CAT_COLORS = {
  '🍔 Food':'#E24B4A','🚌 Transport':'#EF9F27','🏠 Housing':'#1a56db',
  '🎬 Entertainment':'#7c3aed','💊 Health':'#16a34a','🛍️ Shopping':'#d4537e',
  '⚡ Utilities':'#888780','💼 Salary':'#639922','📦 Other':'#5DCAA5'
};
const ROLE_COLORS = { admin:'badge-admin', parent:'badge-parent', child:'badge-child', viewer:'badge-viewer' };
const AVATAR_COLORS = ['#1a56db','#7c3aed','#16a34a','#d97706','#dc2626','#0891b2'];

function avatarColor(uid) { return AVATAR_COLORS[uid.charCodeAt(0) % AVATAR_COLORS.length]; }
function initials(name) { return name ? name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'; }
function fmt(n) { return currentCurrency.symbol + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); }
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

// ── AUTH ──────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  const snap = await get(ref(db, `users/${user.uid}`));
  if (!snap.exists()) { window.location.href = 'index.html'; return; }
  userData = snap.val();
  initApp();
});

async function initApp() {
  // Sidebar user info
  document.getElementById('sb-user-name').textContent = userData.name;
  document.getElementById('sb-user-role').textContent = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);
  document.getElementById('sb-avatar').textContent = initials(userData.name);
  document.getElementById('sb-avatar').style.background = avatarColor(currentUser.uid) + '22';
  document.getElementById('sb-avatar').style.color = avatarColor(currentUser.uid);

  // Show admin-only nav items
  if (['admin','parent'].includes(userData.role)) {
    document.getElementById('sb-invite-btn').style.display = 'inline-block';
    document.getElementById('nav-settings').style.display = 'flex';
  }
  // Super admin only for platform owner
  if (currentUser.email === SUPER_ADMIN_EMAIL) {
    document.getElementById('nav-superadmin').style.display = 'flex';
  }

  // Show add transaction btn for non-viewers
  if (userData.role !== 'viewer') {
    document.getElementById('add-tx-btn').style.display = 'inline-flex';
  }

  // Load user preferences (theme, language, currency)
  await loadPreferences();
  onValue(ref(db, `families/${userData.familyId}`), snap => {
    familyData = snap.val();
    document.getElementById('sb-family-name').textContent = familyData?.name || 'My Family';
    document.getElementById('modal-invite-code').textContent = familyData?.inviteCode || '—';
    renderInviteDisplay();
  });

  // Listen to members
  onValue(ref(db, 'users'), snap => {
    familyMembers = {};
    snap.forEach(child => {
      const u = child.val();
      if (u.familyId === userData.familyId) familyMembers[child.key] = u;
    });
    renderMembers();
    renderSettingsMembers();
  });

  // Listen to transactions (family + private)
  onValue(ref(db, `transactions/${userData.familyId}`), snap => {
    allTransactions = [];
    snap.forEach(child => {
      const tx = child.val();
      // Show family transactions + user's own private ones
      if (tx.visibility === 'family' || tx.userId === currentUser.uid) {
        allTransactions.push({ id: child.key, ...tx });
      }
    });
    allTransactions.sort((a,b) => b.createdAt - a.createdAt);
    renderOverview();
    renderTransactions();
  });

  // Listen to goals
  onValue(ref(db, `goals/${userData.familyId}`), snap => {
    familyGoals = [];
    snap.forEach(child => familyGoals.push({ id: child.key, ...child.val() }));
    renderGoals();
  });

  // Listen to alerts
  onValue(ref(db, `alerts/${userData.familyId}`), snap => {
    familyAlerts = [];
    snap.forEach(child => familyAlerts.push({ id: child.key, ...child.val() }));
    familyAlerts.sort((a,b) => b.createdAt - a.createdAt);
    unreadAlerts = familyAlerts.filter(a => !a.readBy?.[currentUser.uid]).length;
    const badge = document.getElementById('alert-badge');
    badge.textContent = unreadAlerts;
    badge.style.display = unreadAlerts > 0 ? 'inline-block' : 'none';
    renderAlerts();
  });
}

// ── NAVIGATION ───────────────────────────────────────────────
const PAGE_TITLES = { overview:'Overview', transactions:'Transactions', goals:'Savings Goals', family:'Family Members', alerts:'Alerts', settings:'Settings', superadmin:'Super Admin' };
window.navTo = (page) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[onclick="navTo('${page}')"]`).classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page];
  document.getElementById('sidebar').classList.remove('open');
};

// ── RENDER OVERVIEW ──────────────────────────────────────────
function renderOverview() {
  const family = allTransactions.filter(t => t.visibility === 'family');
  const income = family.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expenses = family.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const savings = income - expenses;
  const rate = income > 0 ? Math.round((savings/income)*100) : 0;

  document.getElementById('overview-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">Family Income</div><div class="metric-value text-green">${fmt(income)}</div><div class="metric-sub text-green">This month</div></div>
    <div class="metric-card"><div class="metric-label">Family Expenses</div><div class="metric-value text-red">${fmt(expenses)}</div><div class="metric-sub text-red">This month</div></div>
    <div class="metric-card"><div class="metric-label">Net Savings</div><div class="metric-value ${savings>=0?'text-green':'text-red'}">${fmt(savings)}</div><div class="metric-sub">Rate: ${rate}%</div></div>
    <div class="metric-card"><div class="metric-label">Members</div><div class="metric-value text-blue">${Object.keys(familyMembers).length}</div><div class="metric-sub">Active</div></div>
  `;

  renderBarChart(income, expenses, savings);
  renderDonutChart(family);
  renderRecentActivity();
}

function renderBarChart(income, expenses, savings) {
  if (monthChart) monthChart.destroy();
  monthChart = new Chart(document.getElementById('monthChart'), {
    type: 'bar',
    data: {
      labels: ['Income','Expenses','Savings'],
      datasets: [{ data: [income, expenses, Math.max(0,savings)], backgroundColor: ['#16a34a','#dc2626','#1a56db'], borderRadius: 8, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } } },
      scales: { y: { ticks: { callback: v => fmt(v) }, grid: { color:'rgba(0,0,0,0.05)' } }, x: { grid: { display:false } } }
    }
  });
}

function renderDonutChart(txs) {
  const cats = {};
  txs.filter(t=>t.type==='expense').forEach(t => { const cat = t.category||'📦 Other'; cats[cat]=(cats[cat]||0)+t.amount; });
  const labels = Object.keys(cats);
  const data = Object.values(cats);
  if (!labels.length) return;
  const colors = labels.map(l => CAT_COLORS[l]||'#888');
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout:'65%', plugins: { legend:{display:false}, tooltip:{ callbacks:{ label: ctx=>`${ctx.label}: ${fmt(ctx.raw)}` } } } }
  });
  document.getElementById('donut-legend').innerHTML = labels.slice(0,4).map((l,i)=>
    `<span><span class="legend-dot" style="background:${colors[i]}"></span>${l.split(' ')[1]||l}</span>`
  ).join('');
}

function renderRecentActivity() {
  const recent = allTransactions.filter(t=>t.visibility==='family').slice(0,5);
  document.getElementById('recent-activity').innerHTML = recent.length === 0
    ? '<div class="empty-state"><div class="empty-icon">💸</div>No activity yet</div>'
    : recent.map(t => txRow(t, false)).join('');
}

// ── RENDER TRANSACTIONS ──────────────────────────────────────
function renderTransactions() {
  const family = allTransactions.filter(t => t.visibility === 'family');
  const priv = allTransactions.filter(t => t.visibility !== 'family' && t.userId === currentUser.uid);

  const canDelete = (tx) => {
    if (userData.role === 'admin') return true;
    if (userData.role === 'parent') return true;
    if (userData.role === 'child') return false;
    if (userData.role === 'viewer') return false;
    return tx.userId === currentUser.uid;
  };

  document.getElementById('tx-list-family').innerHTML = family.length === 0
    ? '<div class="empty-state"><div class="empty-icon">💳</div>No shared transactions yet</div>'
    : family.map(t => txRow(t, canDelete(t))).join('');

  document.getElementById('tx-list-private').innerHTML = priv.length === 0
    ? '<div class="empty-state"><div class="empty-icon">🔒</div>No private transactions yet</div>'
    : priv.map(t => txRow(t, true)).join('');
}

function txRow(tx, showDelete) {
  const member = familyMembers[tx.userId];
  const isIncome = tx.type === 'income';
  return `<div class="tx-item">
    <div class="tx-dot" style="background:${isIncome?'#dcfce7':'#fee2e2'}">${tx.category?.split(' ')[0]||'💰'}</div>
    <div class="tx-info">
      <div class="tx-name">${tx.description}</div>
      <div class="tx-meta">${tx.category?.split(' ').slice(1).join(' ')||'Other'} · ${member?.name||'Unknown'} · ${timeAgo(tx.createdAt)}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="tx-amount ${isIncome?'text-green':'text-red'}">${isIncome?'+':'-'}${fmt(tx.amount)}</span>
      ${showDelete ? `<button class="icon-btn" onclick="deleteTransaction('${tx.id}')" title="Delete">🗑</button>` : ''}
    </div>
  </div>`;
}

// ── RENDER GOALS ─────────────────────────────────────────────
function renderGoals() {
  const canEdit = userData.role !== 'viewer';
  document.getElementById('goals-list').innerHTML = familyGoals.length === 0
    ? '<div class="empty-state"><div class="empty-icon">🎯</div>No goals yet. Create one to get started!</div>'
    : familyGoals.map(g => {
        const pct = Math.min(100, Math.round(((g.saved||0)/g.target)*100));
        const color = pct>=100?'#16a34a':pct>=60?'#1a56db':'#d97706';
        const contribs = g.contributions ? Object.values(g.contributions) : [];
        return `<div class="goal-card">
          <div class="goal-header">
            <div>
              <div class="goal-name">${g.name} ${pct>=100?'✅':''}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:2px">${g.type==='family'?'👨‍👩‍👧 Family goal':'👤 Personal'}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <span style="font-size:13px;font-weight:600;color:${color}">${pct}%</span>
              ${canEdit && pct<100 ? `<button class="goal-contrib-btn" onclick="openContribute('${g.id}','${g.name}')">+ Contribute</button>` : ''}
              ${['admin','parent'].includes(userData.role) ? `<button class="icon-btn" onclick="deleteGoal('${g.id}')" title="Delete">🗑</button>` : ''}
            </div>
          </div>
          <div class="progress-bg"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="goal-meta">
            <span>${fmt(g.saved||0)} saved</span>
            <span>of ${fmt(g.target)}</span>
          </div>
          ${contribs.length > 0 ? `<div style="margin-top:8px;font-size:12px;color:#6b7280">
            ${contribs.slice(-3).map(c=>`<span style="margin-right:8px">${c.name}: ${fmt(c.amount)}</span>`).join('')}
          </div>` : ''}
        </div>`;
      }).join('');
}

// ── RENDER MEMBERS ───────────────────────────────────────────
function renderMembers() {
  const el = document.getElementById('members-list');
  if (!el) return;
  el.innerHTML = Object.entries(familyMembers).map(([uid, m]) => {
    const txCount = allTransactions.filter(t=>t.userId===uid).length;
    return `<div class="member-item">
      <div class="member-avatar" style="background:${avatarColor(uid)}22;color:${avatarColor(uid)}">${initials(m.name)}</div>
      <div class="member-info">
        <div class="member-name">${m.name}${uid===currentUser.uid?' (you)':''}
          <span class="member-role-badge ${ROLE_COLORS[m.role]||'badge-viewer'}">${m.role}</span>
        </div>
        <div class="member-stats">${m.email} · ${txCount} transactions</div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state">No members yet</div>';
}

function renderSettingsMembers() {
  const el = document.getElementById('settings-members');
  if (!el || !['admin','parent'].includes(userData.role)) return;
  el.innerHTML = Object.entries(familyMembers)
    .filter(([uid]) => uid !== currentUser.uid)
    .map(([uid, m]) => `
      <div class="member-item">
        <div class="member-avatar" style="background:${avatarColor(uid)}22;color:${avatarColor(uid)}">${initials(m.name)}</div>
        <div class="member-info">
          <div class="member-name">${m.name}
            <span class="member-role-badge ${ROLE_COLORS[m.role]||'badge-viewer'}">${m.role}</span>
          </div>
        </div>
        ${userData.role==='admin' ? `<button class="btn btn-ghost" style="font-size:12px" onclick="openRoleModal('${uid}','${m.name}')">Change role</button>` : ''}
      </div>`
    ).join('') || '<div style="font-size:13px;color:#9ca3af;padding:1rem 0">No other members yet</div>';
}

// ── RENDER ALERTS ────────────────────────────────────────────
function renderAlerts() {
  document.getElementById('alerts-list').innerHTML = familyAlerts.length === 0
    ? '<div class="empty-state"><div class="empty-icon">🔔</div>No alerts yet</div>'
    : familyAlerts.map(a => {
        const isUnread = !a.readBy?.[currentUser.uid];
        return `<div class="alert-item ${isUnread?'alert-unread':''}">
          <div class="alert-dot" style="background:${isUnread?'#1a56db':'#d1d5db'}"></div>
          <div>
            <div class="alert-text">${a.message}</div>
            <div class="alert-time">${timeAgo(a.createdAt)}</div>
          </div>
        </div>`;
      }).join('');
}

window.markAllRead = async () => {
  const updates = {};
  familyAlerts.forEach(a => { updates[`alerts/${userData.familyId}/${a.id}/readBy/${currentUser.uid}`] = true; });
  await update(ref(db), updates);
};

// ── INVITE DISPLAY ───────────────────────────────────────────
function renderInviteDisplay() {
  if (!familyData || !['admin','parent'].includes(userData.role)) return;
  document.getElementById('invite-card').style.display = '';
  document.getElementById('invite-display').innerHTML = `
    <div class="invite-box">
      <div style="font-size:13px;color:#6b7280">Share this code with family</div>
      <div class="invite-code">${familyData.inviteCode||'—'}</div>
      <button class="copy-btn" onclick="copyInviteCode()">Copy Code</button>
    </div>`;
}

window.showInviteModal = () => {
  document.getElementById('modal-invite-code').textContent = familyData?.inviteCode || '—';
  openModal('invite');
};

window.copyInviteCode = () => {
  const code = familyData?.inviteCode || '';
  navigator.clipboard.writeText(code).then(() => alert(`Code "${code}" copied!`));
};

// ── MODALS ───────────────────────────────────────────────────
window.openModal = (id) => { document.getElementById(`modal-${id}`).style.display = 'flex'; };
window.closeModal = (id) => { document.getElementById(`modal-${id}`).style.display = 'none'; };

window.setTxType = (type) => {
  currentTxType = type;
  document.getElementById('type-expense').className = `type-btn ${type==='expense'?'active-expense':''}`;
  document.getElementById('type-income').className = `type-btn ${type==='income'?'active-income':''}`;
};

window.openContribute = (goalId, goalName) => {
  contributeGoalId = goalId;
  document.getElementById('contribute-goal-name').textContent = `Contributing to: ${goalName}`;
  document.getElementById('contribute-amount').value = '';
  openModal('contribute');
};

window.openRoleModal = (uid, name) => {
  changeRoleMemberId = uid;
  document.getElementById('change-role-name').textContent = `Change role for: ${name}`;
  openModal('role');
};

// ── SUBMIT TRANSACTION ───────────────────────────────────────
window.submitTransaction = async () => {
  if (userData.role === 'viewer') return alert('Viewers cannot add transactions.');
  const desc = document.getElementById('tx-desc').value.trim();
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const category = document.getElementById('tx-cat').value;
  const visibility = document.getElementById('tx-visibility').value;
  if (!desc || !amount || amount <= 0) return alert('Please fill in all fields.');

  const txRef = push(ref(db, `transactions/${userData.familyId}`));
  const tx = { description: desc, amount, type: currentTxType, category, visibility, userId: currentUser.uid, userName: userData.name, createdAt: Date.now() };
  await set(txRef, tx);

  // Create alert for family transactions (notify admin/parent)
  if (visibility === 'family' && ['admin','parent'].includes(userData.role) === false) {
    const alertRef = push(ref(db, `alerts/${userData.familyId}`));
    await set(alertRef, {
      message: `${userData.name} added a ${currentTxType}: ${desc} (${fmt(amount)})`,
      createdAt: Date.now(), type: 'transaction', readBy: {}
    });
  }

  document.getElementById('tx-desc').value = '';
  document.getElementById('tx-amount').value = '';
  closeModal('tx');
};

// ── DELETE TRANSACTION ───────────────────────────────────────
window.deleteTransaction = async (id) => {
  if (!confirm('Delete this transaction?')) return;
  if (userData.role === 'child') return alert('Children cannot delete transactions.');
  if (userData.role === 'viewer') return alert('Viewers cannot delete transactions.');
  await remove(ref(db, `transactions/${userData.familyId}/${id}`));
};

// ── SUBMIT GOAL ──────────────────────────────────────────────
window.submitGoal = async () => {
  const name = document.getElementById('goal-name-input').value.trim();
  const target = parseFloat(document.getElementById('goal-target-input').value);
  const initial = parseFloat(document.getElementById('goal-initial-input').value)||0;
  const type = document.getElementById('goal-type-input').value;
  if (!name || !target) return alert('Please enter goal name and target.');
  const goalRef = push(ref(db, `goals/${userData.familyId}`));
  const goal = { name, target, saved: initial, type, createdBy: currentUser.uid, createdAt: Date.now() };
  if (initial > 0) goal.contributions = {};
  await set(goalRef, goal);
  if (initial > 0) {
    const contribRef = push(ref(db, `goals/${userData.familyId}/${goalRef.key}/contributions`));
    await set(contribRef, { name: userData.name, amount: initial, uid: currentUser.uid, createdAt: Date.now() });
  }
  closeModal('goal');
};

window.deleteGoal = async (id) => {
  if (!confirm('Delete this goal?')) return;
  await remove(ref(db, `goals/${userData.familyId}/${id}`));
};

// ── SUBMIT CONTRIBUTION ──────────────────────────────────────
window.submitContribution = async () => {
  if (!contributeGoalId) return;
  const amount = parseFloat(document.getElementById('contribute-amount').value);
  if (!amount || amount <= 0) return alert('Enter a valid amount.');
  const goal = familyGoals.find(g=>g.id===contributeGoalId);
  if (!goal) return;
  const newSaved = (goal.saved||0) + amount;
  await update(ref(db, `goals/${userData.familyId}/${contributeGoalId}`), { saved: newSaved });
  const contribRef = push(ref(db, `goals/${userData.familyId}/${contributeGoalId}/contributions`));
  await set(contribRef, { name: userData.name, amount, uid: currentUser.uid, createdAt: Date.now() });
  // Alert
  const alertRef = push(ref(db, `alerts/${userData.familyId}`));
  await set(alertRef, { message: `${userData.name} contributed ${fmt(amount)} to "${goal.name}"`, createdAt: Date.now(), type:'goal', readBy:{} });
  closeModal('contribute');
};

// ── CHANGE ROLE ──────────────────────────────────────────────
window.submitRoleChange = async () => {
  if (!changeRoleMemberId || userData.role !== 'admin') return;
  const newRole = document.getElementById('new-role-select').value;
  await update(ref(db, `users/${changeRoleMemberId}`), { role: newRole });
  closeModal('role');
};

// ── SAVE SETTINGS ────────────────────────────────────────────
window.saveSettings = async () => {
  if (!['admin','parent'].includes(userData.role)) return;
  const name = document.getElementById('settings-family-name').value.trim();
  const budget = parseFloat(document.getElementById('settings-budget').value)||0;
  if (name) await update(ref(db, `families/${userData.familyId}`), { name, budget });
  alert('Settings saved!');
};

// ── SUPER ADMIN ───────────────────────────────────────────────
const SUPER_ADMIN_PASS = "manthan@admin2026"; // Change this!
const SUPER_ADMIN_EMAIL = "nmanthan670@gmail.com";
let saUnlocked = false;
let allUsersData = {};
let allFamiliesData = {};
let allTxData = {};
let saGrowthChart, saTxChart;

window.checkAdminPass = () => {
  const pass = document.getElementById('sa-password').value;
  if (pass === SUPER_ADMIN_PASS) {
    saUnlocked = true;
    document.getElementById('sa-gate').style.display = 'none';
    document.getElementById('sa-content').style.display = 'block';
    loadAdminData();
  } else {
    document.getElementById('sa-error').style.display = 'block';
  }
};

window.refreshAdminData = () => { if (saUnlocked) loadAdminData(); };

async function loadAdminData() {
  // Load ALL users
  const usersSnap = await get(ref(db, 'users'));
  allUsersData = {};
  usersSnap.forEach(c => { allUsersData[c.key] = c.val(); });

  // Load ALL families
  const famSnap = await get(ref(db, 'families'));
  allFamiliesData = {};
  famSnap.forEach(c => { allFamiliesData[c.key] = c.val(); });

  // Load ALL transactions
  const txSnap = await get(ref(db, 'transactions'));
  allTxData = {};
  txSnap.forEach(famChild => {
    famChild.forEach(txChild => {
      allTxData[txChild.key] = { ...txChild.val(), familyId: famChild.key };
    });
  });

  renderAdminMetrics();
  renderAdminGrowthChart();
  renderAdminTxChart();
  renderAdminFamilies();
  renderAdminActiveMembers();
  renderAdminUsersTable();
  renderAdminAllTx();
}

function renderAdminMetrics() {
  const totalUsers = Object.keys(allUsersData).length;
  const totalFamilies = Object.keys(allFamiliesData).length;
  const txArr = Object.values(allTxData);
  const totalTx = txArr.length;
  const totalVolume = txArr.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const totalIncome = txArr.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const avgPerFamily = totalFamilies > 0 ? Math.round(totalUsers/totalFamilies*10)/10 : 0;

  document.getElementById('sa-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">Total Users</div><div class="metric-value text-blue">${totalUsers}</div><div class="metric-sub" style="color:#6b7280">Registered accounts</div></div>
    <div class="metric-card"><div class="metric-label">Families</div><div class="metric-value text-purple">${totalFamilies}</div><div class="metric-sub" style="color:#6b7280">Avg ${avgPerFamily} members</div></div>
    <div class="metric-card"><div class="metric-label">Total Transactions</div><div class="metric-value text-amber">${totalTx}</div><div class="metric-sub" style="color:#6b7280">Across all families</div></div>
    <div class="metric-card"><div class="metric-label">Total Spending</div><div class="metric-value text-red">${fmt(totalVolume)}</div><div class="metric-sub" style="color:#6b7280">All expenses logged</div></div>
    <div class="metric-card"><div class="metric-label">Total Income</div><div class="metric-value text-green">${fmt(totalIncome)}</div><div class="metric-sub" style="color:#6b7280">All income logged</div></div>
  `;
}

function renderAdminGrowthChart() {
  const days = [];
  const counts = [];
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const dayStart = now - (i+1)*86400000;
    const dayEnd = now - i*86400000;
    const d = new Date(dayEnd);
    days.push(d.toLocaleDateString('en',{weekday:'short'}));
    counts.push(Object.values(allUsersData).filter(u => u.joinedAt >= dayStart && u.joinedAt < dayEnd).length);
  }
  if (saGrowthChart) saGrowthChart.destroy();
  saGrowthChart = new Chart(document.getElementById('sa-growth-chart'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{ label: 'New users', data: counts, backgroundColor: '#1a56db', borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
    }
  });
}

function renderAdminTxChart() {
  const txArr = Object.values(allTxData);
  const income = txArr.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = txArr.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const cats = {};
  txArr.filter(t=>t.type==='expense').forEach(t=>{ const c=(t.category||'Other').split(' ').slice(1).join(' ')||'Other'; cats[c]=(cats[c]||0)+t.amount; });
  const topCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if (saTxChart) saTxChart.destroy();
  saTxChart = new Chart(document.getElementById('sa-tx-chart'), {
    type: 'doughnut',
    data: {
      labels: ['Income', ...topCats.map(c=>c[0])],
      datasets: [{ data: [income, ...topCats.map(c=>c[1])], backgroundColor: ['#16a34a','#1a56db','#dc2626','#d97706','#7c3aed','#0891b2'], borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } } }
    }
  });
}

function renderAdminFamilies() {
  const html = Object.entries(allFamiliesData).map(([fid, f]) => {
    const members = Object.values(allUsersData).filter(u=>u.familyId===fid).length;
    const txCount = Object.values(allTxData).filter(t=>t.familyId===fid).length;
    const income = Object.values(allTxData).filter(t=>t.familyId===fid&&t.type==='income').reduce((s,t)=>s+t.amount,0);
    const expenses = Object.values(allTxData).filter(t=>t.familyId===fid&&t.type==='expense').reduce((s,t)=>s+t.amount,0);
    return `<div class="tx-item" onclick="showFamilyDetail('${fid}')" style="cursor:pointer;border-radius:8px;padding:10px;margin:-2px;transition:background 0.15s" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
      <div class="tx-dot" style="background:var(--blue-light);font-size:14px">👨‍👩‍👧</div>
      <div class="tx-info">
        <div class="tx-name">${f.name||'Unnamed'}</div>
        <div class="tx-meta">${members} members · ${txCount} tx · Code: ${f.inviteCode||'—'}</div>
      </div>
      <div style="text-align:right;font-size:12px">
        <div style="color:var(--green);font-weight:500">${fmt(income)}</div>
        <div style="color:var(--red)">${fmt(expenses)}</div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state">No families yet</div>';
  document.getElementById('sa-families-list').innerHTML = html;
}

function renderAdminActiveMembers() {
  const txCounts = {};
  Object.values(allTxData).forEach(t => { txCounts[t.userId] = (txCounts[t.userId]||0) + 1; });
  const sorted = Object.entries(txCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  document.getElementById('sa-active-members').innerHTML = sorted.map(([uid, count]) => {
    const u = allUsersData[uid];
    if (!u) return '';
    const fam = allFamiliesData[u.familyId];
    return `<div class="tx-item">
      <div class="member-avatar" style="width:36px;height:36px;background:${avatarColor(uid)}22;color:${avatarColor(uid)};font-size:12px">${initials(u.name)}</div>
      <div class="tx-info">
        <div class="tx-name">${u.name} <span class="member-role-badge ${ROLE_COLORS[u.role]||''}">${u.role}</span></div>
        <div class="tx-meta">${fam?.name||'—'} · ${count} transactions</div>
      </div>
      <span style="font-size:13px;font-weight:600;color:#1a56db">${count} tx</span>
    </div>`;
  }).join('') || '<div class="empty-state">No transactions yet</div>';
}

let allUsersFiltered = [];
function renderAdminUsersTable() {
  allUsersFiltered = Object.entries(allUsersData);
  buildUsersTable(allUsersFiltered);
}

window.filterUsers = () => {
  const q = document.getElementById('sa-search').value.toLowerCase();
  const filtered = Object.entries(allUsersData).filter(([,u]) =>
    u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.includes(q)
  );
  buildUsersTable(filtered);
};

function buildUsersTable(entries) {
  document.getElementById('sa-users-tbody').innerHTML = entries.map(([uid, u]) => {
    const fam = allFamiliesData[u.familyId];
    const txCount = Object.values(allTxData).filter(t=>t.userId===uid).length;
    const joined = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString() : '—';
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:9px 10px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:50%;background:${avatarColor(uid)}22;color:${avatarColor(uid)};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600">${initials(u.name)}</div>
          ${u.name||'—'}
        </div>
      </td>
      <td style="padding:9px 10px;color:#6b7280">${u.email||'—'}</td>
      <td style="padding:9px 10px"><span class="member-role-badge ${ROLE_COLORS[u.role]||''}">${u.role||'—'}</span></td>
      <td style="padding:9px 10px;color:#6b7280">${fam?.name||'—'}</td>
      <td style="padding:9px 10px;color:#6b7280">${joined}</td>
      <td style="padding:9px 10px;font-weight:500;color:#1a56db">${txCount}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#9ca3af">No users found</td></tr>';
}

function renderAdminAllTx() {
  const txArr = Object.entries(allTxData)
    .map(([id,t])=>({id,...t}))
    .sort((a,b)=>b.createdAt-a.createdAt)
    .slice(0,20);
  document.getElementById('sa-all-tx').innerHTML = txArr.map(t => {
    const u = allUsersData[t.userId];
    const fam = allFamiliesData[t.familyId];
    const isIncome = t.type==='income';
    return `<div class="tx-item">
      <div class="tx-dot" style="background:${isIncome?'#dcfce7':'#fee2e2'}">${t.category?.split(' ')[0]||'💰'}</div>
      <div class="tx-info">
        <div class="tx-name">${t.description}</div>
        <div class="tx-meta">${u?.name||'Unknown'} · ${fam?.name||'—'} · ${timeAgo(t.createdAt)}</div>
      </div>
      <span class="tx-amount ${isIncome?'text-green':'text-red'}">${isIncome?'+':'-'}${fmt(t.amount)}</span>
    </div>`;
  }).join('') || '<div class="empty-state">No transactions yet</div>';
}

window.handleLogout = async () => {
  await signOut(auth);
  window.location.href = 'index.html';
};

// ── PREFERENCES LOAD/SAVE ─────────────────────────────────────
async function loadPreferences() {
  const snap = await get(ref(db, `users/${currentUser.uid}/preferences`));
  if (snap.exists()) {
    const prefs = snap.val();
    if (prefs.lang) setLanguage(prefs.lang, false);
    if (prefs.currency) { const c = CURRENCIES.find(x=>x.code===prefs.currency); if(c) setCurrency(c.code, false); }
    if (prefs.theme) setTheme(prefs.theme, false);
    if (prefs.customCategories) { customCategories = prefs.customCategories; renderCustomCats(); }
  }
  populateLangSelect();
  populateCurrencySelect();
  populateCategorySelect();
}

async function savePreferences() {
  await update(ref(db, `users/${currentUser.uid}/preferences`), {
    lang: currentLang, currency: currentCurrency.code,
    theme: currentTheme, customCategories
  });
}

// ── THEME ─────────────────────────────────────────────────────
window.setTheme = (theme, save = true) => {
  currentTheme = theme;
  document.body.classList.toggle('dark', theme === 'dark');
  document.getElementById('theme-light')?.classList.toggle('active', theme === 'light');
  document.getElementById('theme-dark')?.classList.toggle('active', theme === 'dark');
  if (save) savePreferences();
};

// ── LANGUAGE ──────────────────────────────────────────────────
window.setLanguage = (lang, save = true) => {
  currentLang = lang;
  const tr = T[lang] || T.en;
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    if (tr[key]) el.textContent = tr[key];
  });
  document.documentElement.dir = LANGUAGES[lang]?.dir || 'ltr';
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = lang;
  if (save) savePreferences();
  renderAll();
};

function t(key) { return (T[currentLang] || T.en)[key] || T.en[key] || key; }

function populateLangSelect() {
  const sel = document.getElementById('lang-select');
  if (!sel) return;
  sel.innerHTML = Object.entries(LANGUAGES).map(([code, l]) =>
    `<option value="${code}" ${code===currentLang?'selected':''}>${l.flag} ${l.name}</option>`).join('');
}

function populateCurrencySelect() {
  const sel = document.getElementById('currency-select');
  if (!sel) return;
  sel.innerHTML = CURRENCIES.map(c =>
    `<option value="${c.code}" ${c.code===currentCurrency.code?'selected':''}>${c.symbol} ${c.code} — ${c.name}</option>`).join('');
}

// ── CURRENCY ──────────────────────────────────────────────────
window.setCurrency = (code, save = true) => {
  const c = CURRENCIES.find(x => x.code === code);
  if (c) currentCurrency = c;
  const sel = document.getElementById('currency-select');
  if (sel) sel.value = code;
  if (save) savePreferences();
  renderAll();
};

// ── CUSTOM CATEGORIES ─────────────────────────────────────────
function allCategories() {
  const defaults = ['🍔 Food','🚌 Transport','🏠 Housing','🎬 Entertainment','💊 Health','🛍️ Shopping','⚡ Utilities','💼 Salary','📦 Other'];
  return [...defaults, ...customCategories.map(c => `${c.icon} ${c.name}`)];
}

function populateCategorySelect() {
  const sel = document.getElementById('tx-cat');
  if (!sel) return;
  sel.innerHTML = allCategories().map(c => `<option>${c}</option>`).join('');
}

window.addCustomCategory = async () => {
  const icon = document.getElementById('new-cat-icon').value.trim() || '📌';
  const name = document.getElementById('new-cat-name').value.trim();
  if (!name) return;
  customCategories.push({ icon, name });
  document.getElementById('new-cat-icon').value = '';
  document.getElementById('new-cat-name').value = '';
  await savePreferences();
  renderCustomCats();
  populateCategorySelect();
};

window.removeCustomCategory = async (idx) => {
  customCategories.splice(idx, 1);
  await savePreferences();
  renderCustomCats();
  populateCategorySelect();
};

function renderCustomCats() {
  const el = document.getElementById('custom-cats-list');
  if (!el) return;
  el.innerHTML = customCategories.length === 0
    ? `<div style="font-size:13px;color:var(--text-muted);padding:8px 0">No custom categories yet</div>`
    : customCategories.map((c, i) => `
        <span class="cat-tag">${c.icon} ${c.name}
          <span class="cat-tag-remove" onclick="removeCustomCategory(${i})">×</span>
        </span>`).join('');
}

// ── ADMIN: FAMILY-WISE VIEW ───────────────────────────────────
window.showFamilyDetail = (familyId) => {
  const fam = allFamiliesData[familyId];
  const members = Object.entries(allUsersData).filter(([,u])=>u.familyId===familyId);
  const txs = Object.values(allTxData).filter(t=>t.familyId===familyId).sort((a,b)=>b.createdAt-a.createdAt);
  const income = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expenses = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

  const html = `
    <div style="margin-bottom:12px">
      <div style="font-size:16px;font-weight:600;margin-bottom:4px">👨‍👩‍👧 ${fam?.name||'Family'}</div>
      <div style="font-size:12px;color:var(--text-muted)">Invite code: ${fam?.inviteCode||'—'}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:var(--green-light);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:var(--text-muted)">Income</div>
        <div style="font-size:16px;font-weight:600;color:var(--green)">${fmt(income)}</div>
      </div>
      <div style="background:var(--red-light);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:var(--text-muted)">Expenses</div>
        <div style="font-size:16px;font-weight:600;color:var(--red)">${fmt(expenses)}</div>
      </div>
      <div style="background:var(--blue-light);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:var(--text-muted)">Members</div>
        <div style="font-size:16px;font-weight:600;color:var(--blue)">${members.length}</div>
      </div>
    </div>
    <div style="font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:6px">MEMBERS</div>
    ${members.map(([uid,m])=>`
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="width:28px;height:28px;border-radius:50%;background:${avatarColor(uid)}22;color:${avatarColor(uid)};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600">${initials(m.name)}</div>
        <span style="font-size:13px;flex:1">${m.name}</span>
        <span class="member-role-badge ${ROLE_COLORS[m.role]||''}">${m.role}</span>
      </div>`).join('')}
    <div style="font-size:12px;font-weight:500;color:var(--text-muted);margin:12px 0 6px">RECENT TRANSACTIONS</div>
    ${txs.slice(0,8).map(tx=>{
      const u = allUsersData[tx.userId];
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
        <div>
          <div style="font-weight:500">${tx.description}</div>
          <div style="font-size:11px;color:var(--text-muted)">${u?.name||'?'} · ${timeAgo(tx.createdAt)}</div>
        </div>
        <span style="font-weight:600;color:${tx.type==='income'?'var(--green)':'var(--red)'}">${tx.type==='income'?'+':'-'}${fmt(tx.amount)}</span>
      </div>`;
    }).join('') || '<div style="font-size:13px;color:var(--text-muted);padding:8px 0">No transactions</div>'}
  `;

  document.getElementById('sa-family-detail-content').innerHTML = html;
  document.getElementById('sa-family-detail').style.display = 'block';
};

window.closeFamilyDetail = () => {
  document.getElementById('sa-family-detail').style.display = 'none';
};
