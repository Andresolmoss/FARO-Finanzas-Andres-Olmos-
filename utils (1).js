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
  plus: `<path d="M12 5V19M5 12H19" stroke-linecap="round"/>`
};

function iconSvg(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${ICONS[name]}</svg>`;
}
