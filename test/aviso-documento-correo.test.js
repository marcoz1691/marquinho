import { it, expect, vi } from "vitest";
import { crearPanel } from "../api/_lib/panel.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";

async function preparar({ conCuenta }) {
  const almacen = crearAlmacenMemoria();
  const conv = await almacen.conversacion("web:s_prueba1234", "");
  const cita = await almacen.crearSolicitudCita({ conversacionId: conv.id, fecha: "2099-03-02", hora: "09:00", nombre: "Ana", tramiteId: "poder-natural", notariaId: "notaria41" });
  if (conCuenta) {
    const cliente = await almacen.crearCliente({ notariaId: "notaria41", email: "ana@ejemplo.ec", emailVerificadoEn: new Date().toISOString() });
    await almacen.crearVinculacion({ notariaId: "notaria41", solicitudId: cita.id, tokenHash: "h1", canal: "creacion", expiraEn: new Date(Date.now() + 864e5).toISOString() });
    await almacen.consumirVinculacion({ notariaId: "notaria41", tokenHash: "h1", clienteId: cliente.id });
  }
  const { id } = await almacen.guardarDocumento({ conversacionId: conv.id, solicitudId: cita.id, descripcion: "Cédula", nombre: "cedula.pdf", tipo: "application/pdf", bytes: new Uint8Array([1]) });
  const enviarCorreo = { enviar: vi.fn(async () => {}) };
  const panel = crearPanel({ almacen, contenido: async () => ({ data: { tramites: [] } }), whatsapp: {}, enviarCorreo });
  return { panel, id, enviarCorreo, codigo: cita.codigo };
}

it("al observar un documento, el cliente con cuenta recibe un correo con la observación", async () => {
  const { panel, id, enviarCorreo, codigo } = await preparar({ conCuenta: true });
  await panel.revisarDocumento(id, "observado", "nota interna", "La foto está borrosa, súbela de nuevo.");
  expect(enviarCorreo.enviar).toHaveBeenCalledTimes(1);
  const [{ para, asunto, texto }] = enviarCorreo.enviar.mock.calls[0];
  expect(para).toBe("ana@ejemplo.ec");
  expect(asunto).toBe("Tu documento necesita una corrección");
  expect(texto).toContain("La foto está borrosa");
  expect(texto).not.toContain("nota interna");
  if (codigo) expect(texto).toContain(`ticket ${codigo}`);
});

it("sin cuenta vinculada no se envía correo", async () => {
  const { panel, id, enviarCorreo } = await preparar({ conCuenta: false });
  await panel.revisarDocumento(id, "aprobado");
  expect(enviarCorreo.enviar).not.toHaveBeenCalled();
});
