# Notaría 41 de Quito: sitio web y asistente de WhatsApp

- **Sitio web estático** (`index.html`, `css/`, `js/`). Muestra trámites, requisitos, tarifas oficiales y la calculadora. Su contenido se edita desde Google Sheets.
- **Asistente de WhatsApp con IA** (`api/`). Funciona en Vercel con Claude y Supabase. Conversa en lenguaje natural, cotiza, recibe documentos para pre-revisión y toma solicitudes de cita. Nunca completa actos notariales: todos se firman en la notaría ([ADR 0002](docs/adr/0002-el-asistente-no-completa-actos-notariales.md)).
- **Panel del personal** (`panel/`). Desde ahí el personal responde chats derivados, confirma citas y revisa documentos.

El vocabulario del dominio está en [GLOSSARY.md](GLOSSARY.md).

## Desarrollo local

```
npm install
npm test                       # pruebas (Vitest)
npm run dev                    # sitio en http://localhost:8000
node scripts/probar-asistente.mjs   # chatear con el asistente en la terminal (necesita ANTHROPIC_API_KEY; usa Claude real)
```

## Contenido: una sola hoja de Google ([ADR 0001](docs/adr/0001-hoja-de-contenido-como-fuente-unica.md))

La web y el asistente leen la misma hoja con el mismo código ([js/nucleo.js](js/nucleo.js)). Si la hoja falla, usan la última copia válida y, si no la hay, los JSON de `data/`.

1. Abre la hoja de Google, ve a **Archivo → Importar → Subir** y elige [cms/Notaria41-contenido.xlsx](cms/Notaria41-contenido.xlsx). Selecciona **Reemplazar hoja de cálculo**.
2. Configura el acceso:
   - **Compartir → Acceso general:** «Cualquier persona con el enlace», como **Lector**. Nunca como Editor.
   - Agrega al notario y al personal como **Editores**.
3. En [data/config.json](data/config.json), en `googleSheet`, completa:
   - `documento`: el ID de la hoja, que es lo que va entre `/d/` y `/edit` en su enlace;
   - `pestanas`: el `gid` de cada pestaña, que aparece al final de la URL como `#gid=…` cuando abres esa pestaña.
4. Los cambios del notario aparecen en la web al recargar y en el asistente en menos de 5 minutos.

La guía para el notario está en [cms/GUIA-NOTARIO.md](cms/GUIA-NOTARIO.md).

## Asistente de WhatsApp: puesta en marcha

### 1. Supabase
1. Crea un proyecto en supabase.com.
2. En el **SQL Editor**, ejecuta [supabase/esquema.sql](supabase/esquema.sql). Crea las tablas con RLS y el bucket privado `documentos`.
3. Crea las cuentas del personal en **Authentication → Users → Add user**, con correo y contraseña.
4. Autoriza a cada persona del personal en el panel, con el correo en minúsculas: `insert into personal (email, nombre) values ('correo@…', 'Nombre');`
5. En Authentication → Providers → Email, desactiva el registro público ("Allow new users to sign up") y deja la confirmación de correo activa.
6. Copia `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, que están en Project Settings → API.

### 2. WhatsApp Cloud API (Meta)
1. Crea una cuenta en Meta Business Manager y verifica el negocio.
2. En developers.facebook.com, crea una app de tipo **Business** y agrégale el producto **WhatsApp**.
3. Registra el **número nuevo del asistente**. No puede estar registrado en ninguna app de WhatsApp. Copia el **Phone number ID**.
4. Genera un **token permanente**: Business Settings → System users → token con permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
5. Copia el **App secret**, que está en App settings → Basic.
6. En WhatsApp → Configuration → Webhook:
   - URL: `https://<tu-dominio>/api/whatsapp`;
   - token de verificación: el mismo valor que pongas en `WHATSAPP_VERIFY_TOKEN`;
   - suscripción: campo `messages`.
