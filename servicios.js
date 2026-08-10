/* ============================================================
   FARO — Servicios (gastos fijos)
   ============================================================ */

let userId = null;
let services = [];        // [{id, name, provider, category, due_day, estimated_amount, active, category_id, categories:{name}}]
let paymentsThisPeriod = {}; // { service_id: {id, amount_paid, paid_date, status} }
let expenseCategories = [];  // [{id, name}]
let paymentMethods = [];     // [{id, name}]

let currentServiceId = null;   // servicio seleccionado para el bottom sheet de opciones
let editingServiceId = null;   // servicio en edición (form-overlay), null = alta nueva
let selectedPayMethodId = null;
let rawPayAmount = 0;
let rawFormAmount = 0;
let viewPeriod = null;         // período (YYYY-MM) que se está mostrando en la lista
let statusFilter = 'all';      // 'all' | 'pendiente' | 'pagado'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function currentPeriodKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function dueDateForPeriod(dueDay, periodKey) {
  if (!dueDay) return null;
  const [year, month] = periodKey.split('-').map(Number);
  const dim = daysInMonth(year, month);
  const day = Math.min(dueDay, dim);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDayOfPeriod(periodKey) {
  const [year, month] = periodKey.split('-').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
}

function shiftPeriod(periodKey, delta) {
  const [year, month] = periodKey.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodLabel(periodKey) {
  const [year, month] = periodKey.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Formatea un input de monto en vivo con separador de miles (es-AR),
// dejando solo dígitos guardados internamente.
function attachThousandsFormatting(inputEl) {
  inputEl.addEventListener('input', () => {
    const digits = inputEl.value.replace(/\D/g, '');
    inputEl.value = digits ? Number(digits).toLocaleString('es-AR') : '';
  });
}

function formatThousands(n) {
  return n ? Number(n).toLocaleString('es-AR') : '';
}

// ---------- Carga de datos ----------

async function loadServices() {
  const { data, error } = await supabaseClient
    .from('services')
    .select('id, name, provider, category, due_day, estimated_amount, active, category_id, categories(name)')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando servicios:', error);
    services = [];
    return;
  }
  services = data || [];
}

async function loadPaymentsForPeriod(period) {
  const { data, error } = await supabaseClient
    .from('service_payments')
    .select('id, service_id, amount_paid, paid_date, status')
    .eq('user_id', userId)
    .eq('period', period);

  if (error) {
    console.error('Error cargando pagos del período:', error);
    paymentsThisPeriod = {};
    return;
  }
  paymentsThisPeriod = {};
  (data || []).forEach(p => { paymentsThisPeriod[p.service_id] = p; });
}

async function loadExpenseCategories() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando categorías:', error);
    expenseCategories = [];
    return;
  }
  expenseCategories = data || [];
}

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
  paymentMethods = data || [];
}

// ---------- Indicadores ----------

function renderMonthNav() {
  document.getElementById('month-label').textContent = periodLabel(viewPeriod);
  document.getElementById('month-next-btn').disabled = viewPeriod === currentPeriodKey();
}

function renderIndicators() {
  const isCurrent = viewPeriod === currentPeriodKey();

  const comprometido = services.reduce((sum, s) => {
    const payment = paymentsThisPeriod[s.id];
    return sum + (payment ? Number(payment.amount_paid) : (Number(s.estimated_amount) || 0));
  }, 0);
  document.getElementById('ind-comprometido').textContent = formatCurrency(comprometido);
  document.getElementById('ind-label-1').textContent = isCurrent ? 'Comprometido este mes' : 'Comprometido';

  const pendientes = services.filter(s => !paymentsThisPeriod[s.id]);
  document.getElementById('ind-pendientes').textContent = pendientes.length;

  const nombreEl = document.getElementById('ind-proximo-nombre');
  const fechaEl = document.getElementById('ind-proximo-fecha');
  const labelEl = document.getElementById('ind-label-3');

  if (isCurrent) {
    labelEl.textContent = 'Próximo vencimiento';
    const today = new Date().getDate();
    let proximo = null;
    let proximoDias = Infinity;
    pendientes.forEach(s => {
      if (!s.due_day) return;
      const dias = s.due_day >= today ? s.due_day - today : (s.due_day + 30 - today);
      if (dias < proximoDias) {
        proximoDias = dias;
        proximo = s;
      }
    });
    if (proximo) {
      nombreEl.textContent = proximo.name;
      fechaEl.textContent = `Vence día ${proximo.due_day}`;
    } else {
      nombreEl.textContent = '—';
      fechaEl.textContent = '';
    }
  } else {
    labelEl.textContent = 'Pagado ese mes';
    const totalPagado = services.reduce((sum, s) => {
      const payment = paymentsThisPeriod[s.id];
      return sum + (payment ? Number(payment.amount_paid) : 0);
    }, 0);
    nombreEl.textContent = formatCurrency(totalPagado);
    fechaEl.textContent = `${services.length - pendientes.length} de ${services.length} pagados`;
  }
}

