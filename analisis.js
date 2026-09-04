/* ============================================================
   FARO — Análisis (por mes + desglose por categoría)
   Usa FaroCuotas (cuotas-engine.js) para toda la aritmética de
   meses (monthKey, sumar/restar meses, cuota activa en un mes).
   ============================================================ */

// Debe coincidir exactamente con SYSTEM_PAGAR_RESUMEN_LABEL de
// agregar-movimiento.js: es el movimiento único que junta el pago
// del resumen de una tarjeta. Se excluye acá porque el detalle por
// categoría de esas cuotas ya se reconstruye por separado a partir
// de installment_purchases (ver buildCategoryBreakdown, paso 3).
const SYSTEM_PAGAR_RESUMEN_LABEL = '💳 Pagar resumen';

let userId = null;
let viewMonthKey = null;

let allTransactions = [];      // [{id, type, description, category, amount, occurred_on}]
let allServices = [];          // [{id, name, due_day, estimated_amount, active, category_id, categories:{name}}]
let allServicePayments = [];   // [{id, service_id, period, amount_paid, status}]
let allPurchases = [];         // [{id, description, total_amount, installment_count, first_installment_date, category}]

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

// ---------- Carga de datos ----------

async function loadAllData() {
  const [txRes, servicesRes, paymentsRes, purchasesRes] = await Promise.all([
    supabaseClient
      .from('transactions')
      .select('id, type, description, category, amount, occurred_on')
      .eq('user_id', userId),
    supabaseClient
      .from('services')
      .select('id, name, due_day, estimated_amount, active, category_id, categories(name)')
      .eq('user_id', userId),
    supabaseClient
      .from('service_payments')
      .select('id, service_id, period, amount_paid, status')
      .eq('user_id', userId),
    supabaseClient
      .from('installment_purchases')
      .select('id, description, total_amount, installment_count, first_installment_date, category')
      .eq('user_id', userId)
  ]);

  if (txRes.error) console.error('Error cargando movimientos:', txRes.error);
  if (servicesRes.error) console.error('Error cargando servicios:', servicesRes.error);
  if (paymentsRes.error) console.error('Error cargando pagos de servicios:', paymentsRes.error);
  if (purchasesRes.error) console.error('Error cargando compras en cuotas:', purchasesRes.error);

  allTransactions = txRes.data || [];
  allServices = servicesRes.data || [];
  allServicePayments = paymentsRes.data || [];
  allPurchases = purchasesRes.data || [];
}

// ---------- Cálculo por categoría ----------

// Junta, para un monthKey dado: movimientos variables categorizados +
// servicios vencidos ese mes (si no están pagados, entran como
// "pendiente" para no perderlos del total) + la cuota correspondiente
// de cada compra en cuotas activa ese mes. Devuelve un Map
// nombre-de-categoría -> { amount, items:[{name, amount, pending}] }.
function buildCategoryBreakdown(monthKey) {
  const map = new Map();

  function addItem(categoryRaw, itemName, amount, pending) {
    if (!(amount > 0)) return;
    const key = (categoryRaw && categoryRaw.trim()) ? categoryRaw : 'Sin categoría';
    if (!map.has(key)) map.set(key, { amount: 0, items: [] });
    const bucket = map.get(key);
    bucket.amount += amount;
    bucket.items.push({ name: itemName, amount, pending: !!pending });
  }

  // 1) Movimientos variables (excluye el pago de resumen de tarjeta,
  //    que se reconstruye por separado en el paso 3 para no duplicar).
  allTransactions.forEach(tx => {
    if (tx.type !== 'expense') return;
    if (tx.category === SYSTEM_PAGAR_RESUMEN_LABEL) return;
    const d = new Date(tx.occurred_on + 'T00:00:00');
    if (FaroCuotas.monthKeyFromDate(d) !== monthKey) return;
    addItem(tx.category, tx.description, Number(tx.amount), false);
  });

  // 2) Servicios vencidos ese mes. Si ya se marcó como pagado, el pago
  //    ya generó su propio movimiento (ver servicios.js) y ya quedó
  //    contado en el paso 1 — acá solo sumamos los que faltan pagar.
  allServices.forEach(s => {
    if (!s.due_day) return;
    const payment = allServicePayments.find(p => p.service_id === s.id && p.period === monthKey);
    if (payment && payment.status === 'pagado') return;
    if (!s.active) return;
    const categoryName = s.categories ? s.categories.name : null;
    addItem(categoryName, `${s.name} (pendiente)`, Number(s.estimated_amount || 0), true);
  });

  // 3) Cuota mensual de cada compra en cuotas activa ese mes.
  allPurchases.forEach(p => {
    const purchase = {
      total_amount: Number(p.total_amount),
      installment_count: p.installment_count,
      first_installment_date: p.first_installment_date
    };
    const n = FaroCuotas.installmentNumberForMonth(purchase, monthKey);
    if (n === null) return;
    const amount = FaroCuotas.amountForInstallmentNumber(purchase, n);
    addItem(p.category, `${p.description} (cuota ${n}/${p.installment_count})`, amount, false);
  });

  return map;
}

// ---------- Gráfico semanal ingresos/gastos ----------

function buildWeeklyBars(monthKey) {
  const buckets = [{ from: 1, to: 7 }, { from: 8, to: 14 }, { from: 15, to: 21 }, { from: 22, to: 31 }];
  const sums = buckets.map(() => ({ income: 0, expense: 0 }));

  allTransactions.forEach(tx => {
    const d = new Date(tx.occurred_on + 'T00:00:00');
    if (FaroCuotas.monthKeyFromDate(d) !== monthKey) return;
    const day = d.getDate();
    const idx = buckets.findIndex(b => day >= b.from && day <= b.to);
    if (idx === -1) return;
    if (tx.type === 'income') sums[idx].income += Number(tx.amount);
    else sums[idx].expense += Number(tx.amount);
  });

  const maxVal = Math.max(1, ...sums.flatMap(s => [s.income, s.expense]));
  return buckets.map((b, i) => ({
    label: `Sem ${i + 1}`,
    income: sums[i].income,
    expense: sums[i].expense,
    incomeH: Math.round((sums[i].income / maxVal) * 100),
    expenseH: Math.round((sums[i].expense / maxVal) * 100)
  }));
}