7. Crea y envía a aprobación cuatro **plantillas** en español, de categoría Utility:
   - `aviso_personal`, con el cuerpo `Aviso del asistente: {{1}}`. Es la que avisa al personal (0996530276) de citas, documentos y derivaciones.
   - `recordatorio_cita`, con el cuerpo `Hola {{1}}, te recordamos tu cita para {{2}} mañana a las {{3}} en la Notaría 41. Trae tus documentos originales.`
   - `cita_confirmada`, con el cuerpo `Hola {{1}}, tu cita para {{2}} quedó confirmada para el {{3}} a las {{4}} en la Notaría 41.`
   - `cita_rechazada`, con el cuerpo `Hola {{1}}, no pudimos confirmar tu cita del {{2}} a las {{3}}. Escríbenos otro horario y te ayudamos.`
   - Las dos últimas se usan solo cuando pasaron más de 24 h desde el último mensaje del cliente.

### 3. Vercel
1. Importa el repositorio en Vercel. No hace falta un build: el sitio es estático y `api/` contiene las funciones.
2. Carga las variables de [.env.example](.env.example) en Settings → Environment Variables.
3. El cron de [vercel.json](vercel.json) llama a `/api/recordatorios` todos los días a las 17:00 de Quito, que son las 22:00 UTC.
4. Deja activado **Fluid compute** (Settings → Functions): el webhook puede tardar hasta 300 s en conversaciones con varias herramientas.
5. Cambia el número de WhatsApp de la web al **número del asistente**: en la pestaña Configuración de la hoja, dato «WhatsApp».

### Cómo se comporta el asistente
- **Modelo:** `claude-opus-5-5`, con respaldo automático ante rechazos (`fallbacks: "default"`) y caché del prompt. La base de conocimiento queda fija durante cada sesión de conversación, que se renueva tras 24 h sin mensajes.
- **Consentimiento:** pide aceptar el tratamiento de datos (LOPDP) antes de recibir documentos. Solo guarda archivos que el cliente envió en esa misma conversación.
- **Citas:** quedan como solicitudes pendientes hasta que alguien del personal las confirma o rechaza en el panel; entonces el cliente recibe el aviso por WhatsApp.
- **Mensajes seguidos:** si el cliente manda varias burbujas seguidas, el asistente espera unos segundos, las junta y responde una sola vez. Solo un proceso responde a la vez por conversación, y el panel respeta ese turno.
- **Documentos:** el personal los marca como aprobados u observados desde el panel y el cliente recibe el aviso.
- **Derivación:** al pasar la conversación a una persona, el asistente deja de responder hasta que el personal pulse «Devolver al asistente».
- **Regla de WhatsApp:** el personal solo puede escribir libremente dentro de las 24 h desde el último mensaje del cliente. Pasado ese plazo hay que llamarlo por teléfono.

### Panel del personal
`https://<tu-dominio>/panel/`: el personal entra con su correo y su contraseña de Supabase.

## Fuentes del contenido
- **Tarifas:** Catálogo de Servicios Notariales, Resolución 216-2017 del Consejo de la Judicatura. El SBU de 2026 es USD 482 (Acuerdo MDT-2025-195).
- **Tablas por cuantía:** tarifario de la Notaría 39 de Quito. La tabla de hipotecas difiere entre notarías: hay que confirmarla con la Notaría 41.
- **Requisitos:** los publicados por las Notarías 80 y 22 de Quito y la Notaría Tercera.
- **Comparecencia telemática:** Ley Notarial, Art. 18.1 y 18.2 (R.O. Suplemento 345 del 8-12-2020, reformada por el R.O. Suplemento 245 del 7-02-2023).

## Logo
[assets/logo/generar_sello.py](assets/logo/generar_sello.py) genera el sello vectorial calcado del original. Usa las fuentes Arimo y UnifrakturMaguntia (OFL), recortadas en `assets/logo/fuentes/`.
