# Cumplimiento legal del sitio y del asistente

Estado al 16 de octubre de 2026. Este documento lo debe revisar el notario o su asesor legal: los textos del sitio son una base razonable, no una opinión jurídica.

## Normas que aplican

- **Ley Orgánica de Protección de Datos Personales (LOPDP)**, Registro Oficial Suplemento 459, 26 de mayo de 2021. Su régimen sancionador rige desde mayo de 2023.
- **Reglamento General de la LOPDP**, Decreto Ejecutivo 904, 6 de noviembre de 2023.
- **Resoluciones de la Superintendencia de Protección de Datos Personales (SPDP)**, entre ellas:
  - SPDP-SPD-2025-0028-R, sobre el delegado de protección de datos.
  - SPDP-SPD-2026-0004-R, norma general de transferencias internacionales.
  - SPDP-SPD-2026-0005-R, sobre tratamiento a gran escala.
- **Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos**, que da validez a las aceptaciones y avisos electrónicos.
- **Ley Orgánica de Defensa del Consumidor**, que respalda los términos, precios y reembolsos.
- **Ley Notarial** y la normativa del Consejo de la Judicatura sobre las tarifas notariales (Resolución 216-2017).

## Lo que ya hace el sitio

| # | Pedido | Cómo se cumple |
|---|---|---|
| 1 | Términos y condiciones | [terminos.html](../../terminos.html), con versión en `js/legal.js`. |
| 2 | Política de privacidad | [privacidad.html](../../privacidad.html) cubre lo que exige el art. 12 de la LOPDP: responsable, datos, finalidades, base legal, decisiones automatizadas, destinatarios, transferencias internacionales y sus riesgos, conservación, derechos con plazo de 15 días, reclamo ante la SPDP, consecuencias de no entregar datos, menores, seguridad y cambios. |
| 3 | Política de cookies | [cookies.html](../../cookies.html). El sitio **no usa cookies**: solo usa almacenamiento local necesario para funcionar. Por eso no hace falta un aviso de consentimiento de cookies, siguiendo el criterio de técnicas necesarias frente a analítica. El mapa de OpenStreetMap solo se carga si la persona lo pide. |
| 4 | Dos casillas separadas | El formulario de cita, la subida de documentos y el chat web piden por separado «Acepto los términos y condiciones» y «Autorizo el tratamiento de mis datos…», esta última con la transferencia internacional (art. 60). El servidor rechaza el envío si falta cualquiera de las dos. |
| 5 | Registro de aceptaciones | Tabla `consentimientos`: fecha, canal (formulario, chat-web, whatsapp, documentos), versión del aviso y de los términos, y lo que marcó o escribió la persona. Guarda una huella cifrada, no el celular. Se conserva 5 años. La conversación guarda además su propia evidencia (Reglamento, art. 5). |
| 6 | Política de reembolsos | [reembolsos.html](../../reembolsos.html): el sitio no cobra, se paga en la notaría con factura y la notaría nunca pide pagos por chat. Explica cómo pedir un reembolso. |
| 7 | Solo los datos necesarios | Cita: nombre, celular, trámite, día y hora y nota opcional. Chat: no pide datos salvo para agendar. La IP se guarda solo como huella cifrada. Las conversaciones se borran tras 90 días sin actividad. |
| 8 | Derechos de las imágenes | El sitio no usa fotos. Usa el sello de la notaría, que es propiedad del notario. Las fuentes son Archivo, con licencia SIL Open Font License, y los íconos son Phosphor, con licencia MIT; ambos se sirven desde el propio sitio. El mapa es de OpenStreetMap, con licencia ODbL, y su atribución aparece en el mapa. |
| 9 | Leyes locales | Ver «Pendientes del notario». |

## Pendientes del notario (no se resuelven con código)

1. **Revisar y aprobar los textos** de privacidad, términos, cookies y reembolsos. En especial la política de reembolsos: describe un procedimiento general que debe coincidir con la práctica de la notaría.
2. **Delegado de protección de datos (art. 48 de la LOPDP).** Es obligatorio, entre otros casos, en el tratamiento que hace el sector público. Las notarías son órganos auxiliares de la Función Judicial, así que es probable que la notaría deba **designar un delegado y registrarlo ante la SPDP** (Resolución SPDP-SPD-2025-0028-R). Hay que confirmarlo con el asesor legal. Cuando exista, agregar su nombre y contacto en el aviso de privacidad.
3. **Transferencias internacionales.** Los proveedores (Meta, Anthropic, Supabase, Vercel y Google) procesan datos fuera del Ecuador. La Resolución SPDP-SPD-2026-0004-R exige **inscribir las transferencias internacionales en el Registro Nacional de Protección de Datos** y da un plazo para notificar las que ya existían. Hay que hacer esa inscripción y confirmar que estén aceptados los acuerdos de tratamiento de datos de cada proveedor:
   - Supabase: el acuerdo se firma desde su panel.
   - Vercel y Anthropic: el acuerdo está incluido en sus condiciones comerciales.
   - Meta: el acuerdo está en las condiciones de WhatsApp Business.
4. **Procedimiento ante una vulneración de seguridad.** Hay que notificar a la SPDP y a ARCOTEL dentro de 5 días (art. 43) y avisar a las personas si hay riesgo alto. Conviene definir quién lo hace.
5. **Atención de derechos.** Las solicitudes de acceso, rectificación, eliminación, oposición o portabilidad llegan a notaria41uio@gmail.com o por WhatsApp. Se responden en 15 días; conviene registrar cada solicitud y su respuesta.
6. **Ley Orgánica de Transparencia y Acceso a la Información Pública (LOTAIP).** Si al notario le aplican obligaciones de transparencia como prestador de un servicio público, se publican en su propio canal. Hay que confirmarlo con el asesor.

## Antes de publicar

- Ejecutar en Supabase el bloque «2026-10-16: historial de consentimientos» de `supabase/esquema.sql`. Si no se ejecuta, el sitio sigue funcionando y guarda la evidencia en la conversación, pero el historial de 5 años no se llena.
- Cada vez que cambie el aviso de privacidad o los términos, subir la versión en `js/legal.js`. Así la web vuelve a pedir la aceptación y el historial distingue la versión aceptada.
