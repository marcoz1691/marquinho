# 03 · Plan de respuesta a incidentes de seguridad

**Notaría 41 de Quito.** Borrador del 7 de octubre de 2026, para aprobación del notario. No es asesoría legal.

## 1. Qué es un incidente

Es cualquier hecho en el que los datos personales se **destruyan, se alteren, se pierda su control, o haya acceso o divulgación no autorizados** (RGLOPDP art. 24). Ejemplos en este sistema:

- Alguien que no es del personal entra al panel, o una persona del personal mira datos que no le corresponden.
- Se filtra una clave (`SUPABASE_SERVICE_ROLE_KEY`, token de WhatsApp, clave de Anthropic) o la ve alguien que no debía.
- Se envía un mensaje de WhatsApp a la persona equivocada con datos de otra (nombre, trámite, fecha de cita).
- Un proveedor (Vercel, Supabase, Meta, Anthropic) te avisa de una brecha.
- Pérdida o robo de un teléfono o computador del personal con sesión abierta del panel o con WhatsApp del personal.
- Se borra por error la base de datos o los documentos.

Ante la duda, trátalo como incidente y decide después. Documentar un falso positivo cuesta poco; no avisar a tiempo es infracción grave (LOPDP art. 68, informe 1.14).

## 2. Plazos legales

| Quién avisa | A quién | Plazo | Fuente |
|---|---|---|---|
| **Proveedor (encargado)** | A la notaría | A más tardar **2 días** desde que lo supo | LOPDP art. 43, inciso 2 |
| **Notaría (responsable)** | A la **SPDP** y a **ARCOTEL** | Tan pronto sea posible y a más tardar **5 días** desde que tuviste constancia, salvo que sea improbable que haya riesgo para los derechos de las personas. Si pasas de 5 días, explica el motivo del retraso | LOPDP art. 43, inciso 1 |
| **Notaría** | A las **personas afectadas** | **Sin dilación y dentro de 3 días** desde que supiste del riesgo, cuando haya riesgo para sus derechos | LOPDP art. 46 |

- La ley dice «término», que en el derecho administrativo suele ser de **días hábiles**; [NO CONFIRMADO] (informe 1.8). **Regla práctica del plan: cuenta en días corridos** y envía antes. Así estás a salvo con cualquiera de las dos lecturas.
- **El reloj empieza cuando tuviste constancia** del incidente (no cuando ocurrió). Anota fecha y hora exactas de ese momento.
- **Excepciones al aviso a las personas** (art. 46): medidas de protección demostrablemente efectivas (por ejemplo, datos cifrados e ilegibles) o esfuerzo desproporcionado, que obliga a una comunicación pública. **La Autoridad debe calificarlas**; no decidas por tu cuenta no avisar.
- El aviso a la SPDP debe contener (RGLOPDP art. 26): naturaleza de la brecha, afectados, sistemas, causa presunta, volumen y tipo de datos, medidas tomadas y evaluación del riesgo. El aviso a la persona usa lenguaje claro (art. 28).
- **Canal y formulario de la SPDP y de ARCOTEL: [NO CONFIRMADO]** (informe 1.16 no encontró resolución sobre el procedimiento). Antes de que ocurra un incidente, pide al abogado la dirección oficial de recepción y guárdala en la carpeta de cumplimiento.
- Aunque no se notifique, **documenta todo incidente** en la bitácora (sección 9).

## 3. Quién hace qué

Completa los nombres antes de aprobar el plan.

| Rol | Persona | Qué hace |
|---|---|---|
| **Decisor** | Dr. Dobri Miguel Albornoz Donoso | Decide si se notifica, firma los avisos, autoriza apagar el servicio. |
| **Responsable interno de privacidad** | [por designar] | Lleva la bitácora y el reloj de plazos, coordina, redacta los avisos, habla con el abogado. |
| **Desarrollador / mantenedor técnico** | [por designar] | Contiene, rota claves, revisa registros, restaura datos. Tiene acceso a Vercel, Supabase, Meta y Anthropic. |
| **Abogado** | [por designar] | Opina si hay obligación de notificar, revisa los textos, representa ante la SPDP. |
| **Personal con acceso al panel** | Todos | Avisa de inmediato al responsable interno si pierde un equipo, ve algo raro o hizo clic en un enlace sospechoso. No borra nada por su cuenta. |

