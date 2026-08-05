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
  renderChart(transactions);
  renderRecentMovements(transactions.slice(0, 4));
  renderInsight(transactions, now);
}

function renderBalanceAndStats(transactions, now) {
  const totalBalance = transactions.reduce((sum, tx) => {
    return sum + (tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount));
  }, 0);

  const isThisMonth = (dateStr) => {
    const d = new Date(dateStr);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const monthTx = transactions.filter(tx => isThisMonth(tx.occurred_on));
  const income = monthTx.filter(tx => tx.type === 'income').reduce((s, tx) => s + Number(tx.amount), 0);
  const expense = monthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + Number(tx.amount), 0);

  document.getElementById('balance-amount').textContent = formatCurrency(totalBalance);
  document.getElementById('stat-income').textContent = formatCurrency(income);
  document.getElementById('stat-expense').textContent = formatCurrency(expense);
  document.getElementById('stat-savings').textContent = formatCurrency(income - expense);
}

function renderChart(transactions) {
  // Curva de saldo acumulado a lo largo del tiempo.
  // Con pocos o ningún movimiento, se muestra una línea plana (estado inicial esperable).
  const sorted = [...transactions].sort((a, b) => new Date(a.occurred_on) - new Date(b.occurred_on));

  let values;
  if (sorted.length === 0) {
    values = [0.5, 0.5];
  } else {
    let running = 0;
    const points = sorted.map(tx => {
      running += tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount);
      return running;
    });
    const min = Math.min(...points, 0);
    const max = Math.max(...points, 0);
    const range = max - min || 1;
    values = points.map(v => 0.1 + ((v - min) / range) * 0.8);
    if (values.length === 1) values = [values[0], values[0]];
  }

  const path = smoothPath(values, 640, 160);
  const area = chartAreaPath(values, 640, 160);
  document.getElementById('chart-line').setAttribute('d', path);
  document.getElementById('chart-area').setAttribute('d', area);

  const sortedDates = sorted.map(tx => tx.occurred_on);
  const optsShort = { day: 'numeric', month: 'short' };
  document.getElementById('chart-label-start').textContent = sortedDates.length
    ? new Date(sortedDates[0]).toLocaleDateString('es-AR', optsShort)
    : '';
  document.getElementById('chart-label-end').textContent = sortedDates.length
    ? new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString('es-AR', optsShort)
    : '';
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
    const isIncome = tx.type === 'income';
    const amountText = (isIncome ? '+' : '-') + formatCurrency(Math.abs(tx.amount));
    const dateLabel = formatRelativeDate(tx.occurred_on);
    return `
      <div class="movement-row">
        <div class="movement-icon">${mono}</div>
        <div class="movement-info">
          <div class="movement-name">${escapeHtml(tx.description)}</div>
          <div class="movement-category">${escapeHtml(tx.category || '')}</div>
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
    const d = new Date(dateStr);
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
