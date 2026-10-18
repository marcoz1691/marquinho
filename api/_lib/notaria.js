// Notaría que atiende cada pedido. Hoy el sistema sirve a una sola; con varias, se resolverá por el dominio del pedido.
// Nunca se toma de lo que envía el navegador: lo decide el servidor (docs/multi-notaria.md).
export const NOTARIA_POR_DEFECTO = "notaria41";

export function notariaDe(_request) { return NOTARIA_POR_DEFECTO; }

// Todo método del almacén del portal exige la notaría: sin ella no hay consulta posible (aislamiento entre notarías).
export function exigirNotaria(notariaId) {
  if (typeof notariaId !== "string" || !/^[a-z0-9-]{3,40}$/.test(notariaId)) throw new Error("Falta la notaría o no es válida");
  return notariaId;
}