// ---------- Lista de servicios ----------

function renderServicesList() {
  const container = document.getElementById('services-list');
  const emptyState = document.getElementById('empty-state');

  const filtered = services.filter(s => {
    if (statusFilter === 'all') return true;
    const isPagado = !!paymentsThisPeriod[s.id];
    return statusFilter === 'pagado' ? isPagado : !isPagado;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    emptyState.textContent = services.length === 0
      ? 'Todavía no cargaste servicios. Usá el botón + para agregar el primero.'
      : 'No hay servicios que coincidan con este filtro.';
    return;
  }
  emptyState.style.display = 'none';

  container.innerHTML = filtered.map(s => {
    const payment = paymentsThisPeriod[s.id];
    const isPagado = !!payment;
    const mono = categoryMono(s.categories ? s.categories.name : s.name);
    const color = categoryColor(s.categories ? s.categories.name : s.name);
    const amount = isPagado ? Number(payment.amount_paid) : Number(s.estimated_amount || 0);
    const sub = s.provider ? `${escapeHtml(s.provider)}${s.due_day ? ' · vence ~día ' + s.due_day : ''}` : (s.due_day ? `Vence ~día ${s.due_day}` : '');

    return `
      <div class="service-row" data-id="${s.id}">
        <div class="service-icon" style="background:${hexToRgba(color, 0.18)};color:${color}">${mono}</div>
        <div class="service-main">
          <div class="service-name">${escapeHtml(s.name)}</div>
          <div class="service-sub">${sub}</div>
        </div>
        <div class="service-right">
          <div class="service-amount">${amount ? formatCurrency(amount) : '—'}</div>
          <div class="service-badge ${isPagado ? 'pagado' : 'pendiente'}">${isPagado ? 'Pagado' : 'Pendiente'}</div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.service-row').forEach(row => {
    row.addEventListener('click', () => openOptionsSheet(row.dataset.id));
  });
}

// ---------- Bottom sheet: opciones ----------

function openOptionsSheet(serviceId) {
  currentServiceId = serviceId;
  const s = services.find(x => x.id === serviceId);
  if (!s) return;
  const payment = paymentsThisPeriod[serviceId];
  const isCurrent = viewPeriod === currentPeriodKey();

  document.getElementById('options-title').textContent = s.name;
  document.getElementById('options-sub').textContent = payment
    ? `Pagado en ${periodLabel(viewPeriod)} (${formatCurrency(Number(payment.amount_paid))})`
    : (s.estimated_amount ? `Estimado: ${formatCurrency(Number(s.estimated_amount))}` : 'Sin monto estimado todavía');

  const btnPagar = document.getElementById('btn-marcar-pagado');
  if (payment) {
    btnPagar.textContent = 'Ya está pagado';
    btnPagar.disabled = true;
  } else if (!isCurrent) {
    btnPagar.textContent = 'Solo se puede marcar el mes actual';
    btnPagar.disabled = true;
  } else {
    btnPagar.textContent = 'Marcar como pagado';
    btnPagar.disabled = false;
  }
  btnPagar.style.opacity = btnPagar.disabled ? '0.5' : '1';

  document.getElementById('options-overlay').classList.add('open');
}

document.getElementById('btn-cancelar-opciones').addEventListener('click', () => {
  document.getElementById('options-overlay').classList.remove('open');
});

document.getElementById('btn-marcar-pagado').addEventListener('click', () => {
  document.getElementById('options-overlay').classList.remove('open');
  openPaySheet(currentServiceId);
});

document.getElementById('btn-editar-servicio').addEventListener('click', () => {
  document.getElementById('options-overlay').classList.remove('open');
  openFormSheet(currentServiceId);
});

document.getElementById('btn-eliminar-servicio').addEventListener('click', async () => {
  document.getElementById('options-overlay').classList.remove('open');
  const s = services.find(x => x.id === currentServiceId);
  if (!s) return;
  if (!confirm(`¿Eliminar "${s.name}"? Se borra también su historial de pagos.`)) return;

  const { error } = await supabaseClient.from('services').delete().eq('id', s.id).eq('user_id', userId);
  if (error) {
    console.error('Error eliminando servicio:', error);
    alert('No se pudo eliminar. Probá de nuevo.');
    return;
  }
  await refreshAll();
});

// ---------- Bottom sheet: marcar como pagado ----------

function renderPayMethodChips() {
  const row = document.getElementById('pay-method-chip-row');
  row.innerHTML = paymentMethods.map(pm => `
    <button type="button" class="chip ${pm.id === selectedPayMethodId ? 'selected' : ''}" data-id="${pm.id}">${escapeHtml(pm.name)}</button>
  `).join('');
}

document.getElementById('pay-method-chip-row').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  selectedPayMethodId = chip.dataset.id;
  renderPayMethodChips();
});

document.getElementById('pay-amount-input').addEventListener('input', (e) => {
  const digits = e.target.value.replace(/\D/g, '');
  rawPayAmount = digits ? parseInt(digits, 10) : 0;
  updatePayAmountDisplay();
});

document.getElementById('pay-amount-input').addEventListener('focus', () => {
  requestAnimationFrame(() => {
    const input = document.getElementById('pay-amount-input');
    input.setSelectionRange(input.value.length, input.value.length);
  });
});

function updatePayAmountDisplay() {
  document.getElementById('pay-amount-input').value = '$' + rawPayAmount.toLocaleString('es-AR');
}

function openPaySheet(serviceId) {
  currentServiceId = serviceId;
  const s = services.find(x => x.id === serviceId);
  if (!s) return;

  document.getElementById('pay-service-name').textContent = `Marcar "${s.name}" como pagado`;
  document.getElementById('pay-error').textContent = '';
  rawPayAmount = s.estimated_amount ? Math.round(Number(s.estimated_amount)) : 0;
  updatePayAmountDisplay();
  document.getElementById('pay-date-input').value = todayISO();
  selectedPayMethodId = paymentMethods.length ? paymentMethods[0].id : null;
  renderPayMethodChips();

  document.getElementById('pay-overlay').classList.add('open');
}

document.getElementById('btn-cancelar-pago').addEventListener('click', () => {
  document.getElementById('pay-overlay').classList.remove('open');
});

document.getElementById('btn-confirmar-pago').addEventListener('click', async () => {
  const errorEl = document.getElementById('pay-error');
  const s = services.find(x => x.id === currentServiceId);
  if (!s) return;

  const amount = rawPayAmount;
  const paidDate = document.getElementById('pay-date-input').value || todayISO();

  if (amount <= 0) { errorEl.textContent = 'Ingresá un monto mayor a cero.'; return; }
  if (!selectedPayMethodId) { errorEl.textContent = 'Elegí un método de pago.'; return; }

  errorEl.textContent = '';
  const btn = document.getElementById('btn-confirmar-pago');
  btn.disabled = true;

  const paymentMethodObj = paymentMethods.find(pm => pm.id === selectedPayMethodId);
  const categoryName = s.categories ? s.categories.name : null;
  const period = viewPeriod;

  // 1) Movimiento en Movimientos
  const { error: txError } = await supabaseClient.from('transactions').insert({
    user_id: userId,
    type: 'expense',
    description: s.name,
    notes: s.provider || null,
    category: categoryName,
    payment_method: paymentMethodObj ? paymentMethodObj.name : null,
    amount: amount,
    occurred_on: paidDate
  });

  if (txError) {
    console.error('Error creando movimiento:', txError);
    errorEl.textContent = 'No se pudo crear el movimiento. Probá de nuevo.';
    btn.disabled = false;
    return;
  }

  // 2) Registro en service_payments (upsert por servicio+período)
  const { error: payError } = await supabaseClient.from('service_payments').upsert({
    user_id: userId,
    service_id: s.id,
    period: period,
    amount_paid: amount,
    due_date: dueDateForPeriod(s.due_day, period),
    paid_date: paidDate,
    status: 'pagado'
  }, { onConflict: 'service_id,period' });

  if (payError) {
    console.error('Error guardando pago del servicio:', payError);
    errorEl.textContent = 'El movimiento se creó, pero no se pudo actualizar el estado del servicio.';
    btn.disabled = false;
    return;
  }

  // 3) Actualizar el monto estimado del servicio con el último real pagado
  await supabaseClient.from('services').update({ estimated_amount: amount }).eq('id', s.id).eq('user_id', userId);

  btn.disabled = false;
  document.getElementById('pay-overlay').classList.remove('open');
  await refreshAll();
});

// ---------- Bottom sheet: crear / editar servicio ----------

function renderCategorySelect(selectedId) {
  const select = document.getElementById('form-category-select');
  select.innerHTML = expenseCategories.map(c => `
    <option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>
  `).join('');
}

document.getElementById('form-amount-input').addEventListener('input', (e) => {
  const digits = e.target.value.replace(/\D/g, '');
  e.target.value = digits ? '$' + parseInt(digits, 10).toLocaleString('es-AR') : '';
});

function openFormSheet(serviceId) {
  editingServiceId = serviceId || null;
  const s = serviceId ? services.find(x => x.id === serviceId) : null;

  document.getElementById('form-title').textContent = s ? 'Editar servicio' : 'Nuevo servicio';
  document.getElementById('form-error').textContent = '';
  document.getElementById('form-name-input').value = s ? s.name : '';
  document.getElementById('form-provider-input').value = s && s.provider ? s.provider : '';
  document.getElementById('form-dueday-input').value = s && s.due_day ? s.due_day : '';
  document.getElementById('form-amount-input').value = s && s.estimated_amount ? '$' + Math.round(Number(s.estimated_amount)).toLocaleString('es-AR') : '';
  renderCategorySelect(s ? s.category_id : (expenseCategories[0] ? expenseCategories[0].id : null));

  document.getElementById('form-overlay').classList.add('open');
}

document.getElementById('add-service-btn').addEventListener('click', () => openFormSheet(null));
document.getElementById('btn-cancelar-form').addEventListener('click', () => {
  document.getElementById('form-overlay').classList.remove('open');
});

document.getElementById('btn-guardar-servicio').addEventListener('click', async () => {
  const errorEl = document.getElementById('form-error');
  const name = document.getElementById('form-name-input').value.trim();
  const provider = document.getElementById('form-provider-input').value.trim();
  const categoryId = document.getElementById('form-category-select').value || null;
  const dueDayRaw = document.getElementById('form-dueday-input').value;
  const dueDay = dueDayRaw ? parseInt(dueDayRaw, 10) : null;
  const amountRaw = document.getElementById('form-amount-input').value.replace(/\D/g, '');
  const amount = amountRaw ? parseInt(amountRaw, 10) : null;

  if (!name) { errorEl.textContent = 'Ingresá un nombre.'; return; }
  if (dueDay && (dueDay < 1 || dueDay > 31)) { errorEl.textContent = 'El día de vencimiento debe estar entre 1 y 31.'; return; }

  errorEl.textContent = '';
  const btn = document.getElementById('btn-guardar-servicio');
  btn.disabled = true;

  const payload = {
    name,
    provider: provider || null,
    category_id: categoryId,
    due_day: dueDay,
    estimated_amount: amount,
    active: true
  };

  let error;
  if (editingServiceId) {
    ({ error } = await supabaseClient.from('services').update(payload).eq('id', editingServiceId).eq('user_id', userId));
  } else {
    ({ error } = await supabaseClient.from('services').insert({ ...payload, user_id: userId, category: 'otro' }));
  }

  btn.disabled = false;
  if (error) {
    console.error('Error guardando servicio:', error);
    errorEl.textContent = 'No se pudo guardar. Probá de nuevo.';
    return;
  }

  document.getElementById('form-overlay').classList.remove('open');
  await refreshAll();
});

document.getElementById('month-prev-btn').addEventListener('click', async () => {
  viewPeriod = shiftPeriod(viewPeriod, -1);
  await refreshList();
});

document.getElementById('month-next-btn').addEventListener('click', async () => {
  if (viewPeriod === currentPeriodKey()) return;
  viewPeriod = shiftPeriod(viewPeriod, 1);
  await refreshList();
});

document.getElementById('status-filter-row').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  statusFilter = chip.dataset.filter;
  document.querySelectorAll('#status-filter-row .chip').forEach(c => c.classList.toggle('selected', c === chip));
  renderServicesList();
});

// ---------- Init ----------

async function refreshList() {
  await loadPaymentsForPeriod(viewPeriod);
  renderMonthNav();
  renderIndicators();
  renderServicesList();
}

async function refreshAll() {
  await loadServices();
  await refreshList();
}

async function init() {
  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;

  viewPeriod = currentPeriodKey();
  document.getElementById('add-service-btn').innerHTML = iconSvg('plus', 16);

  await Promise.all([loadExpenseCategories(), loadPaymentMethods()]);
  await refreshAll();
}

renderNav('servicios');
init();
