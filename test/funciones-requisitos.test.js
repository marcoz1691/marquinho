import { it, expect } from "vitest";
import { leerFunciones, faltaConfiguracion } from "../api/_lib/funciones.js";

const encendidas = { "funcion.portal": "1", "funcion.pagosEnLinea": "1" };

it("en un despliegue, Mis trámites y Pagos no quedan encendidos sin su configuración", () => {
  const f = leerFunciones(encendidas, { VERCEL_ENV: "production" });
  expect(f.portal).toBe(false);
  expect(f.pagosEnLinea).toBe(false);
  expect(faltaConfiguracion("portal", { VERCEL_ENV: "production" })).toContain("correos");
});

it("con su configuración se encienden, y en desarrollo no se exige nada", () => {
  const env = { VERCEL_ENV: "production", CUENTA_SECRETO: "x", RESEND_API_KEY: "x", CORREO_REMITENTE: "x" };
  expect(leerFunciones(encendidas, env).portal).toBe(true);
  expect(leerFunciones(encendidas, {}).portal).toBe(true);
  expect(faltaConfiguracion("agenda", { VERCEL_ENV: "production" })).toBe(null);
});
