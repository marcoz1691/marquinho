// Regenera assets/fonts/phosphor.css con solo los iconos de Phosphor que usa el sitio.
// Úsalo cada vez que añadas o quites un icono:  npm run iconos
// Los .woff2 traen todos los iconos y no cambian; solo cambia este CSS (que se revalida en cada visita).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const VERSION = "2.1.1";
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const DESTINO = RAIZ + "assets/fonts/phosphor.css";
const ESTILOS = [
  { clase: "ph", familia: "Phosphor", archivo: "Phosphor.woff2", css: "regular/style.css" },
  { clase: "ph-fill", familia: "Phosphor-Fill", archivo: "Phosphor-Fill.woff2", css: "fill/style.css" }
];

// Nombres "ph-xxx" que aparecen en el HTML, JS y CSS del sitio (sin docs ni las propias fuentes).
export function iconosUsados() {
  const archivos = execSync("git ls-files", { cwd: RAIZ }).toString().split("\n")
    .filter((f) => /\.(html|js|css)$/.test(f) && !/^(docs|assets\/fonts|test|e2e|scripts)\//.test(f));
  const texto = archivos.map((f) => readFileSync(RAIZ + f, "utf8")).join("\n");
  const nombres = new Set([...texto.matchAll(/\bph-[a-z0-9]+(?:-[a-z0-9]+)*/g)].map((m) => m[0]));
  nombres.delete("ph-fill");
  return [...nombres].sort();
}

export function iconosEnCss() {
  return new Set([...readFileSync(DESTINO, "utf8").matchAll(/\.(ph-[a-z0-9-]+):before/g)].map((m) => m[1]));
}

async function generar() {
  const usados = new Set(iconosUsados());
  const salida = [];
  const encontrados = new Set();
  for (const e of ESTILOS) {
    const resp = await fetch(`https://unpkg.com/@phosphor-icons/web@${VERSION}/src/${e.css}`);
    if (!resp.ok) throw new Error(`No se pudo descargar ${e.css}: ${resp.status}`);
    const css = await resp.text();
    const ini = css.indexOf(`.${e.clase} {`);
    const base = css.slice(ini, css.indexOf("}", ini) + 1)
      .replace(/\/\*.*?\*\//gs, "").replace(/-(webkit|moz|ms)-[^;]+;/g, "").replace(/\s+/g, " ");
    salida.push(`@font-face{font-family:"${e.familia}";src:url("${e.archivo}") format("woff2");font-weight:normal;font-style:normal;font-display:swap}`);
    salida.push(base);
    const re = new RegExp(`\\.${e.clase}\\.(ph-[a-z0-9-]+):before\\s*\\{\\s*content:\\s*("[^"]+");?\\s*\\}`, "g");
    for (const m of css.matchAll(re)) {
      if (usados.has(m[1])) { salida.push(`.${e.clase}.${m[1]}:before{content:${m[2]}}`); encontrados.add(m[1]); }
    }
  }
  const faltan = [...usados].filter((n) => !encontrados.has(n));
  if (faltan.length) throw new Error(`Estos iconos no existen en Phosphor ${VERSION}: ${faltan.join(", ")}`);
  writeFileSync(DESTINO, salida.join("\n") + "\n");
  console.log(`phosphor.css: ${usados.size} iconos`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generar();
