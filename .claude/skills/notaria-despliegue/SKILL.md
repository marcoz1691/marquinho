---
name: notaria-despliegue
description: Checklist de despliegue del sitio, asistente y panel de la Notaría 41 (Vercel + Supabase). Úsalo cuando el usuario hable de desplegar, publicar, ejecutar bloques SQL de supabase/esquema.sql, la pestaña Equipo, interruptores y métricas del piloto, o cambios en textos legales.
allowed-tools: Read, Grep, Glob, Bash
---

# Despliegue de la Notaría 41

Antes de desplegar: `npm test` y `npm run test:e2e` deben pasar. Secretos solo en `.env.local` o Vercel.

## Bloques SQL (supabase/esquema.sql)

Ejecútalos en Supabase **antes** de desplegar el código que los usa. Busca por título:

- «2026-10-11: métricas agregadas del piloto» → interruptores y métricas del piloto.
- «2026-10-11: perfil notario» → pestaña **Equipo**. Además, permitir la URL `…/panel/` en Authentication → URL Configuration.
- «2026-10-16: historial de consentimientos» → textos legales con dos casillas (términos y datos).

Pregunta al usuario cuáles ya ejecutó; no asumas.

## Equipo y legales

- Las cuentas se crean desde **Equipo**: admin gestiona todos los perfiles; notario solo invita/da de baja a Personal. La primera cuenta admin se configura en Supabase (README).
- Textos legales: `privacidad.html`, `terminos.html`, `cookies.html`, `reembolsos.html`, con versiones en `js/legal.js`. Sube la versión al cambiar un texto. Pendientes: `docs/legal/cumplimiento.md`.
- Verificar proyecto Vercel: `npm run vercel:verificar:piloto`.

No ejecutes SQL ni despliegues sin confirmación. Reporta qué falta.
