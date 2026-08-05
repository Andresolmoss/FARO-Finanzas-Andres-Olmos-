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
  const isIncome = tx.type === 'income';
  const amountText = (isIncome ? '+' : '-') + formatCurrency(Math.abs(tx.amount));

  return `
    <div class="movement-row" data-id="${tx.id}">
      <div style="display:flex;align-items:center;gap:14px;padding:14px 0">
        <div class="movement-icon">${mono}</div>
        <div class="movement-info">
          <div class="movement-name">${escapeHtml(tx.description)}</div>
          <div class="movement-category">${escapeHtml(tx.category || '')}</div>
        </div>
        <div class="movement-amount ${isIncome ? 'income' : 'expense'} tabular" style="flex-shrink:0">${amountText}</div>
      </div>
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

async function loadMovements() {
  const session = await requireSession();
  if (!session) return;

  const { data, error } = await supabaseClient
    .from('transactions')
    .select('id, type, description, category, amount, occurred_on')
    .eq('user_id', session.user.id)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando movimientos:', error);
    return;
  }

  allTransactions = data;
  render();
}

renderNav('movimientos');
initFab();
loadMovements();
