# 01 · Registro de actividades de tratamiento

**Responsable:** Notaría 41 de Quito, a cargo del Dr. Dobri Miguel Albornoz Donoso, Notario Cuadragésimo Primero del Cantón Quito. Simón Bolívar Oe1-222, entre Juan Montalvo y Eugenio Espejo, Tumbaco, Quito. Teléfonos 02 600 1141 y 02 600 4141. Correo notaria41uio@gmail.com (`data/notaria.json`).
**Delegado de Protección de Datos:** no designado. La SPDP respondió que la notaría individual no está obligada (Oficio SPDP-IRD-2025-0017-O, informe 1.16). [Responsable interno de privacidad: por designar.]
**Fecha de este borrador:** 7 de octubre de 2026. **Versión del sistema:** rama `claude/seguridad`, `de6bcad`.

## Por qué existe este registro

El Reglamento exige llevar un registro por escrito de las actividades de tratamiento con nueve contenidos (RGLOPDP art. 38). La obligación alcanza a quien tiene menos de 100 trabajadores si el tratamiento «no sea ocasional», puede entrañar riesgo o incluye categorías especiales de datos (RGLOPDP art. 39). La notaría trata datos de forma continua, así que le aplica la segunda condición (informe 1.15; la aplicación al caso es interpretación). Además, el registro es la prueba principal de «responsabilidad proactiva» (LOPDP art. 10 k).

> Nota sobre los artículos: los **contenidos** del registro están en el **art. 38** del RGLOPDP; el **art. 39** extiende la obligación a responsables con menos de 100 trabajadores. Las tablas siguientes cubren los nueve contenidos del art. 38.

## Resumen de tratamientos

| Código | Tratamiento | Canal |
|---|---|---|
| T1 | Consultas en el chat de la página web | Web |
| T2 | Atención de consultas por WhatsApp | WhatsApp |
| T3 | Solicitud, confirmación y recordatorio de citas | Web y WhatsApp |
| T4 | Recepción y pre-revisión de documentos (cédulas, escrituras, etc.) | Solo WhatsApp |
| T5 | Constancia del consentimiento | WhatsApp |
| T6 | Acceso del personal al panel y auditoría | Panel |
| T7 | Control de uso y seguridad (topes, huella de IP) | Web y WhatsApp |
| T8 | Correo de contacto y atención de derechos | Correo |
| T9 | Contenido público de la página (hoja de Google) | Web |
| T10 | Visitas a la página (recursos de terceros) | Web |

Los datos están en una sola base de datos lógica (proyecto de Supabase, región sa-east-1, São Paulo) y en un depósito de archivos privado (`documentos`). Es el elemento que se declara como «base de datos» en el Registro Nacional (LOPDP art. 51).

## Fichas

### T1 · Consultas en el chat de la página web

| Campo (RGLOPDP art. 38) | Contenido |
|---|---|
| Finalidad | Informar trámites, requisitos y tarifas; orientar a la persona hacia una cita. |
| Titulares | Visitantes de la página que escriben en el chat. Pueden ser menores o personas que escriben datos de terceros. |
| Datos | Texto de los mensajes (máximo 1000 caracteres cada uno) y un identificador de sesión aleatorio generado por el navegador. La conversación se guarda con el identificador `web:<sesión>`. No se pide nombre ni celular hasta que la persona quiere una cita. |
| Datos que el sistema no debería recibir pero pueden llegar | La persona puede escribir cédula, direcciones u otros datos en texto libre. El pie del chat advierte «no compartas datos sensibles», pero el sistema no los filtra [Verificado: no hay filtro en `api/_lib/chat-http.js` ni en `asistente.js`]. |
| Perfiles / decisiones automatizadas | No hay perfiles. Las respuestas las genera un modelo de IA, sin efectos jurídicos: todos los trámites se firman en persona. |
| Base de legitimación | Medidas precontractuales a petición del titular (LOPDP art. 7.5) [interpretación del informe 1.2; validar]. No se pide consentimiento en la web: **hay que decidir si se añade un aviso visible antes del primer mensaje**. |
| Destinatarios | Supabase (almacena); Vercel (ejecuta); Anthropic (genera la respuesta). Ver T-proveedores abajo. |
| Transferencias internacionales | EE. UU. (Vercel, Anthropic) y Brasil (Supabase). Mecanismo: contratos de encargo con cláusulas tipo, aún sin descargar ni archivar (documento 05). Excepción alternativa: LOPDP art. 60 núm. 4 (necesaria para medidas precontractuales pedidas por el titular) [interpretación]. |
| Plazo de conservación | 90 días sin actividad, luego se borra la conversación completa (`api/_lib/purgar.js`, valor por defecto; variable `RETENCION_DIAS`, mínimo 30). **Además**, el navegador de la persona guarda hasta 30 conversaciones de 60 mensajes en su propio equipo (`js/chat-nucleo.js`); la notaría no controla eso, pero la persona puede borrarlas desde el chat. |
| Medidas de seguridad | HTTPS y encabezados de seguridad (`vercel.json`); topes de uso (30 mensajes por sesión y hora, 80 por IP y hora, 1500 por día en total); almacén privado con RLS; la IP solo se guarda como huella. Ver sección «Medidas comunes». |

