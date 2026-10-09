# AGENTS.md

Sitio web, asistente «Sofía» (web y WhatsApp) y panel del personal de la Notaría 41 de Quito. El [README](README.md) explica la puesta en marcha y el [GLOSSARY](GLOSSARY.md) el vocabulario del dominio.

## Estructura

- **Sitio estático:** `index.html`, `asistente.html`, `privacidad.html`, `404.html`, `css/`, `js/`, `assets/`. No hay build ni bundler: los archivos se sirven tal cual.
- **Funciones de Vercel:** `api/` (Node 24, módulos ES). La lógica compartida está en `api/_lib/`. Usan Claude (`@anthropic-ai/sdk`) y Supabase.
- **Panel del personal:** `panel/`.
- **Contenido:** una hoja de Google es la fuente única ([ADR 0001](docs/adr/0001-hoja-de-contenido-como-fuente-unica.md)). Los JSON de `data/` son el respaldo. [js/nucleo.js](js/nucleo.js) lo comparten la web y el asistente.
- **Base de datos:** [supabase/esquema.sql](supabase/esquema.sql).
- **Despliegue y cabeceras (CSP, caché):** [vercel.json](vercel.json).

## Comandos

```
npm install
npm test            # Vitest (test/)
npm run test:e2e    # Playwright (e2e/), en escritorio y móvil
npm run dev         # sitio en http://localhost:8000
npm run probar      # chatear con el asistente en la terminal (usa Claude real y .env.local)
```

Antes de dar un cambio por terminado, `npm test` y `npm run test:e2e` deben pasar.

## Reglas del proyecto

- Todo el texto va en español de Ecuador y trata al usuario de **tú**, nunca de usted.
- El sitio no usa fotos: el elemento visual principal es el sello de la notaría.
- El asistente informa, cotiza y prepara trámites, pero nunca completa actos notariales ([ADR 0002](docs/adr/0002-el-asistente-no-completa-actos-notariales.md)).
- No añadas scripts, estilos ni fuentes desde CDNs externos: sirve todo desde el propio sitio y mantén la CSP de [vercel.json](vercel.json) lo más cerrada posible.
- Los secretos van en `.env.local` (local) o en Vercel; nunca en el repositorio.
