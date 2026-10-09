// Tope diario de plantillas de WhatsApp por número de destino. Las plantillas son los únicos mensajes que la notaría
// puede iniciar; el tope evita que un celular escrito en el chat web reciba mensajes repetidos que no pidió.
const DIA = 864e5;

export function limitarPlantillas(whatsapp, almacen, { porDia = 4, exentos = [], ahora = () => Date.now() } = {}) {
  return {
    ...whatsapp,
    async enviarPlantilla(para, ...resto) {
      if (!exentos.includes(String(para))) {
        const n = await almacen.contarUso("plantilla:" + para, DIA, ahora());
        if (n > porDia) throw new Error(`Se alcanzó el tope diario de ${porDia} plantillas para este número`);
      }
      return whatsapp.enviarPlantilla(para, ...resto);
    }
  };
}
