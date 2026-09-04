/* ============================================================
   FARO — Dashboard (datos reales de Supabase)
   ============================================================ */

async function loadDashboard() {
  const session = await requireSession();
  if (!session) return; // requireSession ya redirige a login.html

  const userId = session.user.id;

  // Nombre para el saludo
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();

  const firstName = (profile && profile.full_name) ? profile.full_name.split(' ')[0] : 'Andrés';
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const now = new Date();
  document.getElementById('greeting').textContent = `Hola, ${firstName} · ${monthNames[now.getMonth()]}`;

  // Todos los movimientos del usuario, más recientes primero
  const { data: transactions, error } = await supabaseClient
    .from('transactions')
    .select('id, type, description, category, amount, occurred_on')
    .eq('user_id', userId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando movimientos:', error);
    return;
  }

  renderBalanceAndStats(transactions, now);
  renderChart(transactions, now);
  renderRecentMovements(transactions.slice(0, 4));
  renderInsight(transactions, now);
}

// Faro es principalmente una app de control de GASTOS (Andrés no tiene
// sueldo fijo ni carga sus retiros como ingreso: todo lo que gasta
// representa su "sueldo" de ese período). Por eso el número principal del
// Dashboard es el gasto del mes en curso, no un saldo tipo cuenta bancaria.
function renderBalanceAndStats(transactions, now) {
  const isInMonth = (dateStr, year, month) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  };

  const monthTx = transactions.filter(tx => isInMonth(tx.occurred_on, now.getFullYear(), now.getMonth()));
  const expense = monthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + Number(tx.amount), 0);

  document.getElementById('balance-amount').textContent = formatCurrency(expense);

  // Delta de gastos vs. el mes anterior
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthTx = transactions.filter(tx => isInMonth(tx.occurred_on, prevDate.getFullYear(), prevDate.getMonth()));
  const prevExpense = prevMonthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + Number(tx.amount), 0);

  const deltaEl = document.getElementById('stat-expense-delta');
  if (deltaEl) {
    if (prevExpense > 0) {
      const monthNamesShort = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const pct = Math.round(((expense - prevExpense) / prevExpense) * 100);
      const arrow = pct >= 0 ? '↑' : '↓';
      deltaEl.textContent = `${arrow}${Math.abs(pct)}% vs ${monthNamesShort[prevDate.getMonth()]}`;
    } else {
      deltaEl.textContent = '';
    }
  }
}

function renderChart(transactions, now) {
  // Curva de gasto ACUMULADO dentro del mes en curso, día a día — muestra
  // el ritmo al que se va gastando. Se resetea solo cada mes (no es un
  // saldo global tipo cuenta bancaria).
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const monthExpenses = transactions.filter(tx => {
    if (tx.type !== 'expense') return false;
    const d = new Date(tx.occurred_on + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });

  let values;
  if (monthExpenses.length === 0) {
    values = [0.5, 0.5];
  } else {
    const perDay = new Array(today).fill(0);
    monthExpenses.forEach(tx => {
      const day = new Date(tx.occurred_on + 'T00:00:00').getDate();
      if (day >= 1 && day <= today) perDay[day - 1] += Number(tx.amount);
    });
    let running = 0;
    const points = perDay.map(v => (running += v));
    const max = Math.max(...points, 1);
    values = points.map(v => 0.05 + (v / max) * 0.9);
    if (values.length === 1) values = [values[0], values[0]];
  }

  const path = smoothPath(values, 640, 160);
  const area = chartAreaPath(values, 640, 160);
  document.getElementById('chart-line').setAttribute('d', path);
  document.getElementById('chart-area').setAttribute('d', area);

  const optsShort = { day: 'numeric', month: 'short' };
  document.getElementById('chart-label-start').textContent = new Date(year, month, 1).toLocaleDateString('es-AR', optsShort);
  document.getElementById('chart-label-end').textContent = now.toLocaleDateString('es-AR', optsShort);
}

function renderRecentMovements(recent) {
  const list = document.getElementById('movement-list');
  const empty = document.getElementById('movement-empty');

  if (recent.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  list.style.display = '';
  empty.style.display = 'none';

  list.innerHTML = recent.map(tx => {
    const mono = categoryMono(tx.category || tx.description);
    const color = categoryColor(tx.category || tx.description);
    const isIncome = tx.type === 'income';
    const amountText = (isIncome ? '+' : '-') + formatCurrency(Math.abs(tx.amount));
    const dateLabel = formatRelativeDate(tx.occurred_on);
    const categoryLabel = categoryLabelText(tx.category || '');
    return `
      <div class="movement-row">
        <div class="movement-icon" style="background:${hexToRgba(color, 0.18)};color:${color}">${mono}</div>
        <div class="movement-info">
          <div class="movement-name">${escapeHtml(tx.description)}</div>
          <div class="category-badge" style="background:${hexToRgba(color, 0.15)};color:${color}">
            <span class="category-dot" style="background:${color}"></span>${escapeHtml(categoryLabel)}
          </div>
        </div>
        <div class="movement-right">
          <div class="movement-amount ${isIncome ? 'income' : 'expense'} tabular">${amountText}</div>
          <div class="movement-date">${dateLabel}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderInsight(transactions, now) {
  const insightEl = document.getElementById('insight-text');

  if (transactions.length === 0) {
    insightEl.textContent = 'Cargá tu primer movimiento con el botón + y acá vas a empezar a ver un análisis de tus finanzas.';
    return;
  }

  const isThisMonth = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };
  const monthTx = transactions.filter(tx => isThisMonth(tx.occurred_on));
  const expense = monthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + Number(tx.amount), 0);

  if (expense === 0) {
    insightEl.textContent = 'Todavía no registraste gastos este mes. A medida que cargues movimientos, vas a ver acá un análisis de tu situación financiera.';
    return;
  }

  const min = 1000000, max = 1100000;
  if (expense > max) {
    const overPct = Math.round(((expense - max) / max) * 100);
    insightEl.textContent = `Este mes ya gastaste ${overPct}% más que tu rango habitual ($${min.toLocaleString('es-AR')}–$${max.toLocaleString('es-AR')}). Vale la pena revisar en qué se fue.`;
  } else if (expense < min) {
    insightEl.textContent = 'Vas bien encaminado: tu gasto de este mes está por debajo de tu rango habitual.';
  } else {
    insightEl.textContent = `Tu gasto de este mes está dentro de tu rango habitual ($${min.toLocaleString('es-AR')}–$${max.toLocaleString('es-AR')}).`;
  }
}

function formatRelativeDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

renderNav('dashboard');
initFab();
loadDashboard();
