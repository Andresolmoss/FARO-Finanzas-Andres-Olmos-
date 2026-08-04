/* ============================================================
   FARO — Conexión a Supabase
   ============================================================ */

const SUPABASE_URL = 'https://xwucrbggkvhrmvoerhgr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3dWNyYmdna3Zocm12b2VyaGdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDU2NTIsImV4cCI6MjEwMTM4MTY1Mn0.eomujrGZYf3cb5N2M_Zor1WdEQct0TluRlGD_Fa8mm4';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Devuelve la sesión actual (o null si no hay nadie logueado)
async function getSession() {
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

// Protege una página: si no hay sesión, redirige al login.
// Devuelve la sesión si existe (para usar el user.id en la página).
async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}
