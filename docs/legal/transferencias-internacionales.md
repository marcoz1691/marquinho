# Inventario de transferencias internacionales y actividades de tratamiento

> **Borrador para revisión del notario y su asesor legal.** Sirve de base para inscribir las transferencias internacionales en el Registro Nacional de Protección de Datos, como exige la Resolución SPDP-SPD-2026-0004-R. Esa resolución da un plazo para notificar las transferencias que ya existían; hay que confirmar en spdp.gob.ec la fecha límite y el formulario. Las ubicaciones las verifiqué en la configuración del servicio el 16 de octubre de 2026.

## Transferencias internacionales del sitio web y del asistente

| Proveedor | País de los servidores | Finalidad | Datos que recibe | Garantía o base (LOPDP) |
|---|---|---|---|---|
| **Supabase, Inc.** | Brasil (São Paulo, región sa-east-1) | Guardar conversaciones, citas, documentos de revisión previa, historial de consentimientos y cuentas del personal | Nombre, celular, mensajes, documentos (pueden incluir copias de cédula y escrituras), huella cifrada de IP, correos del personal | Encargado del tratamiento. Acuerdo de tratamiento de datos (DPA) de Supabase: **hay que aceptarlo desde el panel de Supabase**. Consentimiento explícito del titular (art. 60) |
| **Vercel, Inc.** | Estados Unidos (Washington D.C., región iad1) | Alojar el sitio y ejecutar las funciones del servidor | Todo lo que pasa por el sitio en tránsito; registros técnicos con IP | Encargado. El DPA está incluido en las condiciones de Vercel. Consentimiento explícito (art. 60) |
| **Anthropic, PBC** | Estados Unidos | Generar las respuestas del asistente Sofía | Mensajes de la conversación y datos que la persona escriba (nombre, celular, su caso) | Encargado. El DPA está incluido en las condiciones comerciales de Anthropic; sin uso de los datos para entrenar modelos según esas condiciones (**verificar**). Consentimiento explícito (art. 60) |
| **Meta Platforms (WhatsApp Business)** | Estados Unidos y otros países | Recibir y enviar mensajes de WhatsApp | Número, nombre de perfil, mensajes y archivos | Encargado. Condiciones de procesamiento de datos de WhatsApp Business. La persona elige escribir por WhatsApp; se le informa en su primer mensaje |
| **Google LLC** | Estados Unidos y otros países | Publicar el contenido de trámites y tarifas (hoja de Google), que la página lee desde el navegador | Solo la dirección IP del visitante, como en cualquier visita a un sitio de Google; no recibe mensajes ni datos de formularios | Contenido público; se informa en el aviso de privacidad y en la política de cookies |
| **OpenStreetMap Foundation** | Reino Unido y otros países | Mostrar el mapa de ubicación | Dirección IP, **solo si la persona pulsa «Ver el mapa»** | Acción voluntaria de la persona; se informa en la política de cookies |

### Riesgos que se informan al titular (art. 60)

Estos países pueden no tener un nivel de protección de datos equivalente al ecuatoriano, y sus autoridades podrían pedir acceso a los datos conforme a sus leyes. Las transferencias se limitan a lo necesario para atender a la persona.

### Mejora recomendada (técnica, no legal)

Las funciones del sitio corren en Estados Unidos y la base de datos está en Brasil: cada consulta cruza el continente. Mover las funciones de Vercel a São Paulo (región `gru1`, opción `regions` de `vercel.json`) haría el panel y el chat más rápidos, y dejaría los datos de Supabase y Vercel en Brasil. Anthropic y Meta seguirían en Estados Unidos.

## Registro de actividades de tratamiento (sitio web y asistente)

| Actividad | Titulares | Datos | Finalidad | Base legal | Conservación | Encargados |
|---|---|---|---|---|---|---|
| Chat de la web | Visitantes | Mensajes; nombre y celular si agendan | Orientar sobre trámites y agendar | Consentimiento (dos casillas) | 90 días sin actividad | Vercel, Anthropic, Supabase |
| Formulario de cita | Clientes | Nombre, celular, trámite, día y hora, nota | Agendar la visita y enviar avisos | Consentimiento (dos casillas) | 90 días sin actividad (más mientras haya una cita activa) | Vercel, Supabase, Meta |
| WhatsApp con Sofía | Clientes | Número, nombre de perfil, mensajes, archivos | Orientar, agendar, revisión previa | Pedido del titular; consentimiento expreso antes de recibir documentos | 90 días sin actividad | Meta, Vercel, Anthropic, Supabase |
| Revisión previa de documentos | Clientes | Copias de cédulas, escrituras y otros documentos | Preparar el trámite | Consentimiento (dos casillas o «Acepto» en WhatsApp) | Hasta que el personal los elimina; borrado definitivo 7 días después | Supabase |
| Historial de consentimientos | Clientes | Huella cifrada del celular o la sesión, canal, versiones aceptadas y texto aceptado | Demostrar el consentimiento | Obligación de demostrar el consentimiento (Reglamento, art. 5) | 5 años | Supabase |
| Panel del personal | Personal de la notaría | Correo, nombre, perfil, registro de accesos | Dar acceso seguro y auditar | Relación con la notaría | Mientras dure el acceso | Supabase, Vercel |
| Prevención de abusos | Visitantes | Huella cifrada de la IP, contadores | Seguridad del servicio | Interés legítimo en la seguridad | 7 días | Supabase |

Los actos notariales que se otorgan en la notaría (protocolo, índices, etc.) se rigen por la Ley Notarial y no forman parte de este inventario del sitio web.
