# 04 · Política de retención y procedimiento para atender derechos

**Notaría 41 de Quito.** Borrador del 7 de octubre de 2026, para aprobación del notario. Cada dato técnico está comprobado en el código (rama `claude/seguridad`, `de6bcad`). No es asesoría legal.

## Parte A · Retención

### A.1 Lo que exige la ley

Los datos se conservan solo el tiempo necesario y el responsable fija plazos de supresión o revisión periódica (LOPDP art. 10 i). El registro de la base de datos debe incluir el plazo de conservación (RGLOPDP art. 10) y la eliminación al vencer debe ser segura (RGLOPDP art. 11). El aviso al titular debe decir el tiempo de conservación (LOPDP art. 12 núm. 4; RGLOPDP art. 5).

### A.2 Qué se guarda y cuánto tiempo (estado real del sistema)

| Dato | Dónde | Plazo actual | Cómo se elimina | Observación |
|---|---|---|---|---|
| Conversaciones (mensajes, sesiones, mensajes en cola), número de WhatsApp, nombre, marca y prueba de consentimiento | Supabase, tablas `conversaciones`, `sesiones`, `mensajes`, `pendientes`, `archivos` | **90 días sin actividad** por defecto (`RETENCION_DIAS`; mínimo 30; si el valor es inválido o está vacío, se usa 90) | La purga diaria (cron `/api/purgar`, 08:00 UTC = 03:00 Quito) borra la conversación y, en cascada, todo lo anterior | «Sin actividad» significa que la fecha del último mensaje del cliente, la última actividad y la creación son todas anteriores al corte. Se procesan hasta **200 conversaciones por corrida**. |
| Solicitudes de cita (nombre, trámite, fecha, hora, nota, celular de la web) | Supabase, `solicitudes_cita` | Igual que la conversación, **pero** una conversación con una cita pendiente o confirmada de fecha de hoy o futura **no se purga** | En cascada con la conversación | |
| Documentos (archivos) | Supabase Storage, bucket privado `documentos`; y filas en `documentos` | 90 días sin actividad de la conversación; **o** 7 días después de «Borrar» en el panel | La purga borra primero los archivos del bucket y luego las filas | Entre 7 y 8 días tras «Borrar», por el horario del cron. La ventana de «Borrar» es **recuperable**: durante 7 días el archivo sigue en el bucket aunque ya no aparece en el panel. |
| Registro de mensajes ya procesados de WhatsApp (evita duplicados) | `procesados` | 30 días | La misma purga | |
| Contadores de uso (incluyen números de celular, huellas de IP, correos del personal, id de conversaciones) | `uso` | **7 días** | Purga diaria automática | Resuelto: se borran a los 7 días. |
| Auditoría del panel | `auditoria` | **Sin plazo; inmutable** | No se puede borrar con consultas normales | **Decisión pendiente.** Contiene correo del personal y ids; no contiene mensajes ni documentos. |
| Personal autorizado | `personal` | Mientras trabaje en la notaría | Borrar la fila al terminar la relación | Hacerlo el mismo día de la salida. |
| Copias de seguridad de Supabase | Supabase | [NO CONFIRMADO] | — | Las copias también contienen cédulas; hay que conocer su plazo para poder afirmar «borrado». |
| Mensajes en WhatsApp (Meta) | Meta | Hasta 30 días (informe 3.4) | Meta | No controlable por la notaría. |
| Entradas y salidas de la IA | Anthropic | Hasta 30 días (informe 3.1); más tiempo si el contenido se marca por infringir la política de uso (hasta 2 años) | Anthropic | Retención cero solo con acuerdo (decisión pendiente). |
| Conversaciones en el navegador del visitante web | `localStorage` del equipo de la persona | Hasta que ella las borre (30 conversaciones, 60 mensajes cada una) | La persona, desde el botón de borrar del chat | **Borrar en el navegador no borra la copia del servidor.** |
| Avisos al número de WhatsApp del personal | Teléfono del personal y Meta | Lo que el personal conserve | El personal | Contienen nombres, trámites y a veces números. Política de dispositivos pendiente. |
| Solicitudes de derechos y respuestas | Correo Gmail / carpeta | [Decisión del notario / abogado] | — | Se deben registrar (RGLOPDP art. 15). |