Si el responsable interno no existe todavía, esas tareas las asume el notario.

## 4. Los pasos, en orden

### Paso 0 · Detectar y anotar (primeros 30 minutos)

1. Quien detecta avisa al responsable interno y al desarrollador por teléfono, no solo por escrito.
2. Abre una entrada en la bitácora (sección 9) con: fecha y hora en que tuvieron constancia, quién lo detectó, qué se vio. **Esa hora es el inicio de los plazos.**
3. **No borres nada ni reinicies nada todavía.** Primero conserva evidencia (paso 2).

### Paso 1 · Contener (primeras horas)

Elige solo lo necesario para detener el daño. Cada acción se anota en la bitácora.

| Situación | Acción de contención | Efecto | Verificado en |
|---|---|---|---|
| Una cuenta del personal está comprometida o alguien dejó de trabajar con nosotros | **Quitar su correo de la tabla `personal`** en Supabase (SQL: `delete from personal where email = 'correo@…';`) y cambiar su contraseña o borrar el usuario en Authentication → Users | El panel deja de aceptarla **en la siguiente solicitud**, incluso con un token todavía vigente, porque se comprueba la lista en cada llamada | `esPersonal` en `panel-http.js` |
| Sospecha de que la doble verificación está apagada | En Vercel revisa que la variable `PANEL_MFA` **no** valga `desactivada`; si vale eso, bórrala o cámbiala y vuelve a desplegar | Se exige el código de la app de verificación | `api/panel.js` |
| Quieres cortar la IA y la atención automática ya | Revoca la clave en la consola de Anthropic (Anthropic Console → API keys) | El asistente responde «Disculpa, tuve un problema…» en web y WhatsApp, sin redespliegue. Los mensajes entrantes se siguen guardando. | `turno` captura el error, `asistente.js` |
| Quieres que WhatsApp deje de entrar al sistema | En Vercel, borra o vacía `WHATSAPP_APP_SECRET` y vuelve a desplegar; o en Meta (Configuración del webhook) quita la suscripción al campo `messages` | Todo mensaje entrante recibe error 401 y no se procesa | `webhook.js` + `verificarFirma` |
| Se filtraron claves o tokens | **Rotar** (sección 5) | Las claves anteriores dejan de servir | — |
| Se filtró un enlace a un documento | Espera 2 minutos | Los enlaces de documentos **caducan a los 120 segundos** | `urlDocumento` en `almacen-supabase.js` |
| Se envió algo a un número equivocado | Llama o escribe a esa persona, pídele que borre el mensaje y que no lo comparta; anota qué datos recibió | No se puede recuperar el mensaje; sirve para evaluar el riesgo | — |
| Hay actividad abusiva en el chat web | Los topes (30 por sesión y hora, 80 por IP y hora, 1500 por día) ya responden «muchos mensajes». Para cortar del todo, revoca la clave de Anthropic | — | `chat-http.js` |

**Apagar todo el sitio** (último recurso) lo decide el notario. Las tareas programadas siguen corriendo mientras el proyecto esté activo; confirma con el desarrollador cómo pausar el proyecto en Vercel [NO CONFIRMADO en esta investigación].

### Paso 2 · Conservar evidencia (antes de rotar o corregir)

1. **Exporta la auditoría** (sección 6) a un archivo con fecha.
2. **Descarga los registros de Vercel** del periodo (Project → Logs / Runtime Logs; filtra por `/api/panel`, `/api/whatsapp`, `/api/chat`). La retención de registros depende del plan [NO CONFIRMADO]: hazlo cuanto antes.
3. **Descarga los registros de Supabase**: en el panel de Supabase, Logs (Auth, Postgres, Storage, API) del periodo. Misma salvedad de retención.
4. Captura de pantalla de lo que se vio (con hora). Guarda correos recibidos del proveedor.
5. Guarda todo en la carpeta del incidente. No edites los archivos originales.

### Paso 3 · Evaluar (primeras 24 horas)

