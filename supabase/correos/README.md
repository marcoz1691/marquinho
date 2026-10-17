# Correos del panel (Supabase Auth)

Plantillas en español para los correos que envía Supabase al personal del panel. Se copian a mano en Supabase: no se publican con el sitio.

| Plantilla en Supabase | Archivo | Asunto |
|---|---|---|
| **Invite user** | [invitacion.html](invitacion.html) | Tu acceso al panel de la Notaría 41 de Quito |
| **Reset password** | [recuperar-clave.html](recuperar-clave.html) | Crea una nueva contraseña del panel de la Notaría 41 |

## Cómo cargarlas

1. En supabase.com, abre el proyecto **notaria41** → **Authentication** → **Emails** → **Templates**.
2. Elige **Invite user**, pega el asunto de la tabla y reemplaza todo el cuerpo (**Source**) por el contenido de `invitacion.html`. Guarda.
3. Repite con **Reset password** y `recuperar-clave.html`.
4. Invita a alguien de prueba desde el panel (Equipo) y revisa que el correo llegue en español y que el botón abra el panel.

Las plantillas usan las variables de Supabase `{{ .ConfirmationURL }}` (el enlace para crear la contraseña) y `{{ .Email }}` (el correo de la persona). No las borres.

La invitación también usa los datos que envía el panel al invitar: `{{ .Data.nombre }}`, `{{ .Data.perfil }}` (Administrador, Notario o Personal) y `{{ .Data.invito }}` (quién invitó). Según el perfil, el correo explica qué puede hacer la persona. Si faltan (por ejemplo, en una invitación enviada desde Supabase), el texto se adapta solo.

El sello se carga desde `https://notaria41.vercel.app/assets/logo/icono-512.png` (PNG: Gmail no muestra imágenes SVG). Si cambia el dominio del sitio, cámbialo también aquí.

## Remitente propio (recomendado)

Con el correo por defecto de Supabase, los mensajes salen de `noreply@mail.app.supabase.io`, suelen caer en Spam y hay un límite de pocos envíos por hora. Para que salgan a nombre de la notaría:

1. En la cuenta de Gmail de la notaría, activa la verificación en dos pasos y crea una **contraseña de aplicación** (Cuenta de Google → Seguridad → Contraseñas de aplicaciones).
2. En Supabase → **Authentication** → **Emails** → **SMTP Settings**, activa **Enable custom SMTP** y completa:
   - Sender email: `notaria41uio@gmail.com`
   - Sender name: `Notaría 41 de Quito`
   - Host: `smtp.gmail.com` · Port: `465`
   - Username: `notaria41uio@gmail.com` · Password: la contraseña de aplicación
3. Guarda y envía una invitación de prueba.

La contraseña de aplicación es un secreto: va solo en Supabase, nunca en este repositorio.
