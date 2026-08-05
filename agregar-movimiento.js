/* ============================================================
   FARO — Agregar / Editar movimiento
   ============================================================ */

const DEFAULT_CATEGORIES = [
  { name: '🍔 Comida', type: 'expense' },
  { name: '🚗 Transporte', type: 'expense' },
  { name: '⛽ Combustible', type: 'expense' },
  { name: '🏠 Vivienda', type: 'expense' },
  { name: '📺 Suscripciones', type: 'expense' },
  { name: '🎮 Ocio', type: 'expense' },
  { name: '🩺 Salud', type: 'expense' },
  { name: '💸 Otro gasto', type: 'expense' },
  { name: '💰 Sueldo', type: 'income' },
  { name: '💵 Otro ingreso', type: 'income' }
];

let userId = null;
let currentType = 'expense';
let rawAmount = 0; // en pesos, sin decimales
let categories = []; // [{id, name, type}]
let selectedCategory = null;
let paymentMethods = []; // [{id, name}]
let selectedPaymentMethod = null;
let editingId = null; // id del movimiento si estamos editando

const amountInput = document.getElementById('amount-input');
const chipRow = document.getElementById('chip-row');
const paymentChipRow = document.getElementById('payment-chip-row');
const titleInput = document.getElementById('title-input');
const notesInput = document.getElementById('notes-input');
const dateInput = document.getElementById('date-input');
const dateDisplay = document.getElementById('date-display');
const saveBtn = document.getElementById('save-btn');
const saveTopBtn = document.getElementById('save-top-btn');
const cancelBtn = document.getElementById('cancel-btn');
const topbarLabel = document.getElementById('topbar-label');
const formError = document.getElementById('form-error');

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function updateAmountDisplay() {
  const sign = currentType === 'expense' ? '-' : '+';
  amountInput.value = `${sign}$${rawAmount.toLocaleString('es-AR')}`;
  amountInput.classList.remove('expense', 'income');
  amountInput.classList.add(currentType);
  saveBtn.textContent = `Guardar $${rawAmount.toLocaleString('es-AR')}`;
  saveBtn.classList.remove('expense', 'income');
  saveBtn.classList.add(currentType);
}

amountInput.addEventListener('input', () => {
  const digits = amountInput.value.replace(/\D/g, '');
  rawAmount = digits ? parseInt(digits, 10) : 0;
  updateAmountDisplay();
});

amountInput.addEventListener('focus', () => {
  // Coloca el cursor al final para que se siga escribiendo de derecha a izquierda
  requestAnimationFrame(() => {
    amountInput.setSelectionRange(amountInput.value.length, amountInput.value.length);
  });
});

function setType(type) {
  currentType = type;
  document.querySelectorAll('.type-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.type === type);
  });
  selectedCategory = null;
  renderChips();
  updateAmountDisplay();
}

document.querySelectorAll('.type-tab').forEach(tab => {
  tab.addEventListener('click', () => setType(tab.dataset.type));
});

function renderChips() {
  const list = categories.filter(c => c.type === currentType);
  chipRow.innerHTML = list.map(c => `
    <button type="button" class="chip ${c.id === selectedCategory ? 'selected' : ''}" data-id="${c.id}">${escapeHtml(c.name)}</button>
  `).join('');
}

chipRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  selectedCategory = chip.dataset.id;
  renderChips();
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderPaymentChips() {
  paymentChipRow.innerHTML = paymentMethods.map(pm => `
    <button type="button" class="chip ${pm.id === selectedPaymentMethod ? 'selected' : ''}" data-payment-id="${pm.id}">${escapeHtml(pm.name)}</button>
  `).join('');
}

paymentChipRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  selectedPaymentMethod = chip.dataset.paymentId;
  renderPaymentChips();
});

async function loadPaymentMethods() {
  const { data, error } = await supabaseClient
    .from('payment_methods')
    .select('id, name')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando métodos de pago:', error);
    paymentMethods = [];
    return;
  }

  if (data.length === 0) {
    const defaults = ['Efectivo', 'Débito', 'Crédito', 'Transferencia'].map(name => ({ user_id: userId, name }));
    const { data: inserted, error: insertError } = await supabaseClient
      .from('payment_methods')
      .insert(defaults)
      .select('id, name');

    if (insertError) {
      console.error('Error creando métodos de pago por defecto:', insertError);
      paymentMethods = [];
      return;
    }
    paymentMethods = inserted;
  } else {
    paymentMethods = data;
  }
}

