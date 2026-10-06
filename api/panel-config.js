// Datos públicos que necesita la página del panel para iniciar sesión con Supabase (URL y clave anon, no son secretos).
export const GET = () => new Response(JSON.stringify({ supabaseUrl: process.env.SUPABASE_URL || "", supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "" }),
  { headers: { "Content-Type": "application/json" } });
