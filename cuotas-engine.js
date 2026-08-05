// ============================================================
// Faro — Motor de cálculo del módulo Tarjetas y Cuotas
//
// Este archivo NO toca el DOM. Son funciones puras + acceso a
// Supabase, pensadas para ser usadas tanto desde cuotas.js como
// (más adelante) desde agregar-movimiento.js para la categoría
// especial "Pagar resumen".
//
// Usa el cliente global `supabaseClient` que expone supabaseClient.js
// (confirmado contra agregar-movimiento.js).
// ============================================================

const FaroCuotas = (() => {

  const sb = supabaseClient;

  // ---------- Reglas de cálculo ----------

  // Regla acordada: cuota sin interés = monto total / cantidad de
  // cuotas, redondeado hacia abajo al peso. La diferencia de
  // redondeo se absorbe en la ÚLTIMA cuota, para que la suma total
  // coincida siempre con el monto cargado.
  function computeInstallmentAmounts(totalAmount, installmentCount) {
    const base = Math.floor(totalAmount / installmentCount);
    const last = totalAmount - base * (installmentCount - 1);
    return { base, last };
  }

  function monthKey(year, month0) {
    // month0: 0-indexed (0 = enero)
    return `${year}-${String(month0 + 1).padStart(2, '0')}`;
  }

  function monthKeyFromDate(d) {
    return monthKey(d.getFullYear(), d.getMonth());
  }

  function addMonthsToKey(key, n) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return monthKeyFromDate(d);
  }

  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    const names = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${names[m - 1]} ${y}`;
  }

  // Compara dos monthKey ('YYYY-MM'): -1, 0, 1
  function compareMonthKeys(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // Dado un registro de compra { total_amount, installment_count,
  // first_installment_date }, devuelve el número de cuota (1-indexed)
  // que corresponde a un monthKey dado, o null si ese mes está fuera
  // del rango de la compra (todavía no empezó o ya terminó).
  function installmentNumberForMonth(purchase, targetKey) {
    const start = monthKeyFromDate(new Date(purchase.first_installment_date));
    const [sy, sm] = start.split('-').map(Number);
    const [ty, tm] = targetKey.split('-').map(Number);
    const monthsElapsed = (ty - sy) * 12 + (tm - sm);
    const cuotaNumber = monthsElapsed + 1;
    if (cuotaNumber < 1 || cuotaNumber > purchase.installment_count) return null;
    return cuotaNumber;
  }

  function amountForInstallmentNumber(purchase, cuotaNumber) {
    const { base, last } = computeInstallmentAmounts(purchase.total_amount, purchase.installment_count);
    return cuotaNumber === purchase.installment_count ? last : base;
  }

  function lastMonthKeyForPurchase(purchase) {
    const start = monthKeyFromDate(new Date(purchase.first_installment_date));
    return addMonthsToKey(start, purchase.installment_count - 1);
  }

  // ---------- Agregaciones ----------

  // Resumen general: comprometido este mes + total pendiente desde
  // este mes en adelante + mes en que se termina de pagar todo.
  function computeResumen(purchases, todayKey) {
    let thisMonthTotal = 0;
    let grandTotalPending = 0;
    let lastKey = todayKey;

    purchases.forEach(p => {
      const end = lastMonthKeyForPurchase(p);
      if (compareMonthKeys(end, lastKey) > 0) lastKey = end;

      const nThis = installmentNumberForMonth(p, todayKey);
      if (nThis !== null) thisMonthTotal += amountForInstallmentNumber(p, nThis);

      // Sumar todas las cuotas de HOY en adelante (incluye la de este mes)
      let cursor = todayKey;
      while (compareMonthKeys(cursor, end) <= 0) {
        const n = installmentNumberForMonth(p, cursor);
        if (n !== null) grandTotalPending += amountForInstallmentNumber(p, n);
        cursor = addMonthsToKey(cursor, 1);
      }
    });

    return { thisMonthTotal, grandTotalPending, lastMonthKey: lastKey };
  }

  // Historial mes a mes: lista de meses desde hoy hasta el último
  // mes con cuotas activas, cada uno con el detalle de sus cuotas.
  function buildHistorial(purchases, todayKey) {
    if (purchases.length === 0) return [];
    let lastKey = todayKey;
    purchases.forEach(p => {
      const end = lastMonthKeyForPurchase(p);
      if (compareMonthKeys(end, lastKey) > 0) lastKey = end;
    });

    const months = [];
    let cursor = todayKey;
    while (compareMonthKeys(cursor, lastKey) <= 0) {
      const items = [];
      purchases.forEach(p => {
        const n = installmentNumberForMonth(p, cursor);
        if (n !== null) {
          items.push({
            cardName: p.card_name || 'Tarjeta',
            description: p.description,
            cuotaNumber: n,
            installmentCount: p.installment_count,
            amount: amountForInstallmentNumber(p, n)
          });
        }
      });
      if (items.length > 0) {
        months.push({ key: cursor, label: monthLabel(cursor), items });
      }
      cursor = addMonthsToKey(cursor, 1);
    }
    return months;
  }

  // Para la categoría "Pagar resumen" en Agregar movimiento: suma de
  // las cuotas de una tarjeta puntual para el mes actual.
  function computeCardResumenForMonth(purchases, cardId, todayKey) {
    let total = 0;
    const detail = [];
    purchases.filter(p => p.card_id === cardId).forEach(p => {
      const n = installmentNumberForMonth(p, todayKey);
      if (n !== null) {
        const amount = amountForInstallmentNumber(p, n);
        total += amount;
        detail.push({ description: p.description, cuotaNumber: n, installmentCount: p.installment_count, amount });
      }
    });
    return { total, detail };
  }

  // Simulador: agrega una compra hipotética (no persistida) a las
  // reales y devuelve, mes a mes (próximos `monthsForward` meses),
  // el total real vs. el total proyectado con la nueva compra.
  function simulate(purchases, hypotheticalPurchase, todayKey, monthsForward = 6) {
    const rows = [];
    let cursor = todayKey;
    for (let i = 0; i < monthsForward; i++) {
      let real = 0;
      purchases.forEach(p => {
        const n = installmentNumberForMonth(p, cursor);
        if (n !== null) real += amountForInstallmentNumber(p, n);
      });
      let withNew = real;
      const n2 = installmentNumberForMonth(hypotheticalPurchase, cursor);
      if (n2 !== null) withNew += amountForInstallmentNumber(hypotheticalPurchase, n2);

      rows.push({ key: cursor, label: monthLabel(cursor), real, withNew, delta: withNew - real });
      cursor = addMonthsToKey(cursor, 1);
    }
    return rows;
  }

  // ---------- Acceso a datos (Supabase) ----------

  async function getUserId() {
    const { data: { user } } = await sb.auth.getUser();
    return user ? user.id : null;
  }

  async function fetchCards(userId) {
    const { data, error } = await sb
      .from('credit_cards')
      .select('id, name')
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function createCard(userId, name) {
    const { data, error } = await sb
      .from('credit_cards')
      .insert({ user_id: userId, name })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Trae las compras activas (que todavía tienen al menos una cuota
  // pendiente desde este mes) con el nombre de tarjeta ya resuelto.
  async function fetchActivePurchases(userId, todayKey) {
    const { data, error } = await sb
      .from('installment_purchases')
      .select('id, card_id, description, total_amount, installment_count, has_interest, first_installment_date, credit_cards(name)')
      .eq('user_id', userId);
    if (error) throw error;

    return (data || [])
      .map(row => ({
        id: row.id,
        card_id: row.card_id,
        card_name: row.credit_cards ? row.credit_cards.name : 'Tarjeta',
        description: row.description,
        total_amount: Number(row.total_amount),
        installment_count: row.installment_count,
        has_interest: row.has_interest,
        first_installment_date: row.first_installment_date
      }))
      .filter(p => compareMonthKeys(lastMonthKeyForPurchase(p), todayKey) >= 0);
  }

  async function createPurchase(userId, { cardId, description, totalAmount, installmentCount, hasInterest, firstInstallmentDate }) {
    const { data, error } = await sb
      .from('installment_purchases')
      .insert({
        user_id: userId,
        card_id: cardId,
        description,
        total_amount: totalAmount,
        installment_count: installmentCount,
        has_interest: hasInterest,
        first_installment_date: firstInstallmentDate
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  return {
    computeInstallmentAmounts,
    monthKeyFromDate,
    addMonthsToKey,
    monthLabel,
    compareMonthKeys,
    installmentNumberForMonth,
    amountForInstallmentNumber,
    lastMonthKeyForPurchase,
    computeResumen,
    buildHistorial,
    computeCardResumenForMonth,
    simulate,
    getUserId,
    fetchCards,
    createCard,
    fetchActivePurchases,
    createPurchase
  };
})();
