/* ============================================================
   FARO — Navegación (sidebar desktop / bottom nav mobile)
   ============================================================ */
const NAV_ITEMS = [
  { key: 'dashboard', icon: 'home', label: 'Inicio', href: 'index.html' },
  { key: 'movimientos', icon: 'list', label: 'Movimientos', href: 'movimientos.html' },
  { key: 'cuotas', icon: 'stack', label: 'Cuotas', href: 'cuotas.html' },
  { key: 'fondos', icon: 'card', label: 'Fondos', href: 'fondos.html' },
  { key: 'servicios', icon: 'bolt', label: 'Servicios', href: 'servicios.html' },
  { key: 'configuracion', icon: 'gear', label: 'Configuración', href: 'configuracion.html' },
  { key: 'perfil', icon: 'user', label: 'Perfil', href: 'perfil.html' }
];
function renderNav(activeKey) {
  const sidebar = document.getElementById('sidebar');
  const bottomNav = document.getElementById('bottom-nav');
  const items = NAV_ITEMS.map(item => ({ ...item, isActive: item.key === activeKey }));
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="sidebar-logo">
        <img src="/img/icon-192.png" alt="Faro" class="sidebar-logo-icon">
        <span>Faro</span>
      </div>
      <div class="sidebar-nav">
        ${items.map(item => `
          <a class="sidebar-nav-item ${item.isActive ? 'active' : ''}" href="${item.href}">
            ${iconSvg(item.icon, 18)}
            <span>${item.label}</span>
          </a>
        `).join('')}
      </div>
      <div class="sidebar-footer" id="sidebar-footer">
        <div class="sidebar-avatar" id="sidebar-avatar">·</div>
        <div class="sidebar-footer-text">
          <div class="sidebar-footer-name" id="sidebar-footer-name">Mi cuenta</div>
          <div class="sidebar-footer-sub">Ver perfil</div>
        </div>
      </div>
    `;
    sidebar.querySelector('.sidebar-footer').addEventListener('click', () => {
      window.location.href = 'perfil.html';
    });
    fillSidebarUser();
  }
  if (bottomNav) {
    bottomNav.innerHTML = items.map(item => `
      <a class="bottom-nav-item ${item.isActive ? 'active' : ''}" href="${item.href}" aria-label="${item.key}">
        ${iconSvg(item.icon, 22)}
      </a>
    `).join('');
  }
}
async function fillSidebarUser() {
  if (typeof getSession !== 'function') return;
  const session = await getSession();
  if (!session) return;
  const email = session.user.email || '';
  const nameEl = document.getElementById('sidebar-footer-name');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl) nameEl.textContent = email;
  if (avatarEl) avatarEl.textContent = email.charAt(0).toUpperCase() || '·';
}
function initFab() {
  const fab = document.getElementById('fab');
  if (!fab) return;
  fab.innerHTML = iconSvg('plus', 22);
  fab.addEventListener('click', () => {
    window.location.href = 'agregar-movimiento.html';
  });
}
