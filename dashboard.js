/* ============================================================
   FARO — Dashboard
   Por ahora usa datos de ejemplo (MOCK_DATA). En el próximo paso
   esto se reemplaza por consultas reales a Supabase.
   ============================================================ */

const MOCK_DATA = {
  userName: 'Andrés',
  month: 'Agosto',
  balance: 1284500,
  income: 890000,
  expense: 612300,
  savings: 277700,
  chartValues: [0.35, 0.32, 0.38, 0.42, 0.40, 0.45, 0.5, 0.48, 0.52, 0.58, 0.55, 0.6, 0.63, 0.6, 0.65, 0.7, 0.68, 0.74, 0.8, 0.78, 0.85, 0.9],
  chartLabelStart: 'Jul',
  chartLabelEnd: 'Ago',
  recentMovements: [
    { mono: 'IN', name: 'Venta óptica', category: 'Ingreso', date: 'Hoy', amount: 650000, type: 'income' },
    { mono: 'CO', name: 'Almuerzo', category: 'Comida', date: 'Hoy', amount: -4200, type: 'expense' },
    { mono: 'TR', name: 'Combustible', category: 'Transporte', date: 'Ayer', amount: -8100, type: 'expense' },
    { mono: 'SU', name: 'Netflix', category: 'Suscripciones', date: 'Ayer', amount: -2500, type: 'expense' }
  ],
  insight: 'Este mes ahorraste un 23%, el mejor resultado de los últimos cinco meses.'
};

function renderDashboard(data) {
  document.getElementById('greeting').textContent = `Hola, ${data.userName} · ${data.month}`;
  document.getElementById('balance-amount').textContent = formatCurrency(data.balance);
  document.getElementById('stat-income').textContent = formatCurrency(data.income);
  document.getElementById('stat-expense').textContent = formatCurrency(data.expense);
  document.getElementById('stat-savings').textContent = formatCurrency(data.savings);

  const path = smoothPath(data.chartValues, 640, 160);
  const area = chartAreaPath(data.chartValues, 640, 160);
  document.getElementById('chart-line').setAttribute('d', path);
  document.getElementById('chart-area').setAttribute('d', area);
  document.getElementById('chart-label-start').textContent = data.chartLabelStart;
  document.getElementById('chart-label-end').textContent = data.chartLabelEnd;

  const list = document.getElementById('movement-list');
  list.innerHTML = data.recentMovements.map(tx => `
    <div class="movement-row">
      <div class="movement-icon">${tx.mono}</div>
      <div class="movement-info">
        <div class="movement-name">${tx.name}</div>
        <div class="movement-category">${tx.category}</div>
      </div>
      <div class="movement-right">
        <div class="movement-amount ${tx.type} tabular">${formatCurrency(tx.amount)}</div>
        <div class="movement-date">${tx.date}</div>
      </div>
    </div>
  `).join('');

  document.getElementById('insight-text').textContent = data.insight;
}

renderNav('dashboard');
initFab();
renderDashboard(MOCK_DATA);
