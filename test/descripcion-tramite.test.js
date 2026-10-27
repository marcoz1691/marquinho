import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { crearPanel } from "../api/_lib/panel.js";
import { crearContenido } from "../api/_lib/contenido.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

it("la descripción que edita el notario en el panel llega al catálogo público", async () => {
  const leer = async (f) => JSON.parse(await readFile(new URL("../data/" + f + ".json", import.meta.url), "utf8"));
  const [tramites, tarifas, notaria] = await Promise.all([leer("tramites"), leer("tarifas"), leer("notaria")]);
  const almacen = crearAlmacenMemoria({ personal: [{ email: "notario@ejemplo.ec", nombre: "Notario", rol: "notario" }] });
  const contenido = crearContenido({ almacen, ahora: () => 0, leerLocal: async () => ({ tramites, tarifas, notaria }) });
  const panel = crearPanel({ almacen, contenido });
  const original = tramites.tramites.find((t) => t.id === "poder-natural");
  await panel.guardarTexto({ tramiteId: "poder-natural", nombre: original.nombre, desc: "Descripción nueva para el ciudadano.", req: original.req, pasos: original.pasos, nota: original.nota ?? "" }, "notario@ejemplo.ec");
  const { data } = await contenido();
  expect(data.tramites.find((t) => t.id === "poder-natural").desc).toBe("Descripción nueva para el ciudadano.");
});