Responde por escrito (RGLOPDP art. 26 lista lo que debe poder decirse):

- ¿Qué pasó y cuándo? ¿Sigue pasando?
- ¿Qué datos? ¿De cuántas personas? ¿Hay cédulas, documentos, números de celular, mensajes? ¿Hay menores?
- ¿Quién pudo acceder (un externo, personal, un proveedor)? ¿Hay prueba de que los datos fueron *leídos* o *descargados*, o solo que *pudieron* serlo?
- ¿Qué sistemas? ¿Cuál es la causa presunta?
- **¿Hay riesgo para los derechos de las personas?** Sube el riesgo si hay cédulas, imágenes de rostro, menores o datos que permiten suplantar. Es **improbable** que haya riesgo, por ejemplo, si solo se expuso una lista de preguntas frecuentes públicas.

Con esa evaluación, el **notario y el abogado deciden** si se notifica. Ante la duda, notifica.

### Paso 4 · Avisar

1. **A la SPDP y a ARCOTEL**, dentro de 5 días desde la constancia (sección 7, plantilla A).
2. **A las personas afectadas**, dentro de 3 días desde que se supo del riesgo, por el mismo canal (WhatsApp o llamada), con lenguaje claro (plantilla B). Para citas hechas por la web, usa el celular que dejaron.
3. **Al proveedor**, si el origen está en su servicio: abre un caso con su soporte de seguridad y pide por escrito el informe de causa (plantilla C). Recuerda que ellos deben avisarte en máximo 2 días si el origen es suyo.
4. Si la notificación individual es desproporcionada, pregunta al abogado por una comunicación pública; la Autoridad debe calificar la excepción.

### Paso 5 · Erradicar y recuperar

- Corrige la causa (parche, clave nueva, acceso retirado, configuración).
- Si hubo alteración o borrado: restaura desde las copias de seguridad de Supabase [NO CONFIRMADO qué plan de copias existe; confirmar antes de necesitarlas].
- Comprueba que el sistema funciona: pide al desarrollador que ejecute las pruebas (`npm test`) y haga una conversación de prueba en el chat y por WhatsApp.
- Reabre lo que cerraste en el paso 1.

### Paso 6 · Aprender (dentro de 15 días)

Reunión corta: qué falló, qué detectó el problema, qué se cambia. Actualiza el registro (documento 01), la evaluación (documento 02) y este plan. Anota los cambios en la bitácora.

## 5. Cómo rotar claves (sin escribirlas en ningún lado)

Nunca pegues claves en correos ni chats. Se generan en el panel de cada servicio y se pegan directamente en Vercel (Project → Settings → Environment Variables). Después, **vuelve a desplegar** para que la función use la nueva.

| Secreto | Dónde se genera | Qué más cambia |
|---|---|---|
| `ANTHROPIC_API_KEY` | Consola de Anthropic: crear clave nueva y revocar la anterior | — |
| `WHATSAPP_TOKEN` | Meta Business Settings → System users: generar token nuevo y revocar el anterior | — |
| `WHATSAPP_APP_SECRET` | Meta for Developers → App settings → Basic: restablecer el secreto de la app | Hasta que el nuevo secreto esté en Vercel, los mensajes entrantes se rechazan |
| `WHATSAPP_VERIFY_TOKEN` | Una frase larga que elijas | Debe ser la misma en la configuración del webhook de Meta |
| `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_ANON_KEY` | Supabase → Project Settings → API (rotar claves o el secreto JWT, según lo que ofrezca tu versión del panel) | **Rotar el secreto JWT cierra todas las sesiones del panel**: el personal tendrá que entrar de nuevo |
| `CRON_SECRET` | Cualquier texto aleatorio de al menos 16 caracteres | Vercel lo usa en las tareas programadas |
| Contraseñas del personal | Supabase → Authentication → Users | — |

Los nombres de menú de cada proveedor cambian con frecuencia; usa su documentación. Anota en la bitácora cada rotación (fecha, quién, qué), sin escribir el valor.

## 6. Cómo revisar la auditoría (tabla `auditoria`)