// Fecha
dateInput.addEventListener('change', () => {
  updateDateDisplay(dateInput.value);
});

function updateDateDisplay(isoDate) {
  const today = todayISO();
  if (isoDate === today) {
    dateDisplay.textContent = 'Hoy';
  } else {
    const d = new Date(isoDate + 'T00:00:00');
    dateDisplay.textContent = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  }
}

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('id, name, type')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando categorías:', error);
    categories = [];
    return;
  }

  if (data.length === 0) {
    const seed = DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: userId }));
    const { data: inserted, error: insertError } = await supabaseClient
      .from('categories')
      .insert(seed)
      .select('id, name, type');

    if (insertError) {
      console.error('Error creando categorías por defecto:', insertError);
      categories = [];
      return;
    }
    categories = inserted;
  } else {
    categories = data;
  }
}

async function loadForEdit(id) {
  const { data, error } = await supabaseClient
    .from('transactions')
    .select('id, type, description, notes, category, amount, occurred_on, payment_method')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    console.error('No se pudo cargar el movimiento a editar:', error);
    return;
  }

  editingId = data.id;
  topbarLabel.textContent = 'EDITAR MOVIMIENTO';
  setType(data.type);
  rawAmount = Math.round(Number(data.amount));
  updateAmountDisplay();
  titleInput.value = data.description || '';
  notesInput.value = data.notes || '';
  dateInput.value = data.occurred_on;
  updateDateDisplay(data.occurred_on);

  // Si la categoría del movimiento no está en la lista (categoría vieja o borrada), la agregamos como opción temporal
  const match = categories.find(c => c.name === data.category && c.type === data.type);
  if (match) {
    selectedCategory = match.id;
  } else if (data.category) {
    const tempId = 'temp-' + data.category;
    categories.push({ id: tempId, name: data.category, type: data.type });
    selectedCategory = tempId;
  }
  renderChips();

  const paymentMatch = paymentMethods.find(pm => pm.name === data.payment_method);
  if (paymentMatch) {
    selectedPaymentMethod = paymentMatch.id;
  } else if (data.payment_method) {
    const tempPaymentId = 'temp-' + data.payment_method;
    paymentMethods.push({ id: tempPaymentId, name: data.payment_method });
    selectedPaymentMethod = tempPaymentId;
  }
  renderPaymentChips();
}

function validate() {
  if (rawAmount <= 0) return 'Ingresá un monto mayor a cero.';
  if (!selectedCategory) return 'Elegí una categoría.';
  if (!titleInput.value.trim()) return 'Agregá un título.';
  return null;
}

async function save() {
  const errorMsg = validate();
  if (errorMsg) {
    formError.textContent = errorMsg;
    return;
  }
  formError.textContent = '';
  saveBtn.disabled = true;
  saveTopBtn.disabled = true;

  const categoryObj = categories.find(c => c.id === selectedCategory);
  const paymentObj = paymentMethods.find(pm => pm.id === selectedPaymentMethod);
  const payload = {
    user_id: userId,
    type: currentType,
    description: titleInput.value.trim(),
    notes: notesInput.value.trim() || null,
    category: categoryObj ? categoryObj.name : null,
    payment_method: paymentObj ? paymentObj.name : null,
    amount: rawAmount,
    occurred_on: dateInput.value || todayISO()
  };

  let error;
  if (editingId) {
    ({ error } = await supabaseClient.from('transactions').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabaseClient.from('transactions').insert(payload));
  }

  if (error) {
    console.error('Error guardando movimiento:', error);
    formError.textContent = 'No se pudo guardar. Probá de nuevo.';
    saveBtn.disabled = false;
    saveTopBtn.disabled = false;
    return;
  }

  window.location.href = 'movimientos.html';
}

saveBtn.addEventListener('click', save);
saveTopBtn.addEventListener('click', save);
cancelBtn.addEventListener('click', () => {
  window.location.href = 'movimientos.html';
});

async function init() {
  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;

  dateInput.value = todayISO();
  updateDateDisplay(dateInput.value);
  updateAmountDisplay();

  await loadCategories();
  renderChips();

  await loadPaymentMethods();
  renderPaymentChips();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) {
    await loadForEdit(id);
  }
}

renderNav('');
init();
