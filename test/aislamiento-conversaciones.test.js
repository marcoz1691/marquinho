import { it, expect } from "vitest";
import { crearAlmacenSupabase } from "../api/_lib/almacen-supabase.js";

// Cliente falso que anota cada consulta: basta para comprobar que todo lo que toca conversaciones lleva la notaría.
function clienteFalso(registro) {
  const constructor = (tabla) => {
    const q = { tabla, filtros: [] };
    const cadena = new Proxy(q, {
      get(obj, prop) {
        if (prop === "then") return (resolver) => resolver({ data: [], error: null });
        if (prop === "eq") return (c, v) => { obj.filtros.push([c, v]); return cadena; };
        if (prop === "select" || prop === "order" || prop === "limit" || prop === "update" || prop === "delete" || prop === "in" || prop === "lt" || prop === "is") return () => cadena;
        if (prop === "insert") return (fila) => { obj.insertado = fila; return cadena; };
        if (prop === "maybeSingle" || prop === "single") return () => { registro.push({ tabla, filtros: obj.filtros, insertado: obj.insertado }); return Promise.resolve({ data: null, error: null }); };
        return undefined;
      }
    });
    return cadena;
  };
  return { from: (tabla) => { const q = constructor(tabla); return q; } };
}

it("las conversaciones se leen y se crean solo dentro de la notaría del almacén", async () => {
  const registro = [];
  const almacen = crearAlmacenSupabase({ cliente: clienteFalso(registro), notariaId: "notaria41" });
  await almacen.conversacion("web:abc123", "");
  await almacen.conversacionPorTelefono("web:abc123");
  await almacen.conversacionPorId("00000000-0000-0000-0000-000000000000");
  const todas = registro.filter((r) => r.tabla === "conversaciones");
  expect(todas.length).toBeGreaterThan(0);
  for (const r of todas) {
    const dentro = r.insertado ? r.insertado.notaria_id === "notaria41" : r.filtros.some(([c, v]) => c === "notaria_id" && v === "notaria41");
    expect(dentro).toBe(true);
  }
});
