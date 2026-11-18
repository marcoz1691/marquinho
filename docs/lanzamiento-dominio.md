# Lanzamiento del dominio notaria41quito.com

**Estado: pendiente.** El dominio principal es `notaria41quito.com`. Por ahora muestra solo una página «Muy pronto» (carpeta `proximamente/`, proyecto de Vercel `notaria41uio-proximamente`), que Google sí puede indexar para que la notaría aparezca al buscarla. La web real sigue en https://notaria41.vercel.app, sin indexar, hasta el paso «Día del lanzamiento».

`notaria41uio.com` fue el primer dominio que se compró; hoy redirige (308) a `notaria41quito.com` y no se renueva más allá de 2027 salvo que se decida otra cosa.

Para cambiar el texto de esa página, edita `proximamente/index.html` y, desde esa carpeta, ejecuta `npx vercel deploy --prod --scope marcspro`.

## Estado al 17 de noviembre de 2026

| Dato | `notaria41quito.com` (principal) | `notaria41uio.com` (anterior) |
|---|---|---|
| Registrador | Vercel, equipo `marcspro` | Vercel, equipo `marcspro` |
| Comprado | 17 de noviembre de 2026 | 1 de noviembre de 2026 |
| Vence | 17 de noviembre de 2027 (renovación: USD 12,03) | 1 de noviembre de 2027 |
| Renovación automática | Activa | Activa: apagarla en Vercel → Domains si se abandona |
| DNS | `ns1.vercel-dns.com` y `ns2.vercel-dns.com` | igual |
| Proyecto conectado | `notaria41uio-proximamente`, con `www` redirigiendo al dominio sin `www` | mismo proyecto; dominio y `www` redirigen a `notaria41quito.com` |
| Buscadores | Página indexable, con `canonical`, `robots.txt`, `sitemap.xml` y datos estructurados (`Notary`) | No se indexa: solo redirige |
| Correo (MX) | Ninguno | Ninguno |

## Antes del lanzamiento

- [ ] Confirmar en Vercel → Domains que la tarjeta guardada no vence antes de noviembre de 2027.
- [ ] Registrar `notaria41quito.com` en Google Search Console como propiedad de **Dominio** (verificación por TXT en Vercel DNS) y enviar `https://notaria41quito.com/sitemap.xml`.
- [ ] Crear o reclamar el perfil de la notaría en Google Business Profile (Maps) y poner `https://notaria41quito.com` como sitio web.
- [ ] Correo: contratar Google Workspace (o Zoho Mail) con `notaria41quito.com`, verificar el dominio y agregar en Vercel DNS los registros MX, SPF y DKIM que indique. Cuentas `nombre.apellido@notaria41quito.com` y un grupo `contacto@` para el correo público.
- [ ] Agregar un registro DMARC (`_dmarc`, TXT `v=DMARC1; p=none; rua=mailto:…`) cuando ya haya correo, para que los mensajes no caigan en spam.
- [ ] Cambiar el correo de contacto `notaria41uio@gmail.com` por el nuevo en `data/notaria.json`, los textos legales (subir versiones en `js/legal.js`) y `supabase/correos/`.
- [ ] Si los avisos del sitio van a salir desde `@notaria41quito.com`, verificar el dominio en Resend y agregar en Vercel DNS los registros que indique.
- [ ] Hacer `npm test` y `npm run test:e2e` sobre la versión que se va a publicar.

## Día del lanzamiento

1. En Vercel, proyecto `notaria41uio-proximamente` → Settings → Domains: quitar `notaria41quito.com`, `www.notaria41quito.com`, `notaria41uio.com` y `www.notaria41uio.com`. Luego, en el proyecto `notaria41` → Settings → Domains: agregar `notaria41quito.com` como principal, y `www.notaria41quito.com`, `notaria41uio.com` y `www.notaria41uio.com` redirigiendo a él. Esperar a que todos aparezcan con certificado válido.
2. En el mismo proyecto → Settings → Environment Variables (Production): poner `SITIO_URL=https://notaria41quito.com` y volver a desplegar. Lo usan los enlaces que manda Sofía y las invitaciones del panel.
3. En Supabase → Authentication → URL Configuration: poner `https://notaria41quito.com` como Site URL y agregar `https://notaria41quito.com/panel/` en Redirect URLs. Mantener la URL de `.vercel.app` hasta comprobar que todo funciona.
4. Si WhatsApp ya está conectado, cambiar en Meta la URL del webhook a `https://notaria41quito.com/api/whatsapp`.
5. Abrir la web a los buscadores: en `robots.txt` cambiar `Disallow: /` por `Allow: /`, quitar `<meta name="robots" content="noindex, nofollow">` de `index.html` y la cabecera `X-Robots-Tag` de `vercel.json`. Agregar `<link rel="canonical">` en cada página y un `sitemap.xml` con todas las páginas, apuntando a `https://notaria41quito.com`, y volver a enviarlo en Search Console.
6. Actualizar los enlaces que se reparten fuera del sitio: perfil de Google Maps, Facebook y tarjetas.

## Comprobar después

- [ ] https://notaria41quito.com abre la web con candado; `www` y `notaria41uio.com` redirigen a él.
- [ ] El panel en `/panel/` permite entrar y una invitación de prueba llega con el enlace del dominio nuevo.
- [ ] Sofía, por la web y por WhatsApp, responde y sus enlaces usan el dominio nuevo.
- [ ] Agendar una cita de prueba y recibir su confirmación.

## Si algo falla

Quitar los dominios del proyecto `notaria41` y volver a agregarlos a `notaria41uio-proximamente` como estaban. La web sigue funcionando en https://notaria41.vercel.app; después se devuelven `SITIO_URL` y la Site URL de Supabase a esa dirección.
