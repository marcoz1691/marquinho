# Web de la Notaría 42 de Quito

Sitio estático en `notaria42/`, sin panel, sin asistente y sin `api/`. Contrato del 19 de noviembre de 2026, plan «Página web + correo». Notaria: Dra. María Lorena Bermúdez Pozo.

Incluye:
- Portada.
- Catálogo de trámites con requisitos.
- Calculadora básica, solo con los trámites más solicitados.
- Preguntas frecuentes.
- Horario, dirección y contacto.
- Aviso de privacidad.

Se publica como **proyecto de Vercel aparte** (Root Directory = `notaria42`).

## Datos (`notaria42/data/notaria.json`)

Sacados de la imagen que envió la notaría el 21 de noviembre de 2026:
- **Dirección:** Av. Oswaldo Guayasamín Oe1-172 y Eugenio Espejo, Tumbaco, entre El Avicultor y Farmacia Medicity.
- **Teléfono:** 02 601 9691.
- **Correo:** contacto@notaria42quito.com.

Si cambia un dato, se actualiza en `notaria.json` **y** en `index.html` (dirección, teléfono, correo, horario y JSON-LD). Una prueba comprueba que coincidan.

**Por confirmar con la notaria antes de publicar** (campo `_porConfirmar`):
- [ ] Horario (hoy dice: lunes a viernes, de 08:00 a 17:00).
- [ ] WhatsApp. Si no hay, el botón no aparece.
- [ ] Coordenadas del mapa. Mientras no estén, «Cómo llegar» busca la dirección.
- [ ] Redes sociales.
- [ ] Logo. Hoy se usa un sello provisional en `notaria42/assets/sello-42*.svg`; para cambiarlo basta con reemplazar esos dos archivos.
- [ ] Revisión de requisitos y tarifas: según la cláusula novena del contrato, es responsabilidad de la notaria.

## Contenido compartido con la Notaría 41

`node scripts/sincronizar-notaria42.mjs` copia `js/nucleo.js`, `js/tema.js`, `data/tarifas.json` y las fuentes. Úsalo cada enero, al cambiar el SBU, y siempre que cambie el cálculo de tarifas. `test/notaria42.test.js` falla si las copias se desfasan.

`notaria42/data/tramites.json` es propio de la 42: se copió de la 41 cambiando «el notario» por «la notaria» y sin WhatsApp ni citas. No se sincroniza.

## Vista previa

1. En Vercel (scope `marcspro`), crear el proyecto `notaria42quito`, sin framework, con Root Directory `notaria42`.
2. Desde `notaria42/`, ejecutar `npx vercel deploy --prod --scope marcspro`.
3. Enviar el enlace `*.vercel.app` a la notaria. Tiene 5 días hábiles para hacer observaciones; si no las hace, se entiende aprobado.

Mientras tanto, `vercel.json` envía `X-Robots-Tag: noindex`.

## Lanzamiento (después de la aprobación)

- [ ] En `notaria42/vercel.json`, quitar la cabecera `X-Robots-Tag` y desplegar.
- [ ] En `test/notaria42.test.js`, cambiar la comprobación del `noindex`.
- [ ] Vercel → proyecto → Domains: agregar `notaria42quito.com` y `www.notaria42quito.com` (con `www` redirigiendo al dominio sin `www`).
- [ ] En el DNS de GoDaddy, cambiar **solo** estos registros:
  - `A @`: quitar 13.248.243.5 y 76.223.105.230 y poner la IP que indique Vercel (hoy 76.76.21.21);
  - `CNAME www`: `cname.vercel-dns.com`.
- [ ] **No tocar** MX, los TXT de Microsoft (`MS=…`) y de Zoho, `autodiscover`, DKIM (`zoho._domainkey`) ni `_dmarc`. Hay un respaldo del 19 de noviembre en `~/Documents/Sofia-PreFirma-Ventas/`.
- [ ] Comprobaciones:
  - `dig +short A notaria42quito.com` debe dar la IP de Vercel;
  - `dig +short MX notaria42quito.com` no debe cambiar;
  - enviar un correo de prueba a `contacto@`.
- [ ] Google Search Console: crear una propiedad de Dominio (TXT en GoDaddy) y enviar `https://notaria42quito.com/sitemap.xml`.

## Sitio anterior de GoDaddy

Cuando el dominio apunte a Vercel, el sitio de GoDaddy deja de verse. Cancelar su suscripción le toca a la notaria (cláusula cuarta). Con su autorización escrita y **después** del lanzamiento, en GoDaddy → Mis productos se cancela **solo** «Website Builder / Airo». **Nunca Microsoft 365**: ahí está `archivo@notaria42quito.com`, con el único archivo de OneDrive de la notaría.
