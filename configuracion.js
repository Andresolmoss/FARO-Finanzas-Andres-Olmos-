/* ============================================================
   FARO — Configuración (categorías + ingresos fijos)
   ============================================================ */

let userId = null;
let expenseCategories = [];
let incomeCategories = [];
let fixedIncomes = [];

const expenseListEl = document.getElementById('expense-categories-list');
const incomeListEl = document.getElementById('income-categories-list');
const fixedIncomesListEl = document.getElementById('fixed-incomes-list');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- Categorías ---------- */

function renderCategoryList(el, list) {
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-row">Todavía no hay categorías acá.</div>';
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="list-item" data-id="${c.id}">
      <span class="list-item-label">${escapeHtml(c.name)}</span>
      <button class="remove-btn" data-remove-category="${c.id}" aria-label="Eliminar">×</button>
    </div>
  `).join('');
}

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('id, name, type')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando categorías:', error);
    return;
  }

  expenseCategories = data.filter(c => c.type === 'expense');
  incomeCategories = data.filter(c => c.type === 'income');
  renderCategoryList(expenseListEl, expenseCategories);
  renderCategoryList(incomeListEl, incomeCategories);
}

async function addCategory(type, name) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { data, error } = await supabaseClient
    .from('categories')
    .insert({ user_id: userId, name: trimmed, type })
    .select('id, name, type')
    .single();

  if (error) {
    console.error('Error agregando categoría:', error);
    alert('No se pudo agregar la categoría. Probá de nuevo.');
    return;
  }

  if (type === 'expense') {
    expenseCategories.push(data);
    renderCategoryList(expenseListEl, expenseCategories);
  } else {
    incomeCategories.push(data);
    renderCategoryList(incomeListEl, incomeCategories);
  }
}

async function removeCategory(id) {
  const confirmed = confirm('¿Eliminar esta categoría? Los movimientos que ya la usan van a conservar el nombre, pero no vas a poder elegirla de nuevo.');
  if (!confirmed) return;

  const { error } = await supabaseClient.from('categories').delete().eq('id', id);
  if (error) {
    console.error('Error eliminando categoría:', error);
    alert('No se pudo eliminar. Probá de nuevo.');
    return;
  }

  expenseCategories = expenseCategories.filter(c => c.id !== id);
  incomeCategories = incomeCategories.filter(c => c.id !== id);
  renderCategoryList(expenseListEl, expenseCategories);
  renderCategoryList(incomeListEl, incomeCategories);
}

document.getElementById('add-expense-category-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-expense-category');
  await addCategory('expense', input.value);
  input.value = '';
});

document.getElementById('add-income-category-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-income-category');
  await addCategory('income', input.value);
  input.value = '';
});

document.body.addEventListener('click', (e) => {
  const removeId = e.target.closest('[data-remove-category]');
  if (removeId) removeCategory(removeId.dataset.removeCategory);
});

/* ---------- Ingresos fijos ---------- */

function renderFixedIncomes() {
  if (fixedIncomes.length === 0) {
    fixedIncomesListEl.innerHTML = '<div class="empty-row">Todavía no cargaste ingresos fijos.</div>';
    return;
  }
  fixedIncomesListEl.innerHTML = fixedIncomes.map(fi => `
    <div class="list-item" data-id="${fi.id}">
      <span class="list-item-label">${escapeHtml(fi.name)}</span>
      <div class="list-item-right">
        <span class="list-item-amount tabular">${formatCurrency(fi.amount)}</span>
        <button class="remove-btn" data-remove-fixed-income="${fi.id}" aria-label="Eliminar">×</button>
      </div>
    </div>
  `).join('');
}

async function loadFixedIncomes() {
  const { data, error } = await supabaseClient
    .from('fixed_incomes')
    .select('id, name, amount')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando ingresos fijos:', error);
    return;
  }

  fixedIncomes = data;
  renderFixedIncomes();
}

async function addFixedIncome(name, amountRaw) {
  const trimmedName = name.trim();
  const digits = amountRaw.replace(/\D/g, '');
  const amount = digits ? parseInt(digits, 10) : 0;

  if (!trimmedName || amount <= 0) {
    alert('Ingresá un nombre y un monto mayor a cero.');
    return;
  }

  const { data, error } = await supabaseClient
    .from('fixed_incomes')
    .insert({ user_id: userId, name: trimmedName, amount })
    .select('id, name, amount')
    .single();

  if (error) {
    console.error('Error agregando ingreso fijo:', error);
    alert('No se pudo agregar. Probá de nuevo.');
    return;
  }

  fixedIncomes.push(data);
  renderFixedIncomes();
}

async function removeFixedIncome(id) {
  const confirmed = confirm('¿Eliminar este ingreso fijo?');
  if (!confirmed) return;

  const { error } = await supabaseClient.from('fixed_incomes').delete().eq('id', id);
  if (error) {
    console.error('Error eliminando ingreso fijo:', error);
    alert('No se pudo eliminar. Probá de nuevo.');
    return;
  }

  fixedIncomes = fixedIncomes.filter(fi => fi.id !== id);
  renderFixedIncomes();
}

document.getElementById('add-fixed-income-btn').addEventListener('click', async () => {
  const nameInput = document.getElementById('new-fixed-income-name');
  const amountInput = document.getElementById('new-fixed-income-amount');
  await addFixedIncome(nameInput.value, amountInput.value);
  nameInput.value = '';
  amountInput.value = '';
});

document.getElementById('new-fixed-income-amount').addEventListener('input', (e) => {
  const digits = e.target.value.replace(/\D/g, '');
  e.target.value = digits ? Number(digits).toLocaleString('es-AR') : '';
});

document.body.addEventListener('click', (e) => {
  const removeId = e.target.closest('[data-remove-fixed-income]');
  if (removeId) removeFixedIncome(removeId.dataset.removeFixedIncome);
});

/* ---------- Init ---------- */

async function init() {
  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;

  await loadCategories();
  await loadFixedIncomes();
}

renderNav('configuracion');
init();
