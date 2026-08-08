/* ============================================================
   FARO — cuotas-ui.js
   Conecta el motor de cálculo (cuotas-engine.js) con el DOM de
   cuotas.html. No contiene reglas de negocio, solo interacción.
   ============================================================ */

(function () {
  const state = { userId: null, cards: [], categories: [], purchases: [], todayKey: null };

  function fmt(n) {
    return '$' + Math.round(n).toLocaleString('es-AR');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showError(msg) {
    const el = document.getElementById('global-error');
    el.innerHTML = `<div class="error-banner">${escapeHtml(msg)}</div>`;
    setTimeout(() => { el.innerHTML = ''; }, 6000);
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // ---------- Resumen ----------

  function renderResumen() {
    const { thisMonthTotal, grandTotalPending, lastMonthKey } = FaroCuotas.computeResumen(state.purchases, state.todayKey);
    document.getElementById('resumen-mes').textContent = fmt(thisMonthTotal);
    document.getElementById('resumen-total').textContent = fmt(grandTotalPending);

    const nota = document.getElementById('resumen-nota');
    nota.textContent = state.purchases.length === 0
      ? 'Todavía no cargaste ninguna compra en cuotas.'
      : `Se termina de pagar en ${FaroCuotas.monthLabel(lastMonthKey)}`;
  }

  // ---------- Historial ----------

  function renderHistorial() {
    const months = FaroCuotas.buildHistorial(state.purchases, state.todayKey);
    const el = document.getElementById('historial-content');

    if (months.length === 0) {
      el.innerHTML = '<div class="empty-state">No tenés cuotas activas para mostrar.</div>';
      return;
    }

    el.innerHTML = months.map(mo => `
      <div class="month-label">${escapeHtml(mo.label.charAt(0).toUpperCase() + mo.label.slice(1))}</div>
      ${mo.items.map(it => `
        <div class="row-item">
          <div class="row-mono">${escapeHtml(it.description.slice(0, 2).toUpperCase())}</div>
          <div class="row-main">
            <div class="row-name">${escapeHtml(it.description)}</div>
            <div class="row-sub">${escapeHtml(it.cardName)} · Cuota ${it.cuotaNumber} de ${it.installmentCount}</div>
          </div>
          <div class="row-amount">-${fmt(it.amount)}</div>
        </div>
      `).join('')}
    `).join('');
  }

  // ---------- Simulador / carga manual de compra ----------

  function renderSimForm() {
    const el = document.getElementById('sim-form');
    const cardOptions = state.cards.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    const todayMonthValue = state.todayKey; // 'YYYY-MM', calza con <input type="month">

    el.innerHTML = `
      <div class="cfield">
        <label>Tarjeta</label>
        <select id="f-card">
          ${cardOptions}
          <option value="__new__">+ Agregar tarjeta nueva</option>
        </select>
      </div>
      <div class="cfield">
        <label>Producto</label>
        <input id="f-desc" type="text" placeholder="Ej: Calculadora">
      </div>
      <div class="cfield">
        <label>Monto total de la compra</label>
        <input id="f-amount" type="number" inputmode="decimal" placeholder="Ej: 90000">
      </div>
      <div class="cfield">
        <label>Cantidad de cuotas</label>
        <input id="f-count" type="number" inputmode="numeric" placeholder="Ej: 3">
      </div>
      <div class="cfield-check">
        <input id="f-interest" type="checkbox">
        <label for="f-interest">Es con interés</label>
      </div>
      <div class="cfield">
        <label>Mes de la primera cuota</label>
        <input id="f-month" type="month" value="${todayMonthValue}">
      </div>
    `;

    document.getElementById('f-card').addEventListener('change', async (e) => {
      if (e.target.value !== '__new__') return;
      const name = window.prompt('Nombre de la tarjeta (ej: Tarjeta 5 países)');
      if (!name || !name.trim()) { e.target.value = state.cards[0] ? state.cards[0].id : ''; return; }
      try {
        const card = await FaroCuotas.createCard(state.userId, name.trim());
        state.cards.push(card);
        renderSimForm();
        document.getElementById('f-card').value = card.id;
      } catch (err) {
        showError('No se pudo crear la tarjeta: ' + err.message);
      }
    });
  }

  function readFormOrNull() {
    const cardId = document.getElementById('f-card').value;
    const description = document.getElementById('f-desc').value.trim();
    const totalAmount = Number(document.getElementById('f-amount').value);
    const installmentCount = Number(document.getElementById('f-count').value);
    const hasInterest = document.getElementById('f-interest').checked;
    const monthValue = document.getElementById('f-month').value; // 'YYYY-MM'

    if (cardId === '__new__' || !cardId) { showError('Elegí una tarjeta.'); return null; }
    if (!description) { showError('Ingresá el producto o descripción.'); return null; }
    if (!totalAmount || totalAmount <= 0) { showError('El monto tiene que ser mayor a cero.'); return null; }
    if (!installmentCount || installmentCount <= 0) { showError('La cantidad de cuotas tiene que ser mayor a cero.'); return null; }
    if (!monthValue) { showError('Elegí el mes de la primera cuota.'); return null; }

    return {
      cardId, description, totalAmount, installmentCount, hasInterest,
      firstInstallmentDate: `${monthValue}-01`
    };
  }

  function renderSimResult(rows) {
    const el = document.getElementById('sim-result');
    el.innerHTML = `
      <div class="month-label">Próximos ${rows.length} meses</div>
      ${rows.map(r => `
        <div class="sim-row">
          <div class="sim-month">${escapeHtml(r.label.charAt(0).toUpperCase() + r.label.slice(1))}</div>
          <div class="sim-amounts">
            ${fmt(r.withNew)}
            ${r.delta > 0 ? `<span class="sim-delta">(+${fmt(r.delta)})</span>` : ''}
          </div>
        </div>
      `).join('')}
    `;
  }

  function onSimular() {
    const form = readFormOrNull();
    if (!form) return;
    const hypothetical = {
      total_amount: form.totalAmount,
      installment_count: form.installmentCount,
      first_installment_date: form.firstInstallmentDate
    };
    const rows = FaroCuotas.simulate(state.purchases, hypothetical, state.todayKey, 6);
    renderSimResult(rows);
  }

  async function onGuardarCompra() {
    const form = readFormOrNull();
    if (!form) return;
    try {
      await FaroCuotas.createPurchase(state.userId, form);
      state.purchases = await FaroCuotas.fetchActivePurchases(state.userId, state.todayKey);
      renderResumen();
      document.getElementById('sim-result').innerHTML = '';
      renderSimForm();
      showView('view-resumen');
    } catch (err) {
      showError('No se pudo guardar la compra: ' + err.message);
    }
  }

  // ---------- Carga con IA (nuevo) ----------

  let iaReviewNuevas = [];
  let iaReviewDiscrepancias = [];
  let iaMesResumen = null;

  function showSubstep(id) {
    document.querySelectorAll('#view-cargar-ia .substep').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function openCargarIa() {
    document.getElementById('ia-prompt-text').textContent = FaroCuotas.buildAiPrompt(state.purchases, state.todayKey);
    document.getElementById('ia-paste-textarea').value = '';
    showSubstep('ia-step-prompt');
    showView('view-cargar-ia');
  }

  function cardSelectOptionsHtml() {
    return '<option value="">Elegir tarjeta…</option>' +
      state.cards.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') +
      '<option value="__new__">+ Agregar tarjeta nueva</option>';
  }

  function categorySelectOptionsHtml() {
    if (!state.categories.length) return '<option value="">No hay categorías creadas</option>';
    return '<option value="">Elegir categoría…</option>' +
      state.categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  }

  function processIaJson() {
    const raw = document.getElementById('ia-paste-textarea').value;
    let parsed;
    try {
      parsed = FaroCuotas.parseAiResponse(raw);
    } catch (err) {
      showError(err.message);
      return;
    }

    iaMesResumen = parsed.mes_resumen;
    iaReviewNuevas = [];
    iaReviewDiscrepancias = [];

    parsed.compras_en_cuotas.forEach(candidate => {
      const match = FaroCuotas.findExistingMatch(candidate, state.purchases);
      if (!match) {
        iaReviewNuevas.push(candidate);
        return;
      }
      const { expected, actual, mismatch } = FaroCuotas.computeDiscrepancy(match, candidate, parsed.mes_resumen);
      if (mismatch) iaReviewDiscrepancias.push({ candidate, existing: match, expected, actual });
      // si coincide exacto, no se muestra nada — ya está al día
    });

    renderIaReview();
    showSubstep('ia-step-review');
  }

  function renderIaReview() {
    const el = document.getElementById('ia-review-content');
    let html = '';

    if (iaReviewDiscrepancias.length > 0) {
      html += iaReviewDiscrepancias.map(d => `
        <div class="warning-banner">
          <strong>${escapeHtml(d.candidate.descripcion)}</strong>: esperábamos cuota ${d.expected} de ${d.existing.installment_count}, el resumen dice ${d.actual}. No se modifica nada solo — revisalo cuando puedas.
        </div>
      `).join('');
    }

    if (iaReviewNuevas.length === 0) {
      html += '<div class="empty-state">No encontré compras en cuotas nuevas para cargar.</div>';
    } else {
      html += iaReviewNuevas.map((c, i) => `
        <div class="ia-review-item" data-idx="${i}">
          <div class="ia-review-header">
            <input type="checkbox" class="ia-review-check" checked>
            <div class="ia-review-desc">${escapeHtml(c.descripcion)}</div>
            <div class="ia-review-amount">${fmt(c.monto_cuota)}</div>
          </div>
          <div class="ia-review-meta">cuota ${c.cuota_actual} de ${c.cuotas_totales}${c.con_interes ? ' · con interés' : ' · sin interés'}</div>
          <div class="ia-review-selects">
            <select class="ia-review-card" data-idx="${i}">${cardSelectOptionsHtml()}</select>
            <select class="ia-review-category" data-idx="${i}">${categorySelectOptionsHtml()}</select>
          </div>
        </div>
      `).join('');
    }

    el.innerHTML = html;

    el.querySelectorAll('.ia-review-card').forEach(sel => {
      sel.addEventListener('change', async () => {
        if (sel.value !== '__new__') return;
        const name = window.prompt('Nombre de la tarjeta nueva (ej: "ICBC Mastercard"):');
        if (!name || !name.trim()) { sel.value = ''; return; }
        try {
          const card = await FaroCuotas.createCard(state.userId, name.trim());
          state.cards.push(card);
          el.querySelectorAll('.ia-review-card').forEach(s => {
            const keep = s === sel ? card.id : s.value;
            s.innerHTML = cardSelectOptionsHtml();
            s.value = keep;
          });
        } catch (err) {
          showError('No se pudo crear la tarjeta: ' + err.message);
          sel.value = '';
        }
      });
    });
  }

  async function saveIaReview() {
    const items = document.querySelectorAll('#ia-review-content .ia-review-item');
    const toSave = [];

    for (const item of items) {
      const idx = Number(item.dataset.idx);
      const checkbox = item.querySelector('.ia-review-check');
      if (!checkbox.checked) continue;

      const candidate = iaReviewNuevas[idx];
      const cardSel = item.querySelector('.ia-review-card');
      const catSel = item.querySelector('.ia-review-category');

      if (!cardSel.value || cardSel.value === '__new__') {
        showError(`Elegí una tarjeta para "${candidate.descripcion}" antes de guardar.`);
        return;
      }
      if (!catSel.value) {
        showError(`Elegí una categoría para "${candidate.descripcion}" antes de guardar.`);
        return;
      }

      const key = candidate.fecha_compra
        ? candidate.fecha_compra.slice(0, 7)
        : FaroCuotas.addMonthsToKey(iaMesResumen, -(Math.max(1, candidate.cuota_actual) - 1));

      toSave.push({
        cardId: cardSel.value,
        description: candidate.descripcion,
        totalAmount: Number(candidate.monto_cuota) * Number(candidate.cuotas_totales),
        installmentCount: Number(candidate.cuotas_totales),
        hasInterest: !!candidate.con_interes,
        firstInstallmentDate: `${key}-01`,
        category: catSel.value
      });
    }

    if (toSave.length === 0) {
      showError('No hay ninguna cuota tildada para guardar.');
      return;
    }

    try {
      for (const purchase of toSave) {
        await FaroCuotas.createPurchase(state.userId, purchase);
      }
      state.purchases = await FaroCuotas.fetchActivePurchases(state.userId, state.todayKey);
      renderResumen();
      showView('view-resumen');
    } catch (err) {
      showError('No se pudieron guardar algunas cuotas: ' + err.message);
    }
  }

  // ---------- Init ----------

  async function init() {
    try {
      const session = await requireSession();
      if (!session) return;
      state.userId = session.user.id;

      state.todayKey = FaroCuotas.monthKeyFromDate(new Date());
      state.cards = await FaroCuotas.fetchCards(state.userId);
      state.categories = await FaroCuotas.fetchExpenseCategories(state.userId);
      state.purchases = await FaroCuotas.fetchActivePurchases(state.userId, state.todayKey);

      renderResumen();
      renderSimForm();

      document.getElementById('btn-historial').addEventListener('click', () => {
        renderHistorial();
        showView('view-historial');
      });
      document.getElementById('btn-simulador').addEventListener('click', () => {
        showView('view-simulador');
      });
      document.querySelectorAll('[data-back]').forEach(btn => {
        btn.addEventListener('click', () => showView('view-resumen'));
      });
      document.getElementById('btn-simular').addEventListener('click', onSimular);
      document.getElementById('btn-guardar-compra').addEventListener('click', onGuardarCompra);

      // Carga con IA
      document.getElementById('btn-cargar-ia').addEventListener('click', openCargarIa);
      document.getElementById('btn-copy-prompt').addEventListener('click', async () => {
        const text = document.getElementById('ia-prompt-text').textContent;
        try {
          await navigator.clipboard.writeText(text);
          const btn = document.getElementById('btn-copy-prompt');
          const original = btn.textContent;
          btn.textContent = 'Copiado ✓';
          setTimeout(() => { btn.textContent = original; }, 1500);
        } catch (e) {
          showError('No se pudo copiar automático. Seleccioná el texto y copialo a mano.');
        }
      });
      document.getElementById('btn-go-paste').addEventListener('click', () => showSubstep('ia-step-paste'));
      document.getElementById('btn-back-to-ia-prompt').addEventListener('click', () => showSubstep('ia-step-prompt'));
      document.getElementById('btn-process-ia').addEventListener('click', processIaJson);
      document.getElementById('btn-cancel-ia').addEventListener('click', () => showView('view-resumen'));
      document.getElementById('btn-save-ia').addEventListener('click', saveIaReview);

    } catch (err) {
      showError('Error cargando el módulo de cuotas: ' + err.message);
    }
  }

  renderNav('cuotas');
  initFab();
  init();
})();
