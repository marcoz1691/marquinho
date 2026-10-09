# Contratos: citas con ticket, documentos en la web y precios

Este documento fija las interfaces entre los trabajos A (servidor de citas), B (subida de documentos), C (interfaz) y D (precios).
Cada trabajo implementa SU parte exactamente con estos nombres y formas. Si algo es ambiguo, elige lo más simple y anótalo en tu informe final.

Reglas del proyecto (valen para todos):
- Todo texto que ve una persona usa **tú**, nunca usted. Sin fotos en el sitio.
- JavaScript moderno sin dependencias nuevas. Servidor: ES modules de Node 24 en `api/`. Sitio y panel: JS vanilla.
- La CSP (`vercel.json`) bloquea scripts y estilos en línea y `onclick=`: usa archivos `.js` y clases CSS. Todo `fetch` va a `'self'`.
- Todo lo que viene del usuario se escapa con `esc()` al pintarlo (`js/chat-nucleo.js` y `panel/panel.js` ya la tienen).
- NUNCA leas ni imprimas `.env.local` ni secretos. No hagas deploy, no corras `vercel`, no hagas push ni merge: solo commits en tu rama.
- Pruebas primero (TDD): escribe la prueba, míralo fallar, implementa. Corre `npx vitest run` completo antes de terminar; debe quedar todo en verde.
- Los almacenes tienen DOS adaptadores con la misma interfaz: `api/_lib/almacen-memoria.js` y `api/_lib/almacen-supabase.js`. Todo método nuevo va en ambos y en `test/almacen.contrato.test.js` (el de Supabase solo corre con variables de prueba; no las tienes, está bien).
- El esquema vive en `supabase/esquema.sql` (idempotente: `if not exists`). Agrega un bloque nuevo al final con un comentario de fecha; no edites lo anterior. NO ejecutes SQL contra ninguna base.

## 1. Ticket de la cita

- Campo `codigo`: **string de 4 dígitos** (`"1000"`–`"9999"`), **único por día** (`unique (fecha, codigo)` en `solicitudes_cita`; columna `codigo text`, nullable para las citas viejas).
- `almacen.crearSolicitudCita({...})` ahora devuelve `{ id, codigo }`. Genera el código al azar y reintenta hasta 8 veces si choca (en Supabase, capturando el error `23505` del índice; en memoria, comprobando las citas del mismo día).
- `cita(id)`, `solicitudesCita(conversacionId)`, `agenda(fecha)` y `citasDelDia(fecha)` incluyen `codigo` (string o `null`).
- Nuevo: `almacen.citasPorCodigo(codigo, desdeFecha)` → citas con ese código y `fecha >= desdeFecha` en estado `pendiente` o `confirmada`, con `telefono` como en `agenda()`.
- Una cita reprogramada o rechazada conserva su código; el código nuevo es de la cita nueva.

## 2. Resumen de la cita (`resumen`)

Objeto que arma `construirResumen()` en `api/_lib/resumen.js` (archivo nuevo, trabajo A):

```js
{
  tipo: "cita",
  codigo: "4821",
  estado: "confirmada" | "pendiente",
  fecha: "2026-10-08",            // ISO
  fechaTexto: "jueves 8 de octubre",   // es-EC, zona America/Guayaquil
  hora: "10:00",
  nombre: "Ana Pérez",
  tramite: { id: "poder-natural", nombre: "Poder general" } | null,
  direccion: "Simón Bolívar Oe1-222, …",
  requisitos: ["Cédula…", "…"],   // del trámite; [] si no hay trámite
  costo: { total: "$66,52", detalle: "Tarifa $57,84 + IVA $8,68" } | null,   // null si es por cuantía o no hay trámite
  aviso: "Este valor no incluye documentos habilitantes…" | null,           // AVISO_HABILITANTES cuando hay costo
  subirDocumentos: true | false   // true solo en el chat web
}
```

`textoResumen(resumen)` (también en `resumen.js`) devuelve el texto en español, en líneas cortas, para WhatsApp:

```
Tu cita quedó confirmada. Ticket 4821
Jueves 8 de octubre, 10:00
Trámite: Poder general
Lugar: Simón Bolívar Oe1-222, …
Lleva: • Cédula… • …
Costo referencial: $66,52 con IVA. Este valor no incluye documentos habilitantes…
Con tu ticket 4821 te atienden más rápido.
```
(si está `pendiente`: «Recibimos tu solicitud. El personal la confirmará por WhatsApp. Ticket 4821».)

## 3. Eventos del asistente

`asistente.atender(mensaje, { eventos } = {})`: si `eventos` es un arreglo, cada vez que `solicitar_cita` crea una cita se hace `eventos.push({ tipo: "cita", resumen })`. Sin `eventos`, nada cambia.

