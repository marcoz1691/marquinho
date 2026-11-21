// Web de la Notaría 42 (notaria42/): sitio estático aparte que reutiliza el cálculo de tarifas de la 41.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { COPIAS } from "../scripts/sincronizar-notaria42.mjs";
import { calcularConHabilitantes } from "../notaria42/js/nucleo.js";

const leer = (f) => readFileSync(new URL("../" + f, import.meta.url));
const texto = (f) => leer(f).toString();
const N = JSON.parse(texto("notaria42/data/notaria.json"));
const D = JSON.parse(texto("notaria42/data/tramites.json"));
const T = JSON.parse(texto("notaria42/data/tarifas.json"));
const paginas = readdirSync(new URL("../notaria42/", import.meta.url)).filter((f) => f.endsWith(".html"));

describe("Notaría 42", () => {
  it("las copias compartidas son idénticas a las de la 41 (si falla: node scripts/sincronizar-notaria42.mjs)", () => {
    for (const f of COPIAS) expect(leer("notaria42/" + f).equals(leer(f)), f).toBe(true);
  });

  it("los datos de la notaría están completos y no arrastran nada de la 41", () => {
    for (const k of ["nombre", "notaria", "cargo", "direccion", "correo"]) expect(N[k], k).toBeTruthy();
    expect(N.telefonos.length).toBeGreaterThan(0);
    expect(N.horario.dias.length).toBeGreaterThan(0);
    const todo = JSON.stringify(N) + JSON.stringify(D);
    expect(todo).not.toMatch(/\b41\b|Sof[ií]a|Albornoz|Parque Central|notario\b/i);
  });

  it("el HTML repite los mismos datos de contacto que notaria.json", () => {
    const index = texto("notaria42/index.html");
    expect(index).toContain(N.telefonos[0]);
    expect(index).toContain("tel:+593" + N.telefonos[0].replace(/\D/g, "").replace(/^0/, ""));
    expect(index).toContain(N.correo.replace("@", "@<wbr>"));
    expect(index).toContain("Oe1-172");
    expect(index).toContain(N.horario.texto);
  });

  it("ninguna página carga recursos externos, estilos en línea ni la API de la 41", () => {
    for (const p of paginas) {
      const html = texto("notaria42/" + p);
      expect(html, p).not.toMatch(/<script[^>]+src="https?:|<link[^>]+rel="(stylesheet|preload|icon|manifest)"[^>]+href="https?:/i);
      expect(html, p).not.toMatch(/\sstyle="/i);
      expect(html, p).not.toMatch(/\/api\/|Sof[ií]a|Notar[ií]a 41/i);
    }
    expect(texto("notaria42/js/sitio.js")).not.toMatch(/\/api\/|https?:\/\/(?!wa\.me|www\.google\.com\/maps|waze\.com)/);
  });

  it("la CSP no abre nada fuera del propio sitio y la vista previa no se indexa", () => {
    const v = JSON.parse(texto("notaria42/vercel.json"));
    const h = Object.fromEntries(v.headers[0].headers.map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toMatch(/^default-src 'none'/);
    expect(h["Content-Security-Policy"]).not.toMatch(/https?:|unsafe/);
    expect(h["X-Robots-Tag"]).toBe("noindex");
  });

  it("cada trámite tiene requisitos y la calculadora da un total para los de tarifa conocida", () => {
    for (const t of D.tramites) {
      expect(t.req.length, t.id).toBeGreaterThan(0);
      if (t.tarifa.tipo === "pct" || t.tarifa.tipo === "fija") {
        const c = calcularConHabilitantes(t, T, { cantidad: 1, monto: 0 }, {}, D.tramites);
        expect(c.total, t.id).toBeGreaterThan(0);
      }
    }
  });
});
