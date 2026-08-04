/* ============================================================
   FARO — Navegación (sidebar desktop / bottom nav mobile)
   ============================================================ */

const NAV_ITEMS = [
  { key: 'dashboard', icon: 'home', href: 'index.html' },
  { key: 'movimientos', icon: 'list', href: 'movimientos.html' },
  { key: 'fondos', icon: 'card', href: 'fondos.html' },
  { key: 'perfil', icon: 'user', href: 'perfil.html' }
];

function renderNav(activeKey) {
  const sidebar = document.getElementById('sidebar');
  const bottomNav = document.getElementById('bottom-nav');

  const items = NAV_ITEMS.map(item => {
    const isActive = item.key === activeKey;
    return { ...item, isActive };
  });

  if (sidebar) {
    sidebar.innerHTML = items.map(item => `
      <a class="sidebar-item ${item.isActive ? 'active' : ''}" href="${item.href}" aria-label="${item.key}">
        ${iconSvg(item.icon)}
      </a>
    `).join('');
  }

  if (bottomNav) {
    bottomNav.innerHTML = items.map(item => `
      <a class="bottom-nav-item ${item.isActive ? 'active' : ''}" href="${item.href}" aria-label="${item.key}">
        ${iconSvg(item.icon, 22)}
      </a>
    `).join('');
  }
}

function initFab() {
  const fab = document.getElementById('fab');
  if (!fab) return;
  fab.innerHTML = iconSvg('plus', 22);
  fab.addEventListener('click', () => {
    window.location.href = 'agregar-movimiento.html';
  });
}