### T2 · Atención de consultas por WhatsApp

| Campo | Contenido |
|---|---|
| Finalidad | Responder consultas, calcular tarifas, orientar el trámite, pasar el caso a una persona si se pide. |
| Titulares | Quien escribe al número de WhatsApp del asistente. |
| Datos | Número de WhatsApp; nombre del perfil de WhatsApp (si Meta lo entrega); texto de los mensajes; fecha y hora; mensajes del personal cuando responde desde el panel. |
| Perfiles / decisiones automatizadas | No hay perfiles. El asistente no decide nada con efectos jurídicos; si hay queja, urgencia o duda legal, deriva a una persona (herramienta `derivar_a_persona`). |
| Base de legitimación | Medidas precontractuales a petición del titular (LOPDP art. 7.5) [interpretación; validar]. |
| Destinatarios | Meta (WhatsApp Cloud API, encargado); Anthropic (recibe el texto, el nombre y el número de la persona para generar la respuesta [Verificado: `contexto()` en `asistente.js` incluye «Cliente: nombre (teléfono)»]); Supabase; Vercel; personal autorizado de la notaría. |
| Transferencias internacionales | EE. UU. (Meta, Anthropic, Vercel) y Brasil (Supabase). |
| Plazo de conservación | 90 días sin actividad (conversación completa). Meta conserva los mensajes hasta 30 días como máximo en su servicio (informe 3.4). Anthropic borra entradas y salidas de su sistema en hasta 30 días (informe 3.1). |
| Medidas | Verificación de la firma de cada mensaje de Meta (HMAC-SHA256, `api/_lib/whatsapp.js`); tope de 150 mensajes por número y día; una sola respuesta a la vez por conversación; almacén privado. |

### T3 · Solicitud, confirmación y recordatorio de citas

| Campo | Contenido |
|---|---|
| Finalidad | Reservar cupos de atención, avisar al personal y recordar la cita al cliente. |
| Titulares | Personas que piden una cita. |
| Datos | Nombre completo (2 a 60 letras), trámite, fecha, hora, nota opcional (máximo 200 caracteres), estado de la cita, persona del personal asignada y, en citas hechas por la web, un **celular que la persona escribe y que el sistema no verifica**. |
| Comunicaciones que salen | (a) Al cliente: recordatorio a las 17:00 del día anterior para citas confirmadas; aviso de cita confirmada o rechazada (por WhatsApp). (b) Al personal: avisos de nuevas solicitudes, documentos recibidos y derivaciones, y un resumen de las citas del día a las 07:00 con **nombres y trámites**, enviados por plantilla a un número de WhatsApp del personal. Pasan por Meta. |
| Decisiones automatizadas | Solo para citas por WhatsApp de trámites que no requieren revisión, la cita queda **confirmada automáticamente** si hay cupo. En la web siempre queda pendiente hasta que el personal la confirma [Verificado: `confirmada = !!t && !t.revision && !esWeb(conv)`]. No tiene efectos jurídicos; es una reserva de agenda. |
| Base de legitimación | Medidas precontractuales a petición del titular (LOPDP art. 7.5). Recordatorios: misma base o interés legítimo (art. 7.8) [validar]. |
| Destinatarios | Meta, Supabase, Vercel; Anthropic (ve el nombre, trámite, fecha y hora que la persona escribe y los resultados de las herramientas); personal. |
| Transferencias | EE. UU. y Brasil, como en T2. |
| Plazo de conservación | La cita se borra con la conversación a los 90 días sin actividad, pero **la purga no borra conversaciones que tengan una cita pendiente o confirmada con fecha futura**. |
| Medidas | Un máximo de 4 plantillas por día a un mismo número, para que un celular escrito en la web no reciba mensajes repetidos (`api/_lib/limites.js`); citas web siempre pendientes. |