### A.3 Lo que debes decidir

El informe legal propone (no es exigencia legal): cédulas, borrado automático entre **30 y 90 días** después de la cita o trámite; conversaciones, entre **6 y 12 meses** (informe 5 y «Lo que debe firmar o decidir» núm. 1). El sistema hoy aplica **90 días sin actividad a todo junto**, que cae dentro del rango para cédulas y por debajo del de conversaciones. Decide:

1. ¿Se mantiene **90 días** para todo? ¿Se quiere separar (por ejemplo, documentos más cortos que conversaciones)? Separar exige un cambio de código.
2. ¿Cuánto se conserva la **prueba de consentimiento** (hoy se borra con la conversación)?
3. ¿Cuánto se conserva la **auditoría** y la tabla `uso`?
4. ¿Qué ocurre con documentos de un **trámite aún en curso** a los 90 días de silencio? Hoy se borran. La notaría debería haber bajado lo necesario al expediente físico o al protocolo antes; si un documento se incorporó a una escritura, ese original pertenece al protocolo, que es del Estado (Ley Notarial art. 22) y el borrado de la pre-revisión no lo afecta. [NO CONFIRMADO] el régimen exacto: duda para el abogado.
5. ¿Qué plazo máximo aceptas para las copias de seguridad?

Escribe aquí lo que decidas y úsalo en el aviso público y en el Registro Nacional:

| Dato | Plazo decidido | Fecha y firma |
|---|---|---|
| Conversaciones y citas | [___] | |
| Documentos | [___] | |
| Prueba de consentimiento | [___] | |
| Auditoría | [___] | |
| Contadores `uso` | [___] | |

### A.4 Cómo se elimina

- **Automática** (diaria): purga descrita arriba. Verifica que corre: en Vercel, Project → Cron Jobs, última ejecución de `/api/purgar`; el cron devuelve un resumen con el número de conversaciones y documentos eliminados. La respuesta es 401 si falta `CRON_SECRET` o tiene menos de 16 caracteres. **Guarda evidencia mensual** (captura de la ejecución), como pide el informe (sección 4, núm. 13).
- **Manual desde el panel:** botón **Borrar** en cada documento (pide confirmación). Marca el documento como borrado y desaparece de la vista; el archivo se elimina en la purga siguiente a los 7 días. El mensaje de confirmación dice «No se puede deshacer», pero en realidad es recuperable durante 7 días desde la base de datos.
- **Manual en Supabase:** para borrar una conversación entera o atender una solicitud urgente (ver parte B). El panel **no** tiene botón para borrar conversaciones completas.
- La eliminación debe dejar los datos «ilegibles o irreconocibles de forma definitiva y segura» (LOPDP art. 15, inciso final). Borrar la fila y el archivo de Supabase cumple lo que el sistema controla; las copias de seguridad dependen del proveedor [NO CONFIRMADO].

### A.5 Qué no se borra (y por qué)

- Lo que pasó al **protocolo notarial** o al expediente físico: se rige por la Ley Notarial (art. 22) y no es parte de este sistema.
- La **auditoría**: registra acciones del personal, no datos del cliente. [Duda: base legal para conservarla frente a una petición de eliminación. LOPDP art. 18 núm. 2 y 4 permiten no eliminar cuando los datos son necesarios para una obligación legal o para la defensa de reclamos; el abogado debe confirmar.]

---

## Parte B · Procedimiento para atender derechos (ARCO+) en 15 días

### B.1 Qué derechos y qué plazos

