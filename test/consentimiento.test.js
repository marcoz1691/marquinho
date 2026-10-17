import { it, expect, vi } from "vitest";
import { registrarConsentimiento, huellaTitular } from "../api/_lib/consentimiento.js";
import { AVISO_PRIVACIDAD, TERMINOS } from "../js/legal.js";

it("guarda canal, versiones y huella del titular; sin términos deja la versión vacía", async () => {
  const guardados = [];
  await registrarConsentimiento({ registrarConsentimiento: async (c) => guardados.push(c) }, { canal: "whatsapp", titular: "593991112233", texto: "Acepto", terminos: false, t: new Date("2026-10-16T15:00:00Z") });
  expect(guardados).toEqual([{ canal: "whatsapp", titular: huellaTitular("593991112233"), aviso: AVISO_PRIVACIDAD, terminos: "", texto: "Acepto", creado: "2026-10-16T15:00:00.000Z" }]);
  expect(huellaTitular("593991112233")).not.toBe(huellaTitular("593991112234"));
  expect(TERMINOS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it("si el historial falla (por ejemplo, sin la migración), no corta la atención", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(registrarConsentimiento({ registrarConsentimiento: async () => { throw new Error("relation consentimientos does not exist"); } }, { canal: "formulario", titular: "x", texto: "y" })).resolves.toBeUndefined();
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});