### T4 · Recepción y pre-revisión de documentos

| Campo | Contenido |
|---|---|
| Finalidad | Que el personal revise copias de cédulas, escrituras u otros documentos antes de la cita, para evitar viajes en vano. La pre-revisión no tiene valor legal. |
| Titulares | Clientes que envían documentos; **terceros cuyos datos aparecen en ellos** (vendedores, herederos, representados) y **posibles menores** (por ejemplo, permiso de salida). |
| Datos | Archivos PDF, JPG, PNG o WEBP de hasta 15 MB, máximo 20 por conversación; nombre del archivo (hasta 120 caracteres); descripción que escribe el asistente (por ejemplo «cédula de la vendedora»); trámite; estado de revisión (recibido, aprobado u observado) y nota del personal. **Una cédula contiene imagen facial y número de identificación.** |
| Categorías especiales | Posible: la imagen facial es dato biométrico sensible según los arts. 4 y 26 LOPDP; [NO CONFIRMADO] si lo es una foto de documento sin procesamiento biométrico (duda 1). Por prudencia se trata como sensible. |
| Datos que NO van a la IA | El contenido del archivo **no se envía al modelo de IA** [Verificado: el modelo solo recibe el texto «El cliente envió un archivo: nombre, tipo, media_id» y el pie de foto]. El asistente no «ve» la cédula. |
| Base de legitimación | **Consentimiento explícito** (LOPDP arts. 7.1, 8 y 26 a). El asistente pide aceptar antes de guardar y el sistema **rechaza guardar** documentos sin consentimiento registrado [Verificado: `guardar_documento`]. Solo WhatsApp: el chat web rechaza documentos. |
| Destinatarios | Meta (por donde viaja el archivo; lo conserva hasta 30 días); Supabase (bucket privado); Vercel (lo descarga y lo pasa a Supabase); personal autorizado del panel. |
| Transferencias | EE. UU. (Meta, Vercel, por tránsito del archivo) y Brasil (Supabase, donde queda guardado). |
| Plazo de conservación | 90 días sin actividad de la conversación, o **7 días después de que el personal pulsa «Borrar»** en el panel (la purga diaria corre a las 03:00 hora de Quito, así que el archivo desaparece entre 7 y 8 días después). Copias de seguridad de Supabase: [NO CONFIRMADO]. |
| Medidas | Almacenamiento privado (bucket no público); enlaces de descarga que duran **120 segundos**; el panel limita a 60 documentos abiertos por persona y hora; el tipo de archivo se valida por sus primeros bytes, no por lo que declara WhatsApp; cada vez que el personal abre un documento queda en la auditoría. |

### T5 · Constancia del consentimiento

| Campo | Contenido |
|---|---|
| Finalidad | Poder demostrar que el cliente aceptó el tratamiento antes de enviar documentos (RGLOPDP art. 5; LOPDP art. 10 k). |
| Datos | Marca de consentimiento, fecha y hora, **lo que escribió el cliente** (hasta 500 caracteres) y la **versión del aviso** aceptado (`2026-10-07`). |
| Base | Obligación legal de demostrar el consentimiento (LOPDP art. 7.2; RGLOPDP art. 5). |
| Plazo | Se borra con la conversación (90 días sin actividad). **[NO CONFIRMADO / decisión]** si la prueba debe conservarse más tiempo que los documentos a los que se refiere. |
| Observación | **No existe todavía un mecanismo técnico para revocar el consentimiento** (ver documento 04). |

### T6 · Acceso del personal al panel y auditoría