| Derecho | Artículo LOPDP | Plazo de respuesta |
|---|---|---|
| Acceso (gratuito) | 13 | 15 días |
| Rectificación y actualización | 14 | 15 días |
| Eliminación | 15 | 15 días |
| Oposición | 16 | 15 días |
| Portabilidad | 17 | [NO CONFIRMADO]: el texto no fija días; lo regulará la Autoridad. Aplica el plazo de 15 días por prudencia. |
| Suspensión (limitación) | 19 | [NO CONFIRMADO]: no fija días. Aplica 15 días por prudencia. |
| No ser objeto de decisiones automatizadas | 20 | [NO CONFIRMADO]: no fija días. Aplica 15 días por prudencia. |
| Niñas, niños y adolescentes | 21 | Representante legal o autorización expresa |
| Revocar el consentimiento | 8 | Sin justificar; al recibirla se **suspende** el tratamiento (RGLOPDP art. 6) |

- Los 15 días son «días» según el texto; [NO CONFIRMADO] si hábiles o corridos. **Cuenta corridos y responde antes** (informe 1.6).
- Si no respondes a tiempo o niegas, la persona puede reclamar ante la SPDP (LOPDP art. 64), lo que además es infracción leve (art. 67 núm. 1).
- **Excepciones** (LOPDP art. 18): no proceden rectificación, eliminación, oposición, anulación ni portabilidad si quien pide no es el titular o su representante acreditado, si los datos son necesarios para una obligación legal o contractual, para cumplir una orden de autoridad, para formular o defender reclamos, para evitar perjuicio a terceros acreditado, etc. Si vas a negar, **explica el motivo por escrito** y consulta al abogado.

### B.2 Cómo llega una solicitud

Por correo (notaria41uio@gmail.com), por WhatsApp, por teléfono o en la notaría. Quien la recibe la pasa **el mismo día** al responsable interno. Se recomienda canales digitales sencillos y verificar identidad (RGLOPDP arts. 12 a 14, informe 1.15).

### B.3 Registro de solicitudes (obligatorio)

El sistema **no tiene** un registro de solicitudes; llévalo en una hoja aparte (RGLOPDP art. 15: registrar todas las solicitudes y cómo se atendieron). Columnas:

| Nº | Recibida (fecha, canal) | Titular y contacto | Derecho | Identidad verificada (cómo) | Aclaración pedida (fecha) | Plazo (día 15) | Qué se hizo | Respondida (fecha, canal) | Negada / excepción |
|---|---|---|---|---|---|---|---|---|---|

### B.4 Pasos

**Paso 1 · Día 0 · Registrar y confirmar recepción.** Anota la solicitud con la fecha. Responde que la recibiste y que contestarás antes del día 15.

**Paso 2 · Hasta el día 5 · Verificar identidad y aclarar, una sola vez.**
- Si la solicitud es incompleta, puedes pedir que la aclaren **una sola vez, dentro de 5 días**, y la persona tiene 10 días para completarla (RGLOPDP art. 12 a 15, informe 1.15).
- Verifica sin pedir más datos de los necesarios. Lo más sólido es que la solicitud venga **desde el mismo número de WhatsApp** que está en la conversación. Si llega por correo, responde pidiéndole que la confirme por WhatsApp desde ese número, o devuélvele la llamada al teléfono que tienes. Evita pedir una copia nueva de la cédula salvo que el abogado lo indique: sería más datos.
- Si actúa un representante (padre, madre o tutor de un menor, o apoderado), pide el documento que lo acredite (LOPDP art. 18 núm. 1 y art. 21).

**Paso 3 · Localizar los datos.** En Supabase → SQL Editor (solo lectura). Reemplaza el valor entre comillas. El teléfono va en formato internacional, por ejemplo `593991234567`.

