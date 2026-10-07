// El script del panel no tiene pruebas de navegador (necesita Supabase): al menos debe ser JavaScript válido,
// porque un error de sintaxis deja toda la página en blanco.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("página del panel", () => {
  it("su script es JavaScript válido", () => {
    const html = readFileSync(new URL("../panel/index.html", import.meta.url), "utf8");
    const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    const archivo = join(mkdtempSync(join(tmpdir(), "panel-")), "panel.mjs");
    writeFileSync(archivo, script);
    expect(() => execFileSync(process.execPath, ["--check", archivo], { stdio: "pipe" })).not.toThrow();
  });
});
