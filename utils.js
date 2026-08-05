/* ============================================================
   FARO — Utilidades compartidas
   ============================================================ */
// Genera un path SVG suave (curva tipo Apple Stocks) a partir de
// una lista de valores normalizados entre 0 y 1.
function smoothPath(vals, w, h) {
  const n = vals.length;
  const pts = vals.map((v, i) => ({ x: i * (w / (n - 1)), y: h - v * h }));
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
function chartAreaPath(vals, w, h) {
  return smoothPath(vals, w, h) + ` L ${w},${h} L 0,${h} Z`;
}
// Formatea números como pesos argentinos: $1.284.500
function formatCurrency(n) {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  return sign + '$' + abs.toLocaleString('es-AR');
}
// Íconos de navegación (mismo set que el mockup)
const ICONS = {
  home: `<path d="M4 11.5L12 4l8 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 10V19a1 1 0 0 0 1 1H16.5a1 1 0 0 0 1-1V10" stroke-linecap="round" stroke-linejoin="round"/>`,
  list: `<path d="M4 7H20M4 12H20M4 17H14" stroke-linecap="round"/>`,
  card: `<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10.5H21"/><circle cx="16.5" cy="14.5" r="1.3" fill="currentColor" stroke="none"/>`,
  user: `<circle cx="12" cy="8" r="3.2"/><path d="M5 19c0-3.8 3.1-6 7-6s7 2.2 7 6" stroke-linecap="round"/>`,
  plus: `<path d="M12 5V19M5 12H19" stroke-linecap="round"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5c.04-.5.04-1 0-1.5l1.9-1.4-2-3.4-2.2.9a7.9 7.9 0 0 0-1.3-.75L15.4 5h-4l-.4 2.35c-.47.2-.9.45-1.3.75l-2.2-.9-2 3.4L7.4 12c-.04.5-.04 1 0 1.5l-1.9 1.4 2 3.4 2.2-.9c.4.3.83.55 1.3.75L11.4 21h4l.4-2.35c.47-.2.9-.45 1.3-.75l2.2.9 2-3.4-1.9-1.4Z" stroke-linecap="round" stroke-linejoin="round"/>`,
  cash: `<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.3c0-1 .9-1.5 2-1.5s2 .55 2 1.4-.9 1.2-2 1.4c-1.1.2-2 .55-2 1.4s.9 1.5 2 1.5 2-.45 2-1.4" stroke-linecap="round"/>`,
  transfer: `<path d="M7 7h10l-3-3M17 17H7l3 3" stroke-linecap="round" stroke-linejoin="round"/>`,
  chevron: `<path d="M1 1l6 6-6 6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
};
function iconSvg(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${ICONS[name]}</svg>`;
}
// Si el nombre de una categoría tiene un emoji (al principio o al final,
// ej. "⛽ Combustible" u "Ocio 🎯"), devuelve ese emoji solo, para usar
// como ícono circular. Si no tiene emoji, devuelve las primeras 2 letras
// en mayúscula (comportamiento anterior).
function categoryMono(categoryOrDescription) {
  if (!categoryOrDescription) return '??';
  const match = categoryOrDescription.match(/\p{Extended_Pictographic}\uFE0F?/u);
  if (match) return match[0];
  return categoryOrDescription.slice(0, 2).toUpperCase();
}
// Asigna un color estable a cada categoría (según su nombre) para usarlo
// en el ícono circular y el badge de la lista de movimientos. Evita el rojo
// y el verde exactos para no confundirse con el significado gasto/ingreso.
const CATEGORY_PALETTE = ['#8B5CF6', '#FB923C', '#38BDF8', '#F472B6', '#FBBF24', '#2DD4BF', '#818CF8', '#0EA5E9'];
function categoryColor(name) {
  if (!name) return CATEGORY_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % CATEGORY_PALETTE.length;
  return CATEGORY_PALETTE[hash];
}
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
// Quita el emoji del nombre de categoría para mostrarlo como texto de badge
function categoryLabelText(name) {
  if (!name) return '';
  return name.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').trim();
}
// Ícono según el medio de pago (por nombre)
function paymentIconName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.includes('efectivo')) return 'cash';
  if (lower.includes('transfer')) return 'transfer';
  return 'card';
}
