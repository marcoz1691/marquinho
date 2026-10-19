// Pagos en línea del portal: https://<dominio>/api/pagos (cliente) y /api/pagos-webhook → /api/pagos?webhook=tramite (pasarela).
// Sin pasarela configurada (hoy no hay ninguna real) responde 404 y el pago se hace en la notaría.
import { crearManejadorPagos } from "./_lib/pagos-http.js";
import { obtenerProveedorPagos } from "./_lib/pagos/proveedor.js";
import { obtenerServicios } from "./_lib/servicios.js";

let proveedor;
const manejador = () => {
  const { almacen, contenido } = obtenerServicios();
  if (proveedor === undefined) proveedor = obtenerProveedorPagos(process.env);
  return crearManejadorPagos({ almacen, contenido, proveedor });
};

export const GET = (request) => manejador().GET(request);
export const POST = (request) => manejador().POST(request);
