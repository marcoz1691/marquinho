# Sofía PreFirma y Notaría 41 son proyectos distintos

El plan completo de implementación, seguridad, pruebas y rollout está en [plan-piloto-notaria41.md](plan-piloto-notaria41.md).

El producto se llama **Sofía PreFirma**. La Notaría 41 de Quito es su primer piloto. Comparten el código mientras se valida el producto, pero no comparten el destino público:

| Proyecto Vercel | Dominio | Función |
|---|---|---|
| `sofiaprefirma` | `sofiaprefirma.com` | Presentación comercial de la plataforma |
| `sofiaprefirma-notaria41` | `notaria41.sofiaprefirma.com` | Aplicación aislada del primer piloto |
| `notaria41` | dominio y URL propios de la notaría | Sitio institucional de la Notaría 41 |

## Regla de despliegue

- Las funciones nuevas del portal se prueban y se despliegan primero en `sofiaprefirma`.
- No se despliegan automáticamente en `notaria41` durante el piloto.
- `NOTARIA_ID=notaria41` identifica al piloto dentro del proyecto de Sofía. Cuando una segunda notaría esté lista, tendrá su identificador y dominio propios.
- Los interruptores `portal` y `pagosEnLinea` nacen apagados. El primero se enciende después de configurar correo y base; el segundo solo después de integrar una pasarela real.
- Antes de desplegar, ejecuta `npm run vercel:verificar:comercial` o `npm run vercel:verificar:piloto` dentro del checkout aislado correspondiente. La comprobación exige tanto el nombre como el `projectId` exactos y bloquea el proyecto institucional.
- No despliegues desde el checkout principal: actualmente su vínculo local pertenece a `notaria41`.

## Antes de habilitar el portal

1. Aplicar el bloque del **2026-10-18** de `supabase/esquema.sql`.
2. Configurar en `sofiaprefirma`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NOTARIA_ID`, `CUENTA_SECRETO`, `RESEND_API_KEY` y `CORREO_REMITENTE`.
3. Verificar `sofiaprefirma.com` en el proveedor de correo.
4. Probar código de acceso, cierre de sesión, vínculo de una cita, aislamiento entre clientes y carga de documentos.
5. Activar `portal` desde el panel. No activar `pagosEnLinea` sin proveedor real.

## Dominio del piloto

El destino recomendado para el portal de la primera notaría es `notaria41.sofiaprefirma.com`. El servidor obtiene `notaria41` de ese subdominio; el navegador no puede escoger otra notaría mediante un parámetro.

## Estado verificado y reversión

- Producción comercial validada: deployment `dpl_6VhdaVfgNCZ2DZeL8wE4vnaRcb8N`.
- Piloto aislado inicial: deployment `dpl_DsNfpZEj4NZXFr3UqPjoGvMinJDq`; permanece protegido, sin dominio y sin variables operativas.
- Antes de promover otra versión, conserva el ID del deployment que atiende cada dominio.
- Para volver a la versión comercial validada, usa `vercel promote dpl_6VhdaVfgNCZ2DZeL8wE4vnaRcb8N --yes` desde un checkout que haya pasado `npm run vercel:verificar:comercial`.
- No promociones el deployment del piloto ni le asignes `notaria41.sofiaprefirma.com` hasta completar las variables, migraciones y puertas G1–G2 del plan maestro.