```sql
-- 1) Conversación de WhatsApp de esa persona
select id, telefono, nombre, consentimiento, consentimiento_en, consentimiento_texto, consentimiento_aviso, derivada, creada
from conversaciones where telefono = '593991234567';

-- 2) Mensajes (el contenido es JSON tal como lo recibe/devuelve la IA)
select creado, rol, contenido from mensajes where conversacion_id = '<id>' order by id;

-- 3) Citas
select * from solicitudes_cita where conversacion_id = '<id>' order by creada;

-- 4) Documentos (filas; el archivo está en el bucket "documentos", carpeta con el id de la conversación)
select id, nombre, mime, descripcion, tramite_id, estado, nota, creado, borrado_en from documentos where conversacion_id = '<id>';

-- 5) Personas que usaron el chat web y dejaron celular en una cita
select conversacion_id, nombre, fecha, hora, contacto from solicitudes_cita where contacto = '593991234567';

-- 6) Quién del personal vio esa conversación o sus documentos
select creado, email, accion, objetivo from auditoria where objetivo = '<id de conversación o de documento>' order by id;

-- 7) Contadores asociados (para eliminar cuando corresponda)
select * from uso where clave in ('plantilla:593991234567', 'wa:dia:<id>');
```

Notas: (a) las conversaciones del **chat web** no tienen número; se identifican como `web:<sesión>`. La notaría solo puede ligar una conversación web a una persona si dejó su celular en una cita (consulta 5) o si ella entrega el identificador de su sesión; **dilo en la respuesta** si no encuentras datos. (b) Si la persona pide también el detalle del tratamiento, entrégale el aviso de privacidad vigente y los proveedores del documento 05.

**Paso 4 · Atender según el derecho.**

*Acceso (art. 13).*
1. Exporta con los resultados de las consultas 1 a 5 (Supabase permite descargarlos como CSV o JSON desde el editor SQL).
2. Entrégale una copia de **sus** datos y la información del aviso (finalidades, base, destinatarios, plazos). Gratis.
3. **No incluyas datos de otras personas** (por ejemplo, los datos de una persona distinta que aparezca en un documento) ni la auditoría completa; puedes decirle *quién tuvo acceso como categoría* («personal autorizado de la notaría»).
4. Envíalo por un canal seguro. Si es por WhatsApp, avisa que quedará en su teléfono.

*Rectificación y actualización (art. 14).* El panel no permite editar nombres ni celulares. En Supabase:
```sql
update conversaciones set nombre = 'Nombre correcto' where id = '<id>';
update solicitudes_cita set nombre = 'Nombre correcto' where conversacion_id = '<id>';
update solicitudes_cita set contacto = '593990000000' where id = '<id de cita>';
```
Si el dato corregido también lo tiene un destinatario (por ejemplo, el proveedor), el art. 14 pide informarle; en este sistema los destinatarios son encargados con copia en el mismo registro, así que basta con corregirlo aquí. Los mensajes antiguos no se reescriben: explícalo.

*Eliminación y anulación (art. 15).* **El orden importa**, porque al borrar la fila de la conversación se borran en cascada las filas de los documentos pero **no los archivos** del bucket.
1. En el panel, abre la conversación y pulsa **Borrar** en cada documento. O, para eliminar el archivo ya: Supabase → Storage → bucket `documentos` → carpeta con el **id de la conversación** → borra los archivos.
2. Si usaste el panel (borrado recuperable), el archivo desaparece en 7 a 8 días: ese tiempo cabe en los 15 días, pero **no borres la conversación hasta que el archivo ya no esté** o lo hayas quitado de Storage.
3. Cuando no queden archivos: 
```sql
delete from conversaciones where id = '<id>';
-- Se borran también sesiones, mensajes, cola, archivos recibidos, citas y filas de documentos.
delete from uso where clave in ('plantilla:593991234567', 'wa:dia:<id>');
```
4. Verifica con las consultas 1 a 5 que ya no hay resultados y revisa que la carpeta del bucket está vacía.
5. Responde qué se borró y qué **no** se puede borrar o depende de terceros: copias de seguridad (plazo del proveedor), mensajes en Meta (hasta 30 días), entradas y salidas en Anthropic (hasta 30 días), el historial en el teléfono de la propia persona, la auditoría (por qué se conserva), lo que esté en el protocolo o expediente (Ley Notarial).
6. Si hay una **cita futura** pendiente o confirmada, pregunta si quiere cancelarla; borrar la conversación borra también la cita.

