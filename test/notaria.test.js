import { describe, expect, it } from "vitest";
import { notariaDe, NOTARIA_POR_DEFECTO } from "../api/_lib/notaria.js";

const pedido = (host, reenviado) => new Request(`https://${host}/`, { headers: reenviado ? { "x-forwarded-host": reenviado } : {} });

describe("resolución de notaría", () => {
  it("resuelve un subdominio de Sofía y nunca usa parámetros del navegador", () => {
    expect(notariaDe(pedido("notaria41.sofiaprefirma.com"), {})).toBe("notaria41");
    expect(notariaDe(pedido("notaria-uno.sofiaprefirma.com"), {})).toBe("notaria-uno");
    expect(notariaDe(new Request("https://sofiaprefirma.com/?notaria=otra"), {})).toBe(NOTARIA_POR_DEFECTO);
  });

  it("respeta la notaría fijada por el proyecto e ignora encabezados reenviados del cliente", () => {
    expect(notariaDe(pedido("notaria-dos.sofiaprefirma.com", "notaria-ajena.sofiaprefirma.com"), {})).toBe("notaria-dos");
    expect(notariaDe(pedido("notaria41.sofiaprefirma.com"), { NOTARIA_ID: "piloto-sur" })).toBe("piloto-sur");
  });

  it.each(["www.sofiaprefirma.com", "portal.sofiaprefirma.com", "a.b.sofiaprefirma.com", "sitio.test"])("no convierte un host reservado o inválido en notaría: %s", (host) => {
    expect(notariaDe(pedido(host), {})).toBe(NOTARIA_POR_DEFECTO);
  });
});
