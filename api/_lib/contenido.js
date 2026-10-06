// Contenido para el servidor: la misma hoja de Google que lee la web, con caché y respaldo en los JSON de data/.
import { readFile } from "node:fs/promises";
import { desdeHoja, urlPestana } from "../../js/nucleo.js";

const CACHE_MS = 5 * 60 * 1000;
const DATA = new URL("../../data/", import.meta.url);

async function leerJSONLocales() {
  const leer = async (f) => JSON.parse(await readFile(new URL(f, DATA), "utf8"));
  const [tramites, tarifas, notaria, config] = await Promise.all([leer("tramites.json"), leer("tarifas.json"), leer("notaria.json"), leer("config.json").catch(() => ({}))]);
  return { tramites, tarifas, notaria, config };
}

// Devuelve una función async que entrega { data, tarifas, notaria }.
export function crearContenido({ leerLocal = leerJSONLocales, fetch = globalThis.fetch, ahora = Date.now } = {}) {
  let cache = null, vence = 0, ultimaHoja = null;

  return async function contenido() {
    if (cache && ahora() < vence) return cache;
    const L = await leerLocal();
    const base = { data: L.tramites, tarifas: L.tarifas, notaria: L.notaria };
    const G = L.config?.googleSheet || {}, gids = G.pestanas || {};
    let resultado = base;
    if ((G.documento || G.publicado) && gids.tramites) {
      try {
        const nombres = Object.keys(gids).filter((k) => gids[k] !== "");
        const textos = await Promise.all(nombres.map(async (k) => {
          const r = await fetch(urlPestana(G, gids[k]));
          if (!r.ok) throw new Error(`Hoja ${k}: HTTP ${r.status}`);
          return r.text();
        }));
        ultimaHoja = desdeHoja(Object.fromEntries(nombres.map((k, i) => [k, textos[i]])), base);
        resultado = ultimaHoja;
      } catch (e) {
        console.warn("Hoja de contenido no disponible:", e.message);
        resultado = ultimaHoja || base;
      }
    }
    cache = resultado;
    vence = ahora() + CACHE_MS;
    return cache;
  };
}
