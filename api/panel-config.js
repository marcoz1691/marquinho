// Datos públicos que necesita la página del panel para iniciar sesión con Supabase (URL y clave anon, no son secretos)
// y si exige la verificación en dos pasos.
export const GET = () => new Response(JSON.stringify({ supabaseUrl: process.env.SUPABASE_URL || "", supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  mfa: process.env.PANEL_MFA !== "desactivada" }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
