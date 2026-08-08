// ============================================================
// Faro — Motor de cálculo del módulo Tarjetas y Cuotas
//
// Este archivo NO toca el DOM. Son funciones puras + acceso a
// Supabase, pensadas para ser usadas tanto desde cuotas-ui.js como
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

  // ---------- Carga con IA (nuevo) ----------

  // Normaliza texto para comparar comercios (minúsculas, sin espacios extra)
  function normalizeText(str) {
    return String(str || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  // Arma el prompt completo para copiar y pegar en cualquier IA gratuita.
  // Si hay compras activas cargadas, agrega el bloque de auditoría de
  // discrepancias (compara lo que dice el resumen nuevo contra lo esperado).
  function buildAiPrompt(existingPurchases, todayKey) {
    let prompt = `Sos un asistente que extrae información de resúmenes de tarjeta de crédito argentinos, en pasos.

PASO 1: Te voy a pegar el texto o una imagen de mi resumen de tarjeta de crédito. Buscá ÚNICAMENTE las compras que se están pagando en cuotas — las reconocés por un patrón "N/M" junto al monto (ej: "04/09" = cuota 4 de 9). Ignorá las compras de pago único.

Por cada compra en cuotas que encuentres, anotá internamente: descripción, cuota actual, cuotas totales, monto de la cuota, moneda, fecha de compra (si está clara).
`;

    if (existingPurchases && existingPurchases.length > 0) {
      const lineas = existingPurchases
        .map(p => {
          const n = installmentNumberForMonth(p, todayKey);
          return n !== null ? `- ${p.description}: cuota ${n} de ${p.installment_count}, según el mes actual` : null;
        })
        .filter(Boolean)
        .join('\n');

      prompt += `
PASO 2: Estos son los datos que ya tengo cargados en mi sistema sobre compras en cuotas activas (para que los uses de referencia):
${lineas}

Cuando encuentres en el nuevo resumen una compra que coincida con una de esta lista (mismo comercio, mismas cuotas totales), fijate si la cuota que muestra el resumen coincide con la que figura arriba. Si no coincide, avisame ANTES de seguir, indicando cuál es la compra y cuál es la diferencia.

PASO 3: Preguntame cuáles de las compras en cuotas detectadas son CON interés y cuáles SIN interés. Por ejemplo: "Encontré estas compras en cuotas: 1) Grupo Marquez (9 cuotas)... ¿cuáles tienen interés? Podés responder 'todas sin interés', 'todas con interés', o aclarar una por una."

PASO 4: `;
    } else {
      prompt += `
PASO 2: Antes de darme el resultado final, mostrame la lista de compras en cuotas que detectaste (solo descripción y cuotas totales) y preguntame cuáles son CON interés y cuáles SIN interés. Por ejemplo: "Encontré estas compras en cuotas: 1) Grupo Marquez (9 cuotas)... ¿cuáles tienen interés? Podés responder 'todas sin interés', 'todas con interés', o aclarar una por una."

PASO 3: `;
    }

    prompt += `Cuando te responda, generá el resultado final. Devolveme ÚNICAMENTE un JSON válido, sin texto antes ni después, sin explicaciones, sin bloques de código markdown, empezando directo con { y terminando con }, con esta estructura exacta:

{
  "tarjeta_detectada": "",
  "mes_resumen": "AAAA-MM",
  "vencimiento_resumen": "AAAA-MM-DD",
  "compras_en_cuotas": [
    {
      "descripcion": "",
      "cuota_actual": 0,
      "cuotas_totales": 0,
      "monto_cuota": 0,
      "moneda": "ARS",
      "fecha_compra": null,
      "con_interes": false
    }
  ]
}

Los montos van como número JSON estándar (punto decimal, sin separador de miles — ejemplo: 15722.11, no "15.722,11").

Acá está mi resumen:
[PEGÁ ACÁ EL TEXTO O ADJUNTÁ LA IMAGEN/PDF DE TU RESUMEN]`;

    return prompt;
  }

  // Parsea el JSON que el usuario pega desde la IA. Tira un Error con
  // mensaje entendible si algo no viene bien formado.
  function parseAiResponse(rawText) {
    let cleaned = String(rawText || '').trim();
    cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error('Eso que pegaste no es un JSON válido. Revisá que hayas copiado la respuesta completa de la IA, sin texto extra.');
    }

    if (!parsed || !Array.isArray(parsed.compras_en_cuotas)) {
      throw new Error('El JSON no tiene el formato esperado (falta "compras_en_cuotas").');
    }

    return parsed;
  }

  // Busca si una compra detectada por la IA ya existe en lo que tenemos
  // cargado (mismo comercio + mismas cuotas totales). Devuelve el
  // registro existente o null.
  function findExistingMatch(candidate, existingPurchases) {
    const candDesc = normalizeText(candidate.descripcion);
    return existingPurchases.find(p =>
      normalizeText(p.description) === candDesc &&
      Number(p.installment_count) === Number(candidate.cuotas_totales)
    ) || null;
  }

  // Compara la cuota que dice la IA contra la que Faro esperaría a esta
  // altura (según el mes del resumen). Devuelve { expected, actual, mismatch }
  function computeDiscrepancy(existing, candidate, mesResumenKey) {
    const expected = installmentNumberForMonth(existing, mesResumenKey);
    const actual = Number(candidate.cuota_actual);
    return { expected, actual, mismatch: expected !== actual };
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

  // Categorías de gasto, para asignarle una a cada cuota cargada por IA.
  async function fetchExpenseCategories(userId) {
    const { data, error } = await sb
      .from('categories')
      .select('id, name')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
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

  async function createPurchase(userId, { cardId, description, totalAmount, installmentCount, hasInterest, firstInstallmentDate, category }) {
    const insertObj = {
      user_id: userId,
      card_id: cardId,
      description,
      total_amount: totalAmount,
      installment_count: installmentCount,
      has_interest: hasInterest,
      first_installment_date: firstInstallmentDate
    };
    if (category) insertObj.category = category;

    const { data, error } = await sb
      .from('installment_purchases')
      .insert(insertObj)
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
    buildAiPrompt,
    parseAiResponse,
    findExistingMatch,
    computeDiscrepancy,
    getUserId,
    fetchCards,
    createCard,
    fetchExpenseCategories,
    fetchActivePurchases,
    createPurchase
  };
})();