- `api/_lib/chat-http.js` pasa `eventos` y responde `{ respuestas, tarjetas: [resumen, …] }` (con `subirDocumentos: true`). `tarjetas` siempre existe (puede ser `[]`).
- `api/_lib/webhook.js` pasa `eventos` y, después de enviar las respuestas de Sofía, envía `textoResumen(resumen)` por `whatsapp.enviarTexto` (con `subirDocumentos: false`).
- `solicitar_cita` devuelve a Sofía (en el `tool_result`) el ticket y le indica: «El resumen con el ticket se le muestra al cliente aparte; no lo repitas completo. Solo dile el ticket y qué sigue.»
- `estado_de_mi_tramite` incluye `Ticket 4821` en cada solicitud de cita.
- Prompt de Sofía: en la web, ya no pedir que envíe documentos por WhatsApp; ofrecer «Subir documentos» de la tarjeta de su cita. Si el cliente da un ticket para consultar o cambiar su cita, buscar entre sus citas por `codigo`.

## 4. Subir documentos desde la web: `POST /api/documentos`

Archivo `api/documentos.js` (como `api/chat.js`) + `api/_lib/documentos-http.js` (`crearManejadorDocumentos({ almacen, ahora, limites })`).

Pedido (JSON, `Content-Type: application/json`):
```json
{ "sesion": "s_…", "ticket": "4821", "descripcion": "Cédula del vendedor", "nombre": "cedula.jpg", "base64": "…", "aceptaAviso": true }
```
Reglas, en este orden (cada falla devuelve `{ error }` en español con el status indicado):
1. JSON inválido → 400. `sesion` debe cumplir `^[A-Za-z0-9_-]{12,64}$` → 400.
2. `aceptaAviso !== true` → 400 «Acepta el aviso de privacidad para enviar documentos.»
3. `descripcion`: 2–120 caracteres tras recortar; `nombre` se limpia a `[\w. -]` y máx. 120.
4. Tope de uso (`almacen.contarUso`): 20 por sesión por hora, 40 por huella de IP por hora (huella = sha256 de `"notaria41:" + ip`, igual que `chat-http.js`) → 429.
5. Conversación = `almacen.conversacion("web:" + sesion)` (si no existe, 404 «No encuentro tu cita»; no la crees). Debe tener una cita con `codigo === ticket`, estado `pendiente` o `confirmada` y `fecha >= hoy` (zona America/Guayaquil) → si no, 404 con el mismo mensaje.
6. `base64` válido, máximo **3 MB ya decodificado** (Vercel rechaza pedidos de más de 4,5 MB y el base64 pesa un tercio más) → 413 «El archivo pesa más de 3 MB…».
7. Tipo real por bytes con `tipoArchivo()` de `api/_lib/archivos.js` (PDF, JPG, PNG, WEBP) → 415 si no.
8. Máximo 20 documentos en la conversación (`almacen.documentos`) → 409.
9. Guarda con `almacen.guardarDocumento({ conversacionId, mediaId: "web-" + uuid, nombre, mime: tipo, bytes, descripcion, tramiteId: cita.tramiteId })`.
10. Evidencia del consentimiento (si aún no hay): `almacen.actualizarConversacion(conv.id, { consentimiento: true, consentimientoEn: ISO, consentimientoTexto: "Casilla del aviso de privacidad en la web (ticket 4821)", consentimientoAviso: "2026-10-07" })`.
11. Aviso al personal: el endpoint recibe `avisar` por inyección (`crearManejadorDocumentos({ …, avisar })`): «Documento recibido en la web (ticket 4821, Ana Pérez): Cédula del vendedor. Revísalo en el panel.»
12. Responde `200 { ok: true, documentos: [{ descripcion, estado, nombre }] }` con todos los documentos de la conversación.

Además `GET /api/documentos?sesion=…&ticket=…` (mismo manejador, método GET) devuelve `{ documentos: [...] }` con la misma validación de sesión y ticket (para pintar la lista al abrir la tarjeta). Misma forma.

`vercel.json`: agregar `"api/documentos.js": { "maxDuration": 30, "includeFiles": "data/**" }`.

## 5. Interfaz del chat (trabajo C)

- `enviarMensaje()` en `js/chat-nucleo.js` devuelve `{ respuestas, tarjetas }`. El chat guarda las tarjetas en el historial local como mensajes `{ autor: "tarjeta", resumen }` (se repintan al reabrir).
- Tarjeta de cita (burbuja `js/chat.js` y página `js/asistente.js`): título «Tu cita», **ticket grande** («Ticket 4821»), estado, fecha y hora, trámite, lugar, «Lleva:» (lista), costo con su aviso, y botones:
  - «Agregar a mi calendario»: descarga un `.ics` generado en el navegador (`js/calendario.js`, función pura `crearIcs(resumen)` con zona America/Guayaquil, duración 1 h, `UID` con el código; sin librerías).
  - «Subir documentos»: abre el panel de subida dentro de la tarjeta: selector de archivos (`accept="application/pdf,image/jpeg,image/png,image/webp"`, `capture` no), campo de descripción, casilla «Acepto el aviso de privacidad» con enlace a `privacidad.html`, botón «Enviar». Las fotos se reducen en el navegador con `<canvas>` a 1600 px de lado máximo y JPEG calidad 0.8 antes de enviar (`js/imagenes.js`, `reducirImagen(file)`). Muestra progreso, errores del servidor tal cual vienen en `error`, y la lista de documentos ya enviados (`GET /api/documentos`).
