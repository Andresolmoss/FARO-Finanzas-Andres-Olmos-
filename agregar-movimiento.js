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

const amountInput = document.getElementById('amount-input');
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
  saveCta.classList.toggle('income', type === 'income');

  renderCategories();
  validateForm();
}

function validateForm() {
  const amount = parseFloat(amountInput.value);
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

amountInput.addEventListener('input', validateForm);
descriptionInput.addEventListener('input', validateForm);

document.getElementById('cancel-btn').addEventListener('click', () => {
  window.location.href = 'index.html';
});

async function saveMovement() {
  const amount = parseFloat(amountInput.value);
  const description = descriptionInput.value.trim();
  const occurredOn = dateInput.value;

  saveBtn.disabled = true;
  saveCta.disabled = true;
  formMessage.textContent = '';

  const { error } = await supabaseClient.from('transactions').insert({
    user_id: userId,
    type: currentType,
    description,
    category: selectedCategory,
    amount,
    occurred_on: occurredOn
  });

  if (error) {
    formMessage.textContent = 'No se pudo guardar. Probá de nuevo.';
    saveBtn.disabled = false;
    saveCta.disabled = false;
    return;
  }

  window.location.href = 'index.html';
}

saveBtn.addEventListener('click', saveMovement);
saveCta.addEventListener('click', saveMovement);

async function init() {
  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;

  const today = new Date().toISOString().slice(0, 10);
  dateInput.value = today;

  renderCategories();
}

init();
