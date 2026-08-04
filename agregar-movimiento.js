/* ============================================================
   FARO — Agregar movimiento
   ============================================================ */

const CATEGORIES = {
  expense: ['Comida', 'Transporte', 'Vivienda', 'Suscripciones', 'Ocio', 'Salud', 'Otro'],
  income: ['Venta óptica', 'Sueldo', 'Extra', 'Otro']
};

let currentType = 'expense';
let selectedCategory = null;
let userId = null;
let editingId = null;

const amountInput = document.getElementById('amount-input');
const amountPrefix = document.getElementById('amount-prefix');
const descriptionInput = document.getElementById('description-input');
const dateInput = document.getElementById('date-input');
const categoryGrid = document.getElementById('category-grid');
const saveBtn = document.getElementById('save-btn');
const saveCta = document.getElementById('save-cta');
const formMessage = document.getElementById('form-message');
const typeExpenseBtn = document.getElementById('type-expense');
const typeIncomeBtn = document.getElementById('type-income');

function renderCategories() {
  categoryGrid.innerHTML = CATEGORIES[currentType].map(cat => `
    <button type="button" class="category-chip ${cat === selectedCategory ? 'selected' : ''}" data-category="${cat}">
      ${cat}
    </button>
  `).join('');
}

function setType(type) {
  currentType = type;
  selectedCategory = null;

  typeExpenseBtn.classList.toggle('active', type === 'expense');
  typeIncomeBtn.classList.toggle('active', type === 'income');

  amountInput.classList.toggle('income', type === 'income');
  amountPrefix.classList.toggle('income', type === 'income');
  saveCta.classList.toggle('income', type === 'income');

  renderCategories();
  validateForm();
}

function getRawAmount() {
  return Number(amountInput.dataset.raw || 0);
}

function handleAmountInput() {
  const digits = amountInput.value.replace(/\D/g, '');
  const num = digits ? parseInt(digits, 10) : 0;
  amountInput.value = digits ? num.toLocaleString('es-AR') : '';
  amountInput.dataset.raw = String(num);
  validateForm();
}

function validateForm() {
  const amount = getRawAmount();
  const description = descriptionInput.value.trim();
  const valid = amount > 0 && description.length > 0;

  saveBtn.disabled = !valid;
  saveCta.disabled = !valid;

  const amountLabel = amount > 0 ? formatCurrency(amount) : '';
  saveCta.textContent = amountLabel ? `Guardar ${amountLabel}` : 'Guardar';
}

typeExpenseBtn.addEventListener('click', () => setType('expense'));
typeIncomeBtn.addEventListener('click', () => setType('income'));

categoryGrid.addEventListener('click', (e) => {
  const chip = e.target.closest('.category-chip');
  if (!chip) return;
  selectedCategory = chip.dataset.category;
  renderCategories();
});

amountInput.addEventListener('input', handleAmountInput);
descriptionInput.addEventListener('input', validateForm);

document.getElementById('cancel-btn').addEventListener('click', () => {
  window.location.href = editingId ? 'movimientos.html' : 'index.html';
});

async function saveMovement() {
  const amount = getRawAmount();
  const description = descriptionInput.value.trim();
  const occurredOn = dateInput.value;

  saveBtn.disabled = true;
  saveCta.disabled = true;
  formMessage.textContent = '';

  const payload = {
    type: currentType,
    description,
    category: selectedCategory,
    amount,
    occurred_on: occurredOn
  };

  const action = editingId
    ? supabaseClient.from('transactions').update(payload).eq('id', editingId)
    : supabaseClient.from('transactions').insert({ ...payload, user_id: userId });

  const { error } = await action;

  if (error) {
    formMessage.textContent = 'No se pudo guardar. Probá de nuevo.';
    saveBtn.disabled = false;
    saveCta.disabled = false;
    return;
  }

  window.location.href = editingId ? 'movimientos.html' : 'index.html';
}

saveBtn.addEventListener('click', saveMovement);
saveCta.addEventListener('click', saveMovement);

async function init() {
  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;

  const params = new URLSearchParams(window.location.search);
  editingId = params.get('id');

  const today = new Date().toISOString().slice(0, 10);
  dateInput.value = today;

  if (editingId) {
    document.querySelector('.sheet-title').textContent = 'EDITAR MOVIMIENTO';

    const { data: tx, error } = await supabaseClient
      .from('transactions')
      .select('type, description, category, amount, occurred_on')
      .eq('id', editingId)
      .maybeSingle();

    if (error || !tx) {
      formMessage.textContent = 'No se pudo cargar el movimiento.';
      renderCategories();
      return;
    }

    currentType = tx.type;
    selectedCategory = tx.category;
    descriptionInput.value = tx.description;
    dateInput.value = tx.occurred_on;

    const amountNum = Number(tx.amount);
    amountInput.value = amountNum.toLocaleString('es-AR');
    amountInput.dataset.raw = String(amountNum);

    typeExpenseBtn.classList.toggle('active', currentType === 'expense');
    typeIncomeBtn.classList.toggle('active', currentType === 'income');
    amountInput.classList.toggle('income', currentType === 'income');
    amountPrefix.classList.toggle('income', currentType === 'income');
    saveCta.classList.toggle('income', currentType === 'income');
  }

  renderCategories();
  validateForm();
}

init();
