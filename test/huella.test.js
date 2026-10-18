import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { huellaIp, ipDe } from "../api/_lib/huella.js";

const pedido = (xff) => new Request("https://ejemplo.test/", { headers: xff ? { "x-forwarded-for": xff } : {} });

it("usa la primera IP del encabezado, nunca la guarda en claro y conserva el formato de los contadores existentes", () => {
  expect(ipDe(pedido("190.152.10.20, 10.0.0.1"))).toBe("190.152.10.20");
  expect(ipDe(pedido())).toBe("desconocida");
  const h = huellaIp(pedido("190.152.10.20, 10.0.0.1"));
  expect(h).toBe(createHash("sha256").update("notaria41:190.152.10.20").digest("hex").slice(0, 24));
  expect(h).not.toContain("190");
});
