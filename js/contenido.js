// Contenido: Google Sheets con respaldo local. Lo comparten la portada y la página Tarifas.
import { desdeHoja, urlPestana } from "./nucleo.js";

const store = {
  get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

function get(u, as) {
  return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(u); return as === "text" ? r.text() : r.json(); });
}

export function cargarContenido() {
  return Promise.all([get("data/tramites.json"), get("data/tarifas.json"), get("data/notaria.json"), get("data/config.json").catch(function () { return {}; })]).then(function (r) {
    var base = { data: r[0], tarifas: r[1], notaria: r[2] }, G = (r[3] || {}).googleSheet || {};
    var gids = G.pestanas || {};
    if (!(G.documento || G.publicado) || !gids.tramites) return base;
    // "documento": hoja compartida por enlace (lee los datos al instante).
    // "publicado": hoja publicada en la web (Google la actualiza cada ~5 minutos).
    var url = function (gid) { return urlPestana(G, gid); };
    var names = Object.keys(gids).filter(function (k) { return gids[k] !== ""; });
    var hoja = Promise.all(names.map(function (k) { return get(url(gids[k]), "text"); })).then(function (txt) {
      var tabs = {}; names.forEach(function (k, i) { tabs[k] = txt[i]; });
      var res = desdeHoja(tabs, base);
      store.set("n41-hoja", res);
      return res;
    });
    var limite = new Promise(function (_, no) { setTimeout(function () { no(new Error("tiempo")); }, 7000); });
    // Si la hoja falla o tarda, se usan los últimos datos válidos guardados y, si no hay, los locales.
    return Promise.race([hoja, limite]).catch(function (e) {
      if (window.console) console.warn("Google Sheets no disponible:", e.message);
      // Una copia guardada antes del tarifario trae las tablas viejas: se usan las locales con su SBU y año.
      var guardado = store.get("n41-hoja");
      if (guardado && guardado.tarifas && !guardado.tarifas.tarifario) guardado.tarifas = Object.assign({}, base.tarifas, { sbu: guardado.tarifas.sbu, anio: guardado.tarifas.anio });
      return guardado || base;
    });
  });
}
