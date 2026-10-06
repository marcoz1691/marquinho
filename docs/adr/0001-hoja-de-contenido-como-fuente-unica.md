# La hoja de Google Sheets es la fuente única del contenido

El notario necesita cambiar trámites, requisitos y tarifas sin depender de un desarrollador, y es una persona de más de 50 años acostumbrada a Excel. Por eso el contenido vive en una hoja de Google Sheets compartida por enlace (solo lectura pública, edición solo del personal) que leen tanto la web (en el navegador) como el asistente de WhatsApp (en el servidor), con el mismo código de lectura (`js/nucleo.js`). Los JSON de `data/` son solo el respaldo cuando la hoja falla o tiene errores.

## Considered Options

- Panel /admin con Decap CMS: más ordenado, pero exige cuenta de GitHub y un login montado aparte.
- Contenido en Supabase con un panel propio: más trabajo y otra interfaz que aprender.

## Consequences

- Todo lo que está en la hoja es público: no debe contener datos personales ni secretos.
- Un error de formato en la hoja no rompe nada: se usa la última copia válida o el respaldo local.