function renderWeeklyChart(weeks) {
  const el = document.getElementById('weeks-chart');
  el.innerHTML = weeks.map(w => `
    <div class="week-col">
      <div class="week-bars">
        <div class="week-bar income" style="height:${Math.max(w.incomeH, w.income > 0 ? 2 : 0)}%"></div>
        <div class="week-bar expense" style="height:${Math.max(w.expenseH, w.expense > 0 ? 2 : 0)}%"></div>
      </div>
      <div class="week-label">${w.label}</div>
    </div>
  `).join('');
}

// ---------- Anillo por categoría ----------

function renderRing(categories, total) {
  const svg = document.getElementById('ring-svg');
  const legend = document.getElementById('ring-legend');
  const cx = 70, cy = 70, r = 56, strokeWidth = 16;
  const circumference = 2 * Math.PI * r;

  let svgHtml = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#242B36" stroke-width="${strokeWidth}"/>`;
  let cumulative = 0;
  categories.forEach(cat => {
    if (total <= 0) return;
    const frac = cat.amount / total;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const offset = -cumulative * circumference;
    const color = categoryColor(cat.name);
    svgHtml += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    cumulative += frac;
  });
  svg.innerHTML = svgHtml;

  document.getElementById('ring-total').textContent = formatCurrency(total);

  legend.innerHTML = categories.slice(0, 6).map(cat => {
    const pct = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
    const color = categoryColor(cat.name);
    const label = categoryLabelText(cat.name) || cat.name;
    return `
      <div class="ring-legend-item">
        <span class="legend-dot" style="background:${color}"></span>
        <span class="ring-legend-name">${escapeHtml(label)}</span>
        <span class="ring-legend-pct">${pct}%</span>
      </div>
    `;
  }).join('');
}

// ---------- Lista de categorías con ítems ----------

function renderCategoryList(categories) {
  const container = document.getElementById('category-list');
  const empty = document.getElementById('categorias-empty');

  if (categories.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = categories.map(cat => {
    const color = categoryColor(cat.name);
    const label = categoryLabelText(cat.name) || cat.name;
    const items = [...cat.items].sort((a, b) => b.amount - a.amount);
    return `
      <div class="category-block">
        <div class="category-block-header">
          <div class="category-block-name">
            <span class="legend-dot" style="background:${color}"></span>
            <span class="txt">${escapeHtml(label)}</span>
          </div>
          <div class="category-block-amount">${formatCurrency(cat.amount)}</div>
        </div>
        ${items.map(it => `
          <div class="category-item-row ${it.pending ? 'pendiente' : ''}">
            <span class="category-item-name">${escapeHtml(it.name)}</span>
            <span class="category-item-amount">${formatCurrency(it.amount)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function renderInsight(categories, total) {
  const el = document.getElementById('insight-text');
  if (total <= 0 || categories.length === 0) {
    el.textContent = 'Todavía no hay gastos categorizados este mes.';
    return;
  }
  const top = categories[0];
  const pct = Math.round((top.amount / total) * 100);
  const label = categoryLabelText(top.name) || top.name;
  el.textContent = `${label} fue tu categoría principal este mes: ${pct}% de tu gasto total (${formatCurrency(top.amount)}).`;
}

// ---------- Orquestación ----------

function render() {
  const currentKey = FaroCuotas.monthKeyFromDate(new Date());
  document.getElementById('month-label').textContent = capitalize(FaroCuotas.monthLabel(viewMonthKey));
  document.getElementById('month-next-btn').disabled = (viewMonthKey === currentKey);

  const categoryMap = buildCategoryBreakdown(viewMonthKey);
  const categories = Array.from(categoryMap, ([name, val]) => ({ name, ...val })).sort((a, b) => b.amount - a.amount);
  const total = categories.reduce((s, c) => s + c.amount, 0);

  const txForMonth = allTransactions.filter(tx => FaroCuotas.monthKeyFromDate(new Date(tx.occurred_on + 'T00:00:00')) === viewMonthKey);

  const contentEl = document.getElementById('analisis-content');
  const mesEmptyEl = document.getElementById('mes-empty');

  if (txForMonth.length === 0 && categories.length === 0) {
    contentEl.style.display = 'none';
    mesEmptyEl.style.display = 'block';
    return;
  }
  contentEl.style.display = '';
  mesEmptyEl.style.display = 'none';

  renderWeeklyChart(buildWeeklyBars(viewMonthKey));
  renderRing(categories, total);
  renderCategoryList(categories);
  renderInsight(categories, total);
}

document.getElementById('month-prev-btn').addEventListener('click', () => {
  viewMonthKey = FaroCuotas.addMonthsToKey(viewMonthKey, -1);
  render();
});

document.getElementById('month-next-btn').addEventListener('click', () => {
  const currentKey = FaroCuotas.monthKeyFromDate(new Date());
  if (viewMonthKey === currentKey) return;
  viewMonthKey = FaroCuotas.addMonthsToKey(viewMonthKey, 1);
  render();
});

async function init() {
  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;
  viewMonthKey = FaroCuotas.monthKeyFromDate(new Date());

  await loadAllData();
  render();
}

renderNav('analisis');
initFab();
init();
