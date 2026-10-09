# 02 · Evaluación de impacto y análisis de riesgos

**Responsable:** Notaría 41 de Quito (Dr. Dobri Miguel Albornoz Donoso). **Fecha del borrador:** 7 de octubre de 2026. **Sistema evaluado:** asistente de chat web y WhatsApp con IA, base de datos, panel del personal (rama `claude/seguridad`, `de6bcad`).

## 1. Para qué sirve y si es obligatoria

La LOPDP exige evaluación de impacto (EIPD) cuando hay alto riesgo o la Autoridad la pide, y **siempre** en tres casos: perfiles automatizados con efectos jurídicos, tratamiento a gran escala de categorías especiales, u observación sistemática a gran escala; debe hacerse **antes** de empezar el tratamiento (LOPDP art. 42; RGLOPDP arts. 29 a 32). El art. 40 exige además un análisis de riesgos con una metodología que considere el tratamiento, las partes y el volumen de datos.

**Mi lectura (interpretación, a validar por el abogado):** una notaría que recibe cédulas por WhatsApp probablemente **no** trata datos sensibles «a gran escala» ni hace perfiles con efectos jurídicos, así que la EIPD formal quizá no es obligatoria (informe 1.7). Aun así este documento hace una EIPD simplificada porque (a) hay IA y transferencias al extranjero, (b) la foto de una cédula puede ser dato sensible [NO CONFIRMADO], (c) es barato y sirve de prueba de «responsabilidad proactiva» (LOPDP art. 10 k). Si el abogado tiene dudas, el art. 31 del Reglamento permite consultar a la SPDP, que responde en 5 días.

**Importante:** este sistema **ya está en funcionamiento**; la ley pide la evaluación antes de empezar. Debes dejar constancia de la fecha de este documento y no decir que se hizo antes.

## 2. Descripción corta del tratamiento

Ver el detalle en el documento 01. En resumen: la persona escribe por la web o por WhatsApp; un asistente de IA (Claude, de Anthropic, EE. UU.) responde con información de trámites; si la persona quiere una cita, se registra su nombre, trámite, fecha y hora (y celular en la web); por WhatsApp, con su aceptación expresa, puede enviar fotos o PDF de documentos que se guardan en un almacén privado en Brasil para que el personal los revise. El personal usa un panel protegido con doble verificación. Se borra todo a los 90 días sin actividad.

**Qué datos ve la IA:** texto de mensajes, nombre, número de WhatsApp, datos de citas y descripciones de documentos. **Qué datos no ve la IA:** el contenido de los archivos (cédulas, escrituras) [Verificado: `textoUsuario` en `api/_lib/asistente.js`].

## 3. Necesidad y proporcionalidad

| Pregunta | Respuesta |
|---|---|
| ¿Hay una finalidad clara? | Sí: informar, preparar la visita y evitar viajes en vano (LOPDP art. 10, finalidad). |
| ¿Se recoge solo lo necesario? | En general sí: nombre, celular, trámite y documentos que la persona decide enviar. **Excepción:** el texto libre puede contener cualquier dato (cédula, direcciones) y no se filtra. |
| ¿Se pide la cédula cuando hace falta? | La cédula la envía la persona; el asistente la pide según el trámite. No hay lógica que limite qué documentos se piden. |
| ¿Hay alternativa menos intrusiva? | Sí: llevar los documentos el día de la cita. Por eso el envío es opcional y requiere aceptación expresa. |
| ¿Se informa a la persona? | Parcialmente: el aviso actual (`privacidad.html`) tiene 18 brechas frente a la LOPDP art. 12 (informe sección 6) y el texto de consentimiento en WhatsApp es corto. El borrador `privacidad-nueva-BORRADOR.html` corrige las brechas del aviso. |
| ¿Se pueden ejercer los derechos? | Por correo o WhatsApp, atendidos a mano. Falta un mecanismo técnico para revocar el consentimiento y para eliminar una conversación entera desde el panel (documento 04). |

