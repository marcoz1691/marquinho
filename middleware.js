import { rewrite, next } from "@vercel/functions";
export const config = { matcher: ["/", "/index.html", "/cita.html", "/asistente.html", "/privacidad.html", "/404.html"] };
export function decidir(url, funciones) {
  const u = new URL(url);
  return config.matcher.includes(u.pathname) && funciones?.sitio === false ? new URL("/mantenimiento.html", u).href : null;
}
export default async function middleware(request) {
  try {
    const r = await fetch(new URL("/api/precios", request.url), { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return next();
    const destino = decidir(request.url, (await r.json()).funciones);
    if (destino) return rewrite(destino, { status: 503, headers: { "Cache-Control": "no-store" } });
  } catch (e) { console.error("No se pudo leer el estado del sitio:", e); }
  return next();
}
