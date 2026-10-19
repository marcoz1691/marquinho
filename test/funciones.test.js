import { it, expect } from "vitest";
import { leerFunciones, funcionWebActiva, leerAjustes } from "../api/_lib/funciones.js";
import { decidir } from "../middleware.js";
it("conserva valores independientes y aplica la dependencia solo en la web", () => {
  const f = leerFunciones({ "funcion.sitio": "0", "funcion.agenda": "1" });
  expect(f.agenda).toBe(true); expect(funcionWebActiva(f, "agenda")).toBe(false);
  const porDefecto = leerFunciones();
  expect(Object.entries(porDefecto).filter(([, v]) => !v).map(([k]) => k)).toEqual(["portal", "pagosEnLinea"]);
  expect(decidir("https://ejemplo.test/cita.html", f)).toBe("https://ejemplo.test/mantenimiento.html");
  expect(decidir("https://ejemplo.test/panel/", f)).toBeNull();
});
it("falla abierto al leer ajustes", async () => {
  expect(await leerAjustes({ ajustes: async () => { throw Error("lectura"); } })).toEqual({});
});
it("reescribe con 503 y falla abierto ante errores", async () => {
 const { default: middleware } = await import("../middleware.js");
 const original = globalThis.fetch;
 try {
 globalThis.fetch = async () => Response.json({ funciones: { sitio: false } });
 const r = await middleware(new Request("https://ejemplo.test/"));
 expect(r.status).toBe(503); expect(r.headers.get("x-middleware-rewrite")).toBe("https://ejemplo.test/mantenimiento.html");
 expect(r.headers.get("Cache-Control")).toBe("no-store");
 globalThis.fetch = async () => { throw Error("sin red"); };
 expect((await middleware(new Request("https://ejemplo.test/"))).headers.get("x-middleware-next")).toBe("1");
 } finally { globalThis.fetch = original; }
});

it("portal y pagos en línea se encienden solo con \"1\"; las demás se apagan solo con \"0\"", () => {
  expect(leerFunciones({ "funcion.portal": "1", "funcion.pagosEnLinea": "x" })).toMatchObject({ portal: true, pagosEnLinea: false, agenda: true });
  expect(leerFunciones({ "funcion.portal": "0", "funcion.agenda": "x" })).toMatchObject({ portal: false, agenda: true });
});
