/* ============================================================
   FARO — Movimientos
   ============================================================ */

let allTransactions = [];
let currentFilter = 'all';
let selectedTxId = null;

const container = document.getElementById('movements-container');
const emptyState = document.getElementById('empty-state');
const overlay = document.getElementById('edit-overlay');
const panelTitle = document.getElementById('edit-panel-title');
const panelAmount = document.getElementById('edit-panel-amount');

function groupByDate(transactions) {
  const groups = [];
  const map = new Map();

  transactions.forEach(tx => {
    const label = formatGroupLabel(tx.occurred_on);
    if (!map.has(label)) {
      const group = { label, items: [] };
      map.set(label, group);
      groups.push(group);
    }
    map.get(label).items.push(tx);
  });

  return groups;
}

function formatGroupLabel(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}

function render() {
  const filtered = currentFilter === 'all'
    ? allTransactions
    : allTransactions.filter(tx => tx.type === currentFilter);

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  const groups = groupByDate(filtered);

  container.innerHTML = groups.map(group => `
    <div class="group-date">${group.label}</div>
    ${group.items.map(tx => rowHtml(tx)).join('')}
  `).join('');
}

function rowHtml(tx) {
  const mono = categoryMono(tx.category || tx.description);
  const color = categoryColor(tx.category || tx.description);
  const isIncome = tx.type === 'income';
  const amountText = (isIncome ? '+' : '-') + formatCurrency(Math.abs(tx.amount));
  const categoryLabel = categoryLabelText(tx.category);
  const paymentIcon = paymentIconName(tx.payment_method);

  return `
    <div class="movement-row" data-id="${tx.id}">
      <div class="movement-icon" style="background:${hexToRgba(color, 0.18)};color:${color}">${mono}</div>
      <div class="movement-info">
        <div class="movement-name">${escapeHtml(tx.description)}</div>
        ${categoryLabel ? `<span class="category-badge" style="background:${hexToRgba(color, 0.14)};color:${color}"><span class="category-dot" style="background:${color}"></span>${escapeHtml(categoryLabel)}</span>` : ''}
      </div>
      <div class="movement-payment">
        ${tx.payment_method ? `${iconSvg(paymentIcon, 15)}<span>${escapeHtml(tx.payment_method)}</span>` : ''}
      </div>
      <div class="movement-amount ${isIncome ? 'income' : 'expense'} tabular" style="flex-shrink:0">${amountText}</div>
      <svg class="movement-chevron" width="7" height="12" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

container.addEventListener('click', (e) => {
  const row = e.target.closest('.movement-row');
  if (!row) return;
  openEditPanel(row.dataset.id);
});

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    render();
  });
});

function openEditPanel(id) {
  selectedTxId = id;
  const tx = allTransactions.find(t => t.id === id);
  if (!tx) return;

  panelTitle.textContent = tx.description;
  const isIncome = tx.type === 'income';
  panelAmount.textContent = (isIncome ? '+' : '-') + formatCurrency(Math.abs(tx.amount));
  overlay.classList.add('open');
}

function closeEditPanel() {
  overlay.classList.remove('open');
  selectedTxId = null;
}

document.getElementById('cancel-edit-btn').addEventListener('click', closeEditPanel);

document.getElementById('edit-btn').addEventListener('click', () => {
  if (!selectedTxId) return;
  window.location.href = `agregar-movimiento.html?id=${selectedTxId}`;
});

document.getElementById('delete-btn').addEventListener('click', async () => {
  if (!selectedTxId) return;
  const confirmed = confirm('¿Eliminar este movimiento? No se puede deshacer.');
  if (!confirmed) return;

  const { error } = await supabaseClient.from('transactions').delete().eq('id', selectedTxId);
  if (error) {
    alert('No se pudo eliminar. Probá de nuevo.');
    return;
  }

  allTransactions = allTransactions.filter(t => t.id !== selectedTxId);
  closeEditPanel();
  render();
});

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeEditPanel();
});

function renderSummary(transactions) {
  const now = new Date();
  const isSameMonth = (dateStr, month, year) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  };

  const thisMonthTx = transactions.filter(tx => isSameMonth(tx.occurred_on, now.getMonth(), now.getFullYear()));
  const thisMonthExpense = thisMonthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + Number(tx.amount), 0);

  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthTx = transactions.filter(tx => isSameMonth(tx.occurred_on, prevDate.getMonth(), prevDate.getFullYear()));
  const prevMonthExpense = prevMonthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + Number(tx.amount), 0);

  document.getElementById('summary-amount').textContent = formatCurrency(thisMonthExpense);

  const deltaEl = document.getElementById('summary-delta');
  if (prevMonthExpense > 0) {
    const pct = Math.round(((thisMonthExpense - prevMonthExpense) / prevMonthExpense) * 100);
    const arrow = pct >= 0 ? '↑' : '↓';
    deltaEl.textContent = `${arrow} ${Math.abs(pct)}% vs. mes anterior`;
    deltaEl.className = 'summary-delta ' + (pct >= 0 ? 'expense' : 'income');
    deltaEl.style.display = 'inline-block';
  } else {
    deltaEl.style.display = 'none';
  }

  // Sparkline: gasto diario de los últimos 14 días
  const days = 14;
  const dayValues = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const total = transactions
      .filter(tx => tx.type === 'expense' && tx.occurred_on === key)
      .reduce((s, tx) => s + Number(tx.amount), 0);
    dayValues.push(total);
  }
  const max = Math.max(...dayValues, 1);
  const normalized = dayValues.map(v => 0.08 + (v / max) * 0.84);
  document.getElementById('summary-chart-line').setAttribute('d', smoothPath(normalized, 320, 80));

  const countEl = document.getElementById('summary-count-value');
  const hintEl = document.getElementById('summary-count-hint');
  countEl.textContent = `${transactions.length} movimiento${transactions.length === 1 ? '' : 's'}`;
  if (transactions.length > 0) {
    const dates = transactions.map(tx => new Date(tx.occurred_on).getTime());
    const spanDays = Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000) + 1);
    hintEl.textContent = `en ${spanDays} día${spanDays === 1 ? '' : 's'}`;
  } else {
    hintEl.textContent = '';
  }
}

async function loadMovements() {
  const session = await requireSession();
  if (!session) return;

  const { data, error } = await supabaseClient
    .from('transactions')
    .select('id, type, description, category, amount, occurred_on, payment_method')
    .eq('user_id', session.user.id)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando movimientos:', error);
    return;
  }

  allTransactions = data;
  renderSummary(allTransactions);
  render();
}

renderNav('movimientos');
initFab();
loadMovements();