## 4. Matriz de riesgos

**Escala.** Probabilidad: Baja (poco probable en un año), Media (puede ocurrir), Alta (probable). Impacto sobre las personas: Bajo (molestia), Medio (perjuicio limitado), Alto (suplantación, fraude o daño difícil de reparar). **Riesgo residual** = el que queda con las medidas que **existen hoy**. Son estimaciones mías, no mediciones; el notario y el abogado deben ajustarlas.

| # | Riesgo | Prob. | Impacto | Medidas que existen hoy (verificadas) | Riesgo residual |
|---|---|---|---|---|---|
| R1 | **Filtración de cédulas guardadas** (acceso no autorizado al almacén o a la base). Las cédulas permiten suplantación y fraude. | Baja | Alto | Bucket privado; base con RLS sin políticas (solo la clave de servidor accede); enlaces de 120 s; panel con doble verificación y lista de personal; límite de 60 documentos por hora y persona; auditoría de cada apertura; borrado a los 90 días. | **Medio.** Una sola clave (`SUPABASE_SERVICE_ROLE_KEY`) da acceso a todo; si se filtra, no hay segunda barrera. Los datos no están cifrados con una clave propia de la notaría (solo cifrado del proveedor). Faltan acuerdos de confidencialidad con personal y desarrollador. |
| R2 | **Acceso indebido del propio personal** (curiosidad o mala intención). Es el mayor riesgo penal señalado en el informe 2.2 (COIP arts. 178, 179 y 229, versión de 2018). | Media | Alto | Doble verificación; auditoría inmutable de detalles, documentos y acciones; lista de personal revisada en cada solicitud. | **Medio.** La **lista de conversaciones y la agenda no se auditan**, aunque muestran nombre, número y último mensaje. Nadie revisa la auditoría de forma periódica (no hay procedimiento). Falta el acuerdo de confidencialidad firmado. |
| R3 | **Cuenta del personal comprometida** (contraseña robada, equipo infectado). | Media | Alto | Doble verificación obligatoria (se puede apagar solo con una variable explícita); correo confirmado; sesión validada contra Supabase en cada llamada. | **Bajo a medio.** Depende de que `PANEL_MFA` no esté en `desactivada` y de que el registro público de usuarios de Supabase esté apagado [NO CONFIRMADO: es configuración fuera del código]. |
| R4 | **Datos enviados a la IA fuera del Ecuador** (nombre, número, citas, texto libre). | Alta (ocurre en cada conversación) | Medio | Las imágenes y PDF no se envían; Anthropic no entrena con datos comerciales y borra en hasta 30 días (informe 3.1); contrato de encargo incorporado por referencia. | **Medio.** No hay declaración de adecuación para EE. UU. ni cláusulas tipo avaladas por la SPDP [NO CONFIRMADO]; no se informa a la persona (hasta que se publique el nuevo aviso); no se pidió retención cero. |
| R5 | **La persona escribe datos sensibles o de terceros en el texto** (cédula, salud, datos de un menor) y llegan a la IA y a la base. | Media | Medio a alto | Advertencia «no compartas datos sensibles» en el chat web; instrucciones del asistente de pedir documentos solo por WhatsApp con aceptación. | **Medio.** No hay filtro técnico ni enmascarado. |
| R6 | **Cédula como dato biométrico sensible.** Si lo es, se necesita consentimiento explícito y medidas reforzadas (LOPDP arts. 4 y 26 a). | Media | Alto | Se pide aceptación expresa antes de guardar y el sistema bloquea el guardado sin ella; se guarda la prueba (fecha, texto del cliente, versión). | **Medio.** El texto del consentimiento no menciona IA, EE. UU., Brasil ni el plazo, así que quizá no cumple el nivel de información de RGLOPDP art. 5. [NO CONFIRMADO: duda 1]. |
| R7 | **Web con celular no verificado**: alguien escribe el número de otra persona y esta recibe mensajes de la notaría con un nombre y trámite que no pidió. | Media | Bajo a medio | Las citas web siempre quedan pendientes hasta que el personal las confirma; tope de 4 plantillas por día y número; plantillas aprobadas por Meta. | **Bajo a medio.** Al confirmar el personal, la plantilla `cita_confirmada` se envía a ese número: si es ajeno, recibe nombre y trámite de un tercero. Sin verificación por código. |
| R8 | **Conservación excesiva**: datos que se guardan más de lo necesario. | Alta | Medio | Purga diaria a los 90 días sin actividad; borrado de documentos 7 días después de «Borrar». | **Medio.** La tabla de contadores `uso` (con números de celular, huellas de IP y correos) **nunca se purga**; la auditoría tampoco tiene plazo; copias de seguridad de Supabase sin plazo conocido [NO CONFIRMADO]; el plazo de 90 días no está decidido por el notario. |
| R9 | **No poder atender un derecho en 15 días** (por ejemplo, eliminar todo de una persona). | Media | Medio | Procedimiento manual con consultas en Supabase (documento 04); el borrado de documentos desde el panel funciona. | **Medio.** No hay botón para borrar una conversación completa; si se borra la fila de la conversación sin quitar antes los archivos, **quedan archivos huérfanos** en el bucket (la eliminación en cascada borra las filas, no los archivos). Requiere cuidado manual. |
| R10 | **Revocar el consentimiento y que el sistema siga tratando datos.** | Media | Medio | El sistema bloquea nuevos documentos si el campo de consentimiento es falso. | **Medio.** No existe una orden «revocar» en el asistente ni en el panel. Se debe hacer a mano (documento 04). El Reglamento (art. 6) exige suspender el tratamiento al recibir la revocación. |
| R11 | **Brecha en un proveedor sin aviso a tiempo.** La ley da 2 días al encargado para avisar (LOPDP art. 43). | Baja | Alto | Anthropic y Supabase comprometen 48 horas (informe 3.1 y 3.2). | **Medio.** Vercel solo promete «sin demora indebida» (informe 3.3) y su contrato no aplica al plan gratuito. Meta: términos sin revisar. |
| R12 | **Registros del servidor con datos personales** (Vercel guarda registros de ejecución). | Media | Medio | El código solo escribe identificadores y mensajes de error, no el texto de los mensajes. | **Bajo a medio.** [NO CONFIRMADO] qué incluyen los mensajes de error de proveedores y cuánto tiempo guarda Vercel los registros. |
| R13 | **Correo de contacto en Gmail gratuito** recibe solicitudes de derechos con datos y copias de cédulas. | Media | Medio | Ninguna específica. | **Medio.** Sin contrato de encargo ni controles de empresa (informe 3.5). |
| R14 | **La IA responde algo incorrecto** (tarifa, requisito) y la persona actúa por eso. No es un riesgo de datos, pero afecta al titular. | Media | Bajo a medio | Las tarifas se calculan con una herramienta, no con el modelo; el asistente solo responde con la base de conocimiento; todos los trámites se firman en persona; no da asesoría legal personalizada. | **Bajo.** |
| R15 | **Decisión automatizada**: citas confirmadas sin intervención humana (WhatsApp, trámites sin revisión). | Media | Bajo | Solo reserva un cupo; no tiene efectos jurídicos; el personal puede rechazar o cancelar. | **Bajo.** Hay que informarlo (LOPDP arts. 12.17 y 20) y ofrecer la intervención humana. El borrador del aviso lo hace. |
| R16 | **Menores de edad** (por ejemplo, permisos de salida): se reciben cédulas o partidas de menores. | Media | Alto | Ninguna específica. | **Medio a alto.** LOPDP art. 21: datos de menores requieren autorización expresa del representante; el asistente no verifica quién escribe. |
| R17 | **Dependencia de proveedor / pérdida de servicio** (se cae Vercel, Supabase, Meta o Anthropic; se pierde la base). | Media | Bajo | El asistente responde con una disculpa y remite al teléfono; el sitio estático sigue en pie. | **Bajo** para datos personales; es un riesgo de disponibilidad. [NO CONFIRMADO] plan de copias y recuperación de Supabase. |
| R18 | **Suplantación de identidad en WhatsApp** (alguien usa el número de otro para pedir sus datos). | Baja | Medio | El asistente solo muestra al cliente su propio estado (por conversación) y no entrega documentos. | **Bajo.** Atención de derechos debe verificar identidad (documento 04). |