La tabla se llena sola y **no se puede editar ni borrar** con consultas normales (un disparador lo impide; `supabase/esquema.sql`). No hay pantalla en el panel para verla: se consulta en Supabase → SQL Editor. Columnas: `id`, `creado`, `email`, `accion`, `objetivo`, `ok`.

**Acciones registradas** (`api/_lib/panel-http.js`): `detalle` (abrir una conversación), `documento` (abrir un documento), `responder`, `devolver`, `cita`, `asignarCita`, `revisarDocumento`, `borrarDocumento`. `objetivo` es el identificador de la conversación, cita o documento. `ok = false` significa que la acción falló.

Consultas útiles (solo lectura):

```sql
-- Últimos movimientos
select creado, email, accion, objetivo, ok from auditoria order by id desc limit 200;

-- Quién abrió más documentos en los últimos 7 días
select email, count(*) as aperturas from auditoria
where accion = 'documento' and creado > now() - interval '7 days'
group by email order by aperturas desc;

-- Acciones fallidas (intentos que no se completaron)
select creado, email, accion, objetivo from auditoria where ok = false order by id desc limit 100;

-- Todo lo que hizo una persona en un periodo
select creado, accion, objetivo, ok from auditoria
where email = 'correo@…' and creado between '2026-10-01' and '2026-10-08' order by id;

-- Actividad fuera de horario (antes de las 07:00 o después de las 19:00 de Quito)
select creado, email, accion, objetivo from auditoria
where extract(hour from creado at time zone 'America/Guayaquil') not between 7 and 19
order by id desc limit 100;

-- Todo lo que se hizo sobre un documento o conversación concreta
select creado, email, accion, ok from auditoria where objetivo = '<id>' order by id;
```

**Qué mirar:** aperturas de documentos de personas que no deberían, picos inusuales, horarios raros, muchas acciones `ok = false` (intentos de superar el límite de 60 descargas por hora), accesos de cuentas que ya no trabajan aquí.

**Limitaciones que debes conocer:**
- La auditoría **no registra la IP**, ni los inicios de sesión, ni la lista de conversaciones, ni la agenda. Para saber si alguien entró, mira los registros de **Authentication** de Supabase.
- Quien administre la base de datos con permisos completos podría alterar el disparador. Por eso conviene exportar la tabla periódicamente.

**Revisión rutinaria sugerida:** el responsable interno revisa la auditoría **una vez al mes** y deja constancia (fecha, quién, hallazgos) en la carpeta de cumplimiento. [Decisión del notario.]

## 7. Plantillas de aviso

Reemplaza lo que va entre corchetes. Que el abogado las revise.

### Plantilla A · Aviso a la SPDP y a ARCOTEL (contenido mínimo, RGLOPDP art. 26)

> **Asunto:** Notificación de vulneración de la seguridad de datos personales — Notaría 41 de Quito
>
> **Responsable:** Notaría 41 de Quito, a cargo del Dr. Dobri Miguel Albornoz Donoso, Notario Cuadragésimo Primero del Cantón Quito. Simón Bolívar Oe1-222, entre Juan Montalvo y Eugenio Espejo, Tumbaco, Quito. Teléfono 02 600 1141. Correo notaria41uio@gmail.com. Contacto para este caso: [nombre, cargo, teléfono].
>
> **Fecha y hora en que tuvimos constancia:** [fecha, hora]. **Fecha y hora estimadas del incidente:** [fecha, hora o «por determinar»].
>
> **1. Naturaleza de la vulneración:** [acceso no autorizado / pérdida / alteración / divulgación]. [Descripción en dos o tres frases.]
> **2. Personas afectadas:** [número aproximado y tipo: clientes que usaron el asistente de WhatsApp, visitantes del chat web, personal].
> **3. Sistemas afectados:** [asistente de WhatsApp / chat web / panel del personal / base de datos en Supabase / almacenamiento de documentos / proveedor X].
> **4. Causa presunta:** [descripción; si se desconoce, decirlo].
> **5. Volumen y tipo de datos:** [registros y archivos; categorías: nombre, número de celular, mensajes, citas, imágenes de cédulas, otros]. [Indicar si hay datos de menores o datos sensibles.]
> **6. Medidas adoptadas o previstas:** [contención, rotación de claves, avisos a afectados, correcciones, fecha].
> **7. Evaluación del riesgo para los derechos y libertades:** [bajo / medio / alto y por qué].
> **8. Comunicación a los titulares:** [ya realizada el … / prevista para el …, por …].
> **9. Retraso, si lo hay:** [motivo, si pasaron más de 5 días].
>
> Quedamos a disposición para ampliar la información.
> [Firma del notario] — [fecha]