| Campo | Contenido |
|---|---|
| Finalidad | Que el personal atienda conversaciones, confirme citas y revise documentos; dejar rastro de quién vio o cambió qué (seguridad, LOPDP arts. 10 j y 37). |
| Titulares | Personal de la notaría con acceso. Indirectamente, los clientes cuyos datos aparecen en el panel. |
| Datos | Correo y nombre del personal (tabla `personal`); en la **auditoría**: fecha y hora, correo, acción, identificador del objetivo (conversación, cita o documento) y si tuvo éxito. |
| Qué se audita | Abrir el detalle de una conversación, abrir un documento y toda acción que cambia algo (responder, devolver al asistente, decidir cita, asignar cita, revisar documento, borrar documento) [Verificado: `api/_lib/panel-http.js`]. **No se audita** la lista de conversaciones ni la agenda del día, que muestran nombre, número y último mensaje. |
| Control de acceso | Cuenta de Supabase con correo confirmado, **verificación en dos pasos obligatoria** salvo que alguien configure `PANEL_MFA=desactivada`, y estar en la tabla `personal`. La pertenencia se comprueba en cada solicitud. |
| Base | Interés legítimo en la seguridad (LOPDP art. 7.8) y deber de seguridad (arts. 10 j, 37) [validar]. |
| Plazo | **Sin plazo definido.** La auditoría solo se agrega: un disparador de la base impide editar o borrar filas. [Decisión del notario / duda.] |
| Medidas | MFA con aplicación de códigos; tabla de auditoría inmutable (quien administra la base de datos aún podría alterar el disparador; [Verificado en `esquema.sql`]); respuestas sin caché (`Cache-Control: no-store`). |

### T7 · Control de uso y seguridad

| Campo | Contenido |
|---|---|
| Finalidad | Evitar abuso y costos (topes) y que un celular ajeno reciba mensajes no pedidos. |
| Datos | Contadores por ventana de tiempo, con las claves: `chat:sesion:<sesión>`, `chat:ip:<huella>`, `chat:dia`, `wa:dia:<id de conversación>`, `plantilla:<número de celular>`, `panel:descargas:<correo>`. La **IP del visitante web se guarda solo como huella**: SHA-256 de «notaria41:» más la IP, cortado a 24 caracteres hexadecimales [Verificado: `chat-http.js`]. |
| Observación honesta | Esa huella usa un texto fijo, no una sal secreta; con un espacio de IP pequeño, alguien con acceso a la base podría recalcular direcciones. Es **seudonimización**, no anonimización. Vercel además ve la IP en sus propios registros de infraestructura, fuera del control de la notaría. |
| Base | Interés legítimo en la seguridad del servicio (LOPDP art. 7.8) [validar]. |
| Plazo | **7 días.** La purga diaria borra los contadores de la tabla `uso` con más de 7 días y los mensajes procesados con más de 30 [Verificado: `almacen-supabase.js`, `purgar`]. |

### T8 · Correo de contacto y atención de derechos

| Campo | Contenido |
|---|---|
| Finalidad | Recibir y responder solicitudes de acceso, rectificación, eliminación, oposición, portabilidad, suspensión y demás. |
| Datos | Lo que la persona escriba y adjunte; su correo; constancia de la respuesta. |
| Base | Obligación legal (LOPDP art. 7.2; arts. 13 a 20). |
| Destinatario | Google (cuenta Gmail gratuita) [informe 3.5]. **Sin contrato de encargo** mientras no sea Google Workspace. |
| Plazo | [NO CONFIRMADO / decisión]: propongo conservar la solicitud y la respuesta el tiempo que indique el abogado, como prueba de haber atendido en plazo (RGLOPDP art. 15 pide registrar las solicitudes). |

### T9 · Contenido público (hoja de Google)

El servidor y la página leen una hoja de Google con trámites, tarifas y datos de la notaría (`api/_lib/contenido.js`). Es contenido público y **no debe contener datos personales de clientes**. Si algún día se anotan clientes o citas ahí, deja de ser verdad y se necesita contrato de encargo con Google Workspace. Revisa que el enlace de la hoja esté como «Lector» para cualquiera y que el personal sea «Editor».

### T10 · Visitas a la página

| Campo | Contenido |
|---|---|
| Datos | La IP y datos técnicos del navegador llegan a terceros cuyos recursos carga la página: Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), unpkg (`unpkg.com`, íconos) y OpenStreetMap (mapa de la portada), además de Vercel (alojamiento). [Verificado: `index.html`, `asistente.html`, `js/app.js`, `vercel.json`.] |
| Cookies | No se detectaron cookies de publicidad ni de seguimiento en el código. El navegador guarda en `localStorage` las conversaciones del chat y una copia de la hoja de contenido. |
| Base | Interés legítimo en entregar la página (LOPDP art. 7.8) [validar]. |
| Observación | Podrías eliminar la dependencia de Google Fonts y unpkg alojando las fuentes e íconos en el propio sitio; eso quitaría la comunicación de la IP a esos terceros. Es una decisión técnica opcional. |

