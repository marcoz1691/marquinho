// phosphor.css solo trae los iconos que usa el sitio: si alguien añade uno nuevo sin regenerarlo, se vería un cuadro vacío.
import { describe, it, expect } from "vitest";
import { iconosUsados, iconosEnCss } from "../scripts/iconos.mjs";

describe("iconos de Phosphor", () => {
  it("todos los iconos usados están en assets/fonts/phosphor.css (si falla: npm run iconos)", () => {
    const enCss = iconosEnCss();
    expect(iconosUsados().filter((n) => !enCss.has(n))).toEqual([]);
  });
});