## 5. Medidas que reducen los riesgos (resumen)

Existen hoy y están en el código: doble verificación del panel, auditoría inmutable, almacén privado, enlaces de 120 s, límites de descarga y de uso, validación de archivos, firma del webhook, secretos de las tareas programadas, retención automática, encabezados y CSP, **no enviar imágenes a la IA**.

## 6. Conclusiones

1. **El diseño reduce bien el riesgo principal** (cédulas): no van a la IA, se guardan en un almacén privado, el acceso del personal queda registrado y se borran solos.
2. **El riesgo residual más alto no es técnico sino documental y de gobierno:** sin contratos de confidencialidad firmados, sin DPA archivados, sin plazos aprobados por el notario, sin inscripción en el Registro Nacional y con el aviso público incompleto, el notario no podría *demostrar* lo que el sistema hace (LOPDP art. 10 k).
3. **Se puede continuar el tratamiento** con las medidas actuales si el notario acepta los riesgos residuales «medio» de la matriz y se compromete a cerrar los pendientes de la sección 7. Esa aceptación es **decisión del notario**; no la asumo yo.
4. No identifiqué un riesgo que obligue a **suspender** el servicio. [Opinión de quien escribe el dossier; el abogado puede discrepar.]

## 7. Qué falta (por prioridad)

