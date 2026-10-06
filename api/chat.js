// Chat del asistente en la página web: https://<dominio>/api/chat
import { crearManejadorChat } from "./_lib/chat-http.js";
import { obtenerServicios } from "./_lib/servicios.js";

export const POST = (request) => {
  const { asistente, almacen } = obtenerServicios();
  return crearManejadorChat({ asistente, almacen }).POST(request);
};
