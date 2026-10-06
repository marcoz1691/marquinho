// API del panel del personal: https://<dominio>/api/panel
import { crearManejadorPanel } from "./_lib/panel-http.js";
import { obtenerServicios } from "./_lib/servicios.js";

const manejador = () => {
  const { panel, almacen } = obtenerServicios();
  return crearManejadorPanel({ panel, auth: almacen });
};

export const GET = (request) => manejador().GET(request);
export const POST = (request) => manejador().POST(request);