**Alta**
- Publicar el nuevo aviso de privacidad y actualizar a la vez el **texto del consentimiento** que usa el asistente y la **versión del aviso** (`AVISO_PRIVACIDAD` en `asistente.js`).
- Archivar los DPA de Anthropic, Supabase, Vercel y Meta; confirmar el plan **Pro** de Vercel.
- Firmar acuerdos de confidencialidad (personal y desarrollador).
- Decidir y escribir los plazos de conservación; fijar plazo para la auditoría (la tabla `uso` ya se purga a los 7 días).
- Implementar un procedimiento para **revocar el consentimiento** y para **borrar una conversación completa** sin dejar archivos huérfanos.
- Decidir el trato de los datos de **menores**.

**Media**
- Inscribir en el Registro Nacional si la plataforma está operativa.
- Auditar también la lista de conversaciones y la agenda; revisar la auditoría cada mes (procedimiento en el documento 03).
- Verificar el celular de las citas web (por ejemplo, con un código por WhatsApp) o dejar de enviar plantillas a números no verificados.
- Cambiar el correo de contacto por Google Workspace u otro con contrato.
- Valorar sal secreta para la huella de IP y que ésta sea por periodo.
- Valorar pedir retención cero a Anthropic.
- Aviso visible en el chat web antes del primer mensaje.

**Baja**
- Alojar fuentes e íconos en el propio sitio.
- Fijar la región de las funciones de Vercel (por ejemplo, São Paulo) para acercarlas a la base [NO CONFIRMADO si es posible en el plan].
- Simulacro anual del plan de incidentes.

## 8. Revisión

Esta evaluación se repite cuando cambie el modelo de IA o su proveedor, se añada un canal o un tipo de dato, o al menos cada año.

| Fecha | Preparado por | Aprobado por el notario | Firma |
|---|---|---|---|
| 2026-10-07 | Borrador del equipo técnico | [pendiente] | [pendiente] |
