import { describe, it, expect } from "vitest";
import { autorizadoCron } from "../api/_lib/cron.js";

const pedir = (auth) => new Request("https://x/api/recordatorios", { headers: auth ? { authorization: auth } : {} });
const SECRETO = "s".repeat(32);

describe("autorizadoCron", () => {
  it("acepta el secreto correcto de Vercel Cron", () => {
    expect(autorizadoCron(pedir("Bearer " + SECRETO), SECRETO)).toBe(true);
  });

  it("rechaza un secreto distinto o sin cabecera", () => {
    expect(autorizadoCron(pedir("Bearer " + "x".repeat(32)), SECRETO)).toBe(false);
    expect(autorizadoCron(pedir(null), SECRETO)).toBe(false);
  });

  it("rechaza todo si CRON_SECRET no está configurado (no basta con mandar 'Bearer undefined')", () => {
    expect(autorizadoCron(pedir("Bearer undefined"), undefined)).toBe(false);
    expect(autorizadoCron(pedir("Bearer "), "")).toBe(false);
  });

  it("rechaza un CRON_SECRET demasiado corto para ser seguro", () => {
    expect(autorizadoCron(pedir("Bearer abc"), "abc")).toBe(false);
  });
});
