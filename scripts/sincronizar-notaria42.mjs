// Copia a notaria42/ lo que comparte con la web de la Notaría 41: el cálculo de tarifas, el tema y las fuentes.
// Úsalo cuando cambien js/nucleo.js o data/tarifas.json (por ejemplo, el SBU de enero):  node scripts/sincronizar-notaria42.mjs
// data/tramites.json NO se copia: el catálogo de la 42 es suyo y lo revisa la notaria.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
export const COPIAS = [
  "js/nucleo.js", "js/tema.js", "data/tarifas.json",
  "assets/fonts/archivo.css", "assets/fonts/archivo-latin.woff2", "assets/fonts/archivo-latin-ext.woff2",
  "assets/fonts/phosphor.css", "assets/fonts/Phosphor.woff2", "assets/fonts/Phosphor-Fill.woff2"
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const f of COPIAS) copyFileSync(RAIZ + f, RAIZ + "notaria42/" + f);
  console.log("Copiados a notaria42/: " + COPIAS.join(", "));
}