### Plantilla B · Aviso a la persona afectada (RGLOPDP art. 28: lenguaje claro)

> Hola [nombre]. Te escribimos de la Notaría 41 de Quito para contarte algo importante sobre tus datos.
>
> **Qué pasó:** el [fecha] detectamos que [descripción simple: por ejemplo, «una persona sin autorización pudo ver los mensajes y los documentos que enviaste para tu cita»].
> **Qué datos pueden estar afectados:** [por ejemplo, tu nombre, tu número de celular y la copia de tu cédula].
> **Qué hemos hecho:** [por ejemplo, cerramos el acceso, cambiamos las claves y avisamos a la autoridad de protección de datos].
> **Qué puedes hacer tú:** [por ejemplo, desconfía de mensajes que te pidan códigos o dinero a nombre de la notaría; si quieres, cambia tus claves; si ves algo raro con tu identidad, avísanos]. Si usas tu cédula en trámites financieros, puedes pedir [medida recomendada por el abogado].
> **Cómo contactarnos:** llama al 02 600 1141 o escribe a notaria41uio@gmail.com. Puedes ejercer tus derechos de acceso, eliminación y los demás cuando quieras, y reclamar ante la Superintendencia de Protección de Datos Personales.
>
> Lamentamos lo ocurrido. — Notaría 41 de Quito

Si el aviso va por WhatsApp, usa el mismo número del asistente solo dentro de la ventana de 24 horas; fuera de ella WhatsApp exige una plantilla aprobada (`api/_lib/whatsapp.js`). Si la ventana se cerró, llama por teléfono.

### Plantilla C · Aviso o solicitud al proveedor

> **Para:** [soporte de seguridad de Vercel / Supabase / Meta / Anthropic]
> **De:** Notaría 41 de Quito, responsable del tratamiento. Contacto: [nombre, teléfono, correo].
> Hemos detectado [descripción breve] en la cuenta [nombre del proyecto o identificador] el [fecha, hora]. Conforme a nuestro contrato de encargo y a la Ley Orgánica de Protección de Datos Personales del Ecuador (art. 43), les solicitamos por escrito: (1) confirmar si el origen está en su servicio; (2) el alcance (qué datos, cuándo, cuántos titulares); (3) las medidas tomadas; (4) los registros relevantes del periodo [fecha–fecha]; (5) un informe de causa. Les pedimos respuesta antes del [fecha límite = 48 horas].

## 8. Simulacro

Una vez al año (y tras publicar este plan), el responsable interno y el desarrollador hacen un ejercicio de 1 hora: «se perdió el teléfono de una persona del personal con sesión abierta». Deben poder, en ese tiempo, bloquear la cuenta, sacar la auditoría de esa persona, y redactar un borrador de la plantilla A. Anota los tiempos reales.

## 9. Bitácora de incidentes

Una fila por incidente. Guarda esta tabla y los archivos de evidencia en la carpeta de cumplimiento.

| Nº | Constancia (fecha y hora) | Descripción | Datos y personas | Contención | Evaluación y decisión (¿se notificó?) | SPDP/ARCOTEL (fecha) | Afectados (fecha) | Cierre y lecciones |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |

## 10. Qué falta para que este plan sea ejecutable hoy

- Nombres y teléfonos de los roles de la sección 3.
- Dirección o formulario oficial de la SPDP y de ARCOTEL para notificaciones [NO CONFIRMADO].
- Contactos de seguridad de cada proveedor y casos de soporte según tu plan (Vercel: el plan gratuito no cubre el DPA, documento 05).
- Confirmar el plan de copias de seguridad de Supabase y la retención de registros en Vercel y Supabase.
- Confirmar con el abogado la lectura de «término» (días hábiles o corridos).