## Encargados y transferencias internacionales (para el art. 38 núm. 3 y 6 y el art. 78)

| Proveedor | Rol | País | Datos que recibe | Garantía prevista | Estado |
|---|---|---|---|---|---|
| Anthropic (API de Claude) | Encargado | EE. UU. | Texto de mensajes, nombre, número de WhatsApp, datos de cita, resultados de herramientas. **No** recibe imágenes ni PDF. | Commercial Terms + DPA con cláusulas tipo UE (informe 3.1) | Incorporado por referencia al usar la API; **copia sin archivar** |
| Supabase | Encargado | Brasil (sa-east-1) | Toda la base: conversaciones, mensajes, citas, documentos, auditoría | DPA con cláusulas tipo (informe 3.2) | Copia firmada/descargada: [NO CONFIRMADO] |
| Vercel | Encargado | EE. UU. | Todo lo que pasa por las funciones del servidor, incluidos archivos en tránsito y registros | DPA con cláusulas tipo UE (informe 3.3), **solo planes Pro y Enterprise** | **Pendiente**: confirmar el plan |
| Meta (WhatsApp Cloud API) | Encargado | EE. UU. y otros | Mensajes y archivos de WhatsApp; plantillas con nombre y trámite | WhatsApp Business Data Processing Terms (informe 3.4) | Aceptados al configurar la cuenta; contenido [NO CONFIRMADO] |
| Google | Contenido público; y correo de contacto | EE. UU. | Hoja pública; correos recibidos | Sin DPA para Gmail gratuita (informe 3.5) | **Pendiente** |

Estado jurídico de las transferencias (informe 1.13 y 1.15): no se encontró declaración de adecuación de la SPDP para EE. UU. ni Brasil, y [NO CONFIRMADO] que la SPDP haya avalado cláusulas tipo (RGLOPDP art. 74). El registro de transferencias debe indicar país, categorías de datos, finalidad, destinatario y mecanismo (RGLOPDP art. 78).

## Medidas de seguridad comunes (art. 38 núm. 9)

Medidas técnicas verificadas en el código (`vercel.json`, `supabase/esquema.sql`, `api/`):

- Base de datos con seguridad por filas activada y **sin políticas**: solo el servidor con la clave de servicio puede leer o escribir. Archivos en un bucket **privado**.
- Cifrado en tránsito (HTTPS con HSTS de dos años) y en reposo en los proveedores (AES-256, TLS 1.2+ según sus contratos, informe 3.1 y 3.2).
- Encabezados: política de contenido (CSP) restrictiva, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, política de referencia, política de permisos sin cámara ni micrófono, y no indexación (`noindex`).
- Panel con verificación en dos pasos, lista de personal, auditoría inmutable y límite de descargas.
- Webhook de WhatsApp con firma verificada; tareas programadas protegidas con `CRON_SECRET` de al menos 16 caracteres, comparado en tiempo constante.
- Topes de uso en web (por sesión, IP y día), en WhatsApp (150 por número y día) y en plantillas (4 por día y número).
- Validación de archivos por su contenido; límite de tamaño y de cantidad.
- Retención automática (cron diario a las 03:00 hora de Quito).
- Errores internos genéricos hacia la persona (`GENERICO` en `panel-http.js`); los registros del servidor guardan identificadores y mensajes de error, no el contenido de los mensajes [Verificado en `console.error` de `api/`]. [NO CONFIRMADO] que los mensajes de error de Supabase o Anthropic nunca incluyan fragmentos de datos.

Medidas organizativas: **por completar** (acuerdos de confidencialidad, política interna, responsable de privacidad, revisión semestral; informe 4). No se pueden afirmar como existentes.

## Perfiles

No se elaboran perfiles de clientes. El asistente adapta su respuesta a la conversación en curso; no califica ni puntúa personas.

## Mantenimiento de este registro

Actualízalo cuando cambie un proveedor, un plazo, un tipo de dato o un canal, y al menos una vez al semestre (LOPDP art. 37 inciso 2; art. 47.3). Anota la fecha y quién lo revisó.

| Fecha | Cambio | Revisó |
|---|---|---|
| 2026-10-07 | Primera versión (borrador) | [pendiente de firma del notario] |