*Oposición y suspensión (arts. 16 y 19).* El sistema no tiene un botón de «suspender». Opciones prácticas hoy:
- Marca la conversación como derivada en Supabase (`update conversaciones set derivada = true where id = '<id>';`; el panel no tiene botón para esto, solo para devolverla al asistente): **el asistente deja de responder** y deja de enviar los mensajes a la IA; el sistema solo guarda los mensajes entrantes (`turno` en `asistente.js`). Esto frena el procesamiento por la IA pero **no** la conservación. Ojo: si el cliente vuelve a escribir, el personal debe responder a mano, y el botón «Devolver al asistente» del panel lo reactiva.
- Si pide que no se le envíen recordatorios: marca sus citas como `rechazada` o bórralas.
- Si pide suspender el uso de documentos: bórralos o márcalos en el panel y documenta la decisión.
Anota en la respuesta qué se suspendió y qué no. Pide al desarrollador un mecanismo real (documento 06).

*Portabilidad (art. 17).* Entrega los datos que **la persona proporcionó** (no los inferidos, art. 17 último inciso) en formato estructurado y de lectura mecánica: exporta las consultas 1 a 5 como CSV o JSON. Los archivos se entregan tal como se recibieron, descargados desde el panel (cada descarga queda en la auditoría). Si pide transmitir a otro responsable, hazlo "en cuanto sea técnicamente posible".

*No ser objeto de decisiones automatizadas (art. 20).* Explica que el asistente no decide nada con efectos jurídicos y que las citas de trámites que requieren revisión las confirma una persona. Si la persona no quiere que una máquina confirme su cita, asegúrate de que esa cita quede **pendiente** y la decida el personal.

*Revocar el consentimiento (arts. 8 y 15 núm. 6; RGLOPDP art. 6).*
1. Anótalo y **suspende** de inmediato el tratamiento ligado al consentimiento (los documentos).
2. Marca la revocación (el sistema no la ofrece):
```sql
update conversaciones set consentimiento = false where id = '<id>';
```
   Con esto el asistente deja de aceptar nuevos documentos de esa conversación (`guardar_documento`).
3. Si además pide borrar, sigue el procedimiento de eliminación. Revocar **no afecta** lo tratado antes, pero la eliminación sí puede pedirse.
4. Confirma por escrito. El mecanismo para revocar debe ser tan sencillo como el de aceptar (LOPDP art. 8): hoy se acepta con un mensaje, por eso revocar por mensaje o llamada debe bastar.

**Paso 5 · Responder dentro de 15 días.** Escrita, clara, gratuita, y con el recordatorio de que puede reclamar ante la **Superintendencia de Protección de Datos Personales** (LOPDP art. 64) y acudir a la vía judicial. Si niegas, indica el artículo de la excepción.

**Paso 6 · Cerrar el registro.** Anota fecha de respuesta, qué se hizo, y guarda copia de la respuesta (sin datos innecesarios). Si borraste todo, la copia de la respuesta es la única prueba: consérvala sin repetir los datos.

### B.5 Quién hace qué

| Tarea | Responsable |
|---|---|
| Recibir y registrar | Cualquiera del personal que la recibe; la pasa el mismo día |
| Verificar identidad y decidir | Responsable interno de privacidad |
| Ejecutar consultas y borrados en Supabase | Desarrollador, o el responsable interno si tiene acceso y capacitación |
| Aprobar negativas y excepciones | Notario con el abogado |
| Responder | Responsable interno, con firma del notario cuando niega |

### B.6 Límites que debes conocer

- El panel muestra una conversación a la vez; **no hay buscador por número** en el código revisado. La búsqueda se hace en Supabase.
- No existe un botón que borre una conversación completa ni una pantalla de auditoría.
- Las conversaciones del chat web no se pueden asociar a una persona sin su colaboración.
- Estos vacíos son pendientes técnicos (documento 06). Mientras tanto, el procedimiento manual es el que defiende al notario, siempre que se **registre**.
