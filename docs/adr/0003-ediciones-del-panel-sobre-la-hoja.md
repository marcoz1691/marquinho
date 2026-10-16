# El panel puede corregir precios y textos de trámites por encima de la hoja

La hoja de Google sigue siendo la base del contenido ([ADR 0001](0001-hoja-de-contenido-como-fuente-unica.md)), pero el notario y los administradores necesitan corregir un precio, un nombre o un requisito desde el panel, sin abrir la hoja. Lo editado en el panel se guarda en Supabase (precios en la tabla `precios`; textos en `ajustes` como `tramite.<id>`) y se aplica encima de lo que dice la hoja, con el mismo código en la web y en Sofía (`aplicarPrecios` en `js/precios.js`).

## Considered Options

- Escribir los cambios en la hoja desde el panel: exige credenciales de escritura de Google en el servidor.
- Mover todo el contenido a Supabase: deja sin uso la hoja que el notario ya conoce.

## Consequences

- Mientras un trámite tenga texto o precio editado en el panel, los cambios de la hoja en ese trámite no se ven. El panel lo indica y ofrece volver al valor de la hoja.
- Un texto inválido se descarta y queda el de la hoja: nunca se publica un trámite vacío.
- Los cambios se ven en la web en 1 minuto y en Sofía en hasta 5 (cachés de `/api/precios` y del contenido del servidor).
