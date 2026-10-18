# Sofía PreFirma y Notaría 41 son proyectos distintos

El producto se llama **Sofía PreFirma**. La Notaría 41 de Quito es su primer piloto. Comparten el código mientras se valida el producto, pero no comparten el destino público:

| Proyecto Vercel | Dominio | Función |
|---|---|---|
| `sofiaprefirma` | `sofiaprefirma.com` | Presentación comercial, portal y servicios de la plataforma |
| `notaria41` | dominio y URL propios de la notaría | Sitio institucional de la Notaría 41 |

## Regla de despliegue

- Las funciones nuevas del portal se prueban y se despliegan primero en `sofiaprefirma`.
- No se despliegan automáticamente en `notaria41` durante el piloto.
- `NOTARIA_ID=notaria41` identifica al piloto dentro del proyecto de Sofía. Cuando una segunda notaría esté lista, tendrá su identificador y dominio propios.
- Los interruptores `portal` y `pagosEnLinea` nacen apagados. El primero se enciende después de configurar correo y base; el segundo solo después de integrar una pasarela real.

## Antes de habilitar el portal

1. Aplicar el bloque del **2026-10-18** de `supabase/esquema.sql`.
2. Configurar en `sofiaprefirma`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NOTARIA_ID`, `CUENTA_SECRETO`, `RESEND_API_KEY` y `CORREO_REMITENTE`.
3. Verificar `sofiaprefirma.com` en el proveedor de correo.
4. Probar código de acceso, cierre de sesión, vínculo de una cita, aislamiento entre clientes y carga de documentos.
5. Activar `portal` desde el panel. No activar `pagosEnLinea` sin proveedor real.

## Dominio del piloto

El destino recomendado para el portal de la primera notaría es `notaria41.sofiaprefirma.com`. El servidor obtiene `notaria41` de ese subdominio; el navegador no puede escoger otra notaría mediante un parámetro.
