# Preparación para varias notarías

Hoy el sistema atiende a una sola notaría (`notaria41`). Este documento fija cómo se aísla cada notaría y qué falta para atender a varias, sin prometer una autoconfiguración que todavía no existe.

## Modelo de aislamiento

- La tabla `notarias` lista las notarías. Su `id` es un texto corto (`notaria41`).
- **La notaría la decide el servidor** a partir del dominio del pedido (`api/_lib/notaria.js`, `notariaDe`). Nunca se acepta desde el navegador.
- RLS está activado en todas las tablas y no hay políticas: nadie con la clave pública puede leer ni escribir. El servidor usa `service_role`, que se salta RLS, así que **el aislamiento lo exige el código**: cada método del almacén del portal llama a `exigirNotaria` y filtra por `notaria_id` (y por `cliente_id` en todo lo del cliente). Lo ajeno responde 404, igual que lo inexistente.
- Pruebas de acceso cruzado: `test/portal-almacen.contrato.test.js` (otra notaría y otro cliente).

## Inventario de tablas

| Situación | Tablas |
|---|---|
| Ya tienen `notaria_id` | `conversaciones`, `solicitudes_cita`, `personal`, `clientes`, `cliente_codigos`, `cliente_sesiones`, `tramite_vinculaciones`, `tramite_eventos`, `pagos` |
| La heredan por su conversación o su cita | `sesiones`, `mensajes`, `pendientes`, `archivos`, `documentos`, `pago_eventos` |
| Globales hoy, por notaría más adelante | `precios`, `ajustes` (y los interruptores), `metricas_dia`, `auditoria`, `uso` (prefijos de clave), `consentimientos`, `procesados` |

## Lo que falta para la segunda notaría

1. Restricciones únicas por notaría: `conversaciones (notaria_id, telefono)` y `solicitudes_cita (notaria_id, fecha, codigo)`.
2. `personal` con pertenencia por notaría (hoy la llave es el correo).
3. Archivos en `<notaria_id>/<conversacion_id>/…` y URL firmadas solo tras comprobar en el servidor que el documento es de esa notaría.
4. Un número de WhatsApp, una hoja de contenido y una sal de huellas por notaría.
5. Resolver la notaría por dominio, por ejemplo `notaria41.sofiaprefirma.com`.

## Personalización futura (no disponible todavía)

Una tabla `notaria_marca` con logotipo, colores, dominio, horarios, contactos, catálogo, canales y configuración de pagos. La cargará el equipo de Sofía PreFirma; no habrá autoconfiguración hasta que exista y esté probada.

## Pagos de la notaría por su plan (caso B)

Separados por completo de los pagos de trámites: tablas `suscripciones` y `suscripcion_pagos`, con su propio webhook y sus propios comprobantes. Todavía no se construyen.