- Accesibilidad: botones con texto, foco visible, `aria-live="polite"` en el estado de la subida; funciona en 390 px.

## 6. Panel (trabajo C)

- Las citas del panel (lista de la conversación y agenda) muestran «Ticket 4821» junto a la hora.
- Agenda: campo «Buscar ticket» (4 dígitos). Llama a la acción nueva del panel `buscarTicket` (`GET /api/panel?accion=buscarTicket&codigo=4821`) que usa `almacen.citasPorCodigo(codigo, hoy)` y devuelve las citas con `tramite` (nombre), `telefono` y `conversacionId`; se registra en la auditoría (agrega `buscarTicket` a las lecturas auditadas en `api/_lib/panel-http.js`). El resultado muestra cada cita con el botón «Ver chat».

## 7. Precios editables desde el panel (trabajo D)

Datos (bloque nuevo en `supabase/esquema.sql`, con RLS activado y sin políticas, como las demás):
```sql
create table if not exists precios (
  tramite_id text primary key,
  tipo text not null check (tipo in ('pct','fija','cuantia','consultar')),
  valor numeric,
  unidad text not null default '',
  tabla text not null default '',
  actualizado_por text not null default '',
  actualizado_en timestamptz not null default now()
);
create table if not exists ajustes ( clave text primary key, valor text not null, actualizado_por text not null default '', actualizado_en timestamptz not null default now() );
alter table personal add column if not exists rol text not null default 'personal' check (rol in ('admin','personal'));
```
Almacén (ambos adaptadores): `precios()` → `[{ tramiteId, tipo, valor, unidad, tabla, actualizadoPor, actualizadoEn }]`; `guardarPrecio({...})` (upsert); `restaurarPrecio(tramiteId)` (delete); `ajustes()` → `{ sbu: 482, anio: "2026" }` solo con lo guardado; `guardarAjuste(clave, valor, por)`; `esAdmin(email)`.
Semántica de `valor`: igual que `data/tramites.json`: `pct` guarda la fracción (0.12 = 12 % del SBU); la pantalla muestra y recibe el porcentaje (12) y convierte.

Servidor:
- `api/_lib/contenido.js` → `crearContenido()` recibe `almacen` opcional; después de armar `{data, tarifas, notaria}` (hoja o JSON) aplica `precios()` y `ajustes()` sobre una **copia** (nunca mutar el caché de la hoja), con el mismo caché de 5 min; si el almacén falla, usa lo que ya tenía y registra un `console.warn` sin datos personales. `obtenerServicios()` (`api/_lib/servicios.js`) le pasa el almacén.
- `GET /api/precios` (`api/precios.js`): público, `Cache-Control: public, s-maxage=60`, devuelve `{ precios: { "<tramiteId>": { tipo, valor, unidad, tabla } }, sbu, anio }` (solo lo editado). `js/app.js` lo pide al cargar y lo aplica sobre los trámites antes de pintar; si falla, no pasa nada (usa lo de la hoja).
- Panel (`api/_lib/panel-http.js` + `api/_lib/panel.js`): lectura `precios` (cualquier personal): trámites con su tarifa efectiva, si está editada y quién/cuándo; acciones `guardarPrecio`, `restaurarPrecio`, `guardarSBU` **solo si `auditor.esAdmin(email)`** (si no, `Aviso` con status 403 «Solo un administrador puede cambiar los precios.»). Todas auditadas. Validación en `panel.js` (lanzar `Aviso`): el trámite existe; `tipo` válido; `pct`/`fija` con `valor` número finito `> 0` y `<= 10000`; `cuantia` con una `tabla` existente; `unidad` ≤ 30 caracteres; `sbu` entre 100 y 5000; `anio` 4 dígitos.
- Una acción `guardarPrecio` válida debe verse en `calcular_costo` de Sofía en la siguiente lectura del contenido (probar con el caché vencido o `ahora` inyectado).

Pantalla (panel, pestaña nueva «Precios», solo se muestra la edición a admins; el personal normal la ve de solo lectura): buscador; filas con trámite, **precio final con IVA calculado al instante** (`precioTexto`/`calcularTarifa` de `js/nucleo.js`; el panel lo importa con `<script type="module">` desde `../js/nucleo.js`, ya es un módulo), tipo en lista desplegable («Porcentaje del SBU», «Valor fijo (USD)», «Según cuantía», «Consultar»), valor, unidad; «Guardar» pide confirmación «Antes → Después»; «Volver al valor oficial»; arriba SBU y año editables.
