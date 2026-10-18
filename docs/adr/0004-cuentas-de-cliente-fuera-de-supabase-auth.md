# Las cuentas de cliente no usan Supabase Auth: el servidor emite sus sesiones

El portal «Mis trámites» (Sofía PreFirma) necesita una cuenta opcional para el cliente. El personal ya usa Supabase Auth, con verificación en dos pasos y la tabla `personal`, y el registro público está desactivado. Si los clientes también fueran usuarios de Supabase Auth, habría que abrir el registro público, la sesión del cliente y la del panel se pisarían en el mismo navegador, y un correo de cliente que luego se agregue a `personal` pasaría a ser del equipo. Por eso los clientes viven en sus propias tablas (`clientes`, `cliente_codigos`, `cliente_sesiones`) y el servidor emite sus sesiones.

## Cómo funciona

- **Acceso sin contraseña:** se entra con un código de 6 dígitos enviado por correo. El código se guarda como HMAC con un secreto del servidor (`CUENTA_SECRETO`), vence en 10 minutos, se anula al quinto intento y se consume de forma atómica (`consumir_codigo_cliente`).
- **Sesión:** un token aleatorio de 32 bytes en la cookie `__Host-sp_sesion` (`HttpOnly`, `Secure`, `SameSite=Strict`). En la base solo se guarda su sha256.
- **Sin enumeración:** pedir un código siempre responde lo mismo, exista o no la cuenta. Recuperar el acceso es el mismo flujo.
- **Una cuenta por notaría:** `unique(notaria_id, email)`. La notaría la decide el servidor, nunca el navegador.
- **El ticket nunca es credencial:** un trámite se guarda en la cuenta solo con un enlace de un solo uso y alta entropía (`tramite_vinculaciones`), consumido de forma atómica (`consumir_vinculacion`).

## Considered Options

- Supabase Auth en el mismo proyecto: obliga a abrir el registro público y mezcla sesiones con el personal.
- Un proyecto de Supabase aparte para clientes: aísla, pero duplica configuración, costos y migraciones.

## Consequences

- El código de sesiones, límites y anti-enumeración es nuestro y está cubierto por pruebas (`test/cuenta-http.test.js`, `test/portal-almacen.contrato.test.js`).
- El servidor usa `service_role`, que se salta RLS: el aislamiento por notaría y por cliente lo exige el almacén (cada método pide `notariaId` y filtra por `cliente_id`).
- Para enviar los códigos hace falta un proveedor de correo (Resend con el dominio sofiaprefirma.com). Sin él, el portal queda apagado.
