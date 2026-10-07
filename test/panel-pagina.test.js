// El script del panel no tiene pruebas de navegador con Supabase real: al menos debe ser JavaScript válido,
// porque un error de sintaxis deja toda la página en blanco (ver también e2e/panel.e2e.js).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

describe("página del panel", () => {
  it("su script es JavaScript válido", () => {
    expect(() => execFileSync(process.execPath, ["--check", fileURLToPath(new URL("../panel/panel.js", import.meta.url))], { stdio: "pipe" })).not.toThrow();
  });

  it("no carga código de otros dominios: la librería de Supabase está alojada aquí con versión fija", () => {
    const html = readFileSync(new URL("../panel/index.html", import.meta.url), "utf8");
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
    expect(html).toMatch(/src="vendor\/supabase-js-\d+\.\d+\.\d+\.js"/);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/);   // sin scripts en línea (los bloquea la CSP)
  });
});

it("la agenda permite buscar tickets de cuatro dígitos y ver el chat de los resultados", () => {
  const html = readFileSync(new URL("../panel/index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../panel/panel.js", import.meta.url), "utf8");
  expect(html).toContain('id="agTicket"');
  expect(html).toContain('pattern="[0-9]{4}"');
  expect(js).toContain('accion: "buscarTicket"');
  expect(js).toContain('esc(x.codigo)');
});
