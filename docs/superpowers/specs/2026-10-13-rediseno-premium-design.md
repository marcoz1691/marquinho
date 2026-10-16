# Rediseño premium de la portada

Fecha: 2026-10-13 · Rama: `claude/folios-tramites`

## Objetivo

Que la portada se sienta futurista, formal, seria, premium y moderna, sin información repetida. Cada sección responde una sola pregunta: ¿quién es?, ¿qué necesito y cuánto cuesta?, ¿cuánto pago exactamente?, ¿me ayudan a prepararlo?, ¿qué dudas tengo?, ¿dónde están?

Se respetan las restricciones de AGENTS.md: sin fotos (el sello es lo visual principal y nada se superpone a él), trato de tú, sin CDNs y «Reducir movimiento».

## Decisiones tomadas con el usuario

- Enfoque A: un recorrido con un solo trabajo por sección.
- Dirección mixta: base clara de papel cálido y tres «actos» oscuros (inicio, Sofía/WhatsApp y pie).
- Se conservan todos los efectos: el inicio que se desvanece, la hoja que se superpone, las palabras que se iluminan y las entradas al aparecer.
- Redundancias que hay que eliminar: «Encuentra tu trámite» frente a la frase grande, y trámites frente a Sofía/WhatsApp.

## Sistema visual

- **Oscuro:** `--noche:#0B1712`. Líneas de 1 px en blanco al 10 %. Un único brillo radial esmeralda detrás del sello. Sello en la versión blanca.
- **Color:** un acento esmeralda para las acciones. La miel solo para hilos, etiquetas y cifras.
- **Tipografía:** Archivo. Títulos en peso 500 con tracking negativo, etiquetas con tracking amplio y cifras tabulares.
- **Radios:** 8 px en controles y 14 px en contenedores. En lo claro, borde fino en lugar de sombra. En lo oscuro, paneles con borde interior luminoso y sin desenfoque en el contenido que se desplaza.
- **Movimiento:** una sola curva, `--ease:cubic-bezier(.32,.72,0,1)`. Con «Reducir movimiento», solo desvanecidos.

## Secciones

1. **Inicio (oscuro):**
   - Nombre a la izquierda y sello blanco a la derecha, con el brillo detrás.
   - Botón «Ver trámites» y enlace «Agenda tu cita».
   - Escena fijada de 135vh con desvanecido al hacer scroll.
   - El menú es claro sobre el inicio mientras no se ha hecho scroll.
2. **Frase + catálogo (hoja clara que sube):**
   - La sección `#tramites` es la hoja.
   - Su título es la frase iluminada «Cada trámite, explicado…» (h2 `#words`) y se elimina «Encuentra tu trámite».
   - Debajo van el buscador, las pestañas, la lista y el panel.
   - En el panel, el bloque de Sofía se reduce a una acción discreta.
3. **Calculadora:** se queda como está, con los nuevos tokens.
4. **Sofía/WhatsApp (oscuro):**
   - Cabecera corta, con botón de WhatsApp, número y horario.
   - Tres pasos (Escribe, Prepara y Firma) en una rejilla con números en miel. El paso 2 mantiene `[data-funcion="documentos"]`.
   - Un teléfono estilizado con la conversación. Las burbujas aparecen en secuencia al entrar en pantalla.
   - Se mantienen `#waEjemploRequisitos` y el ticket 4821.
5. **Preguntas y contacto:** sin cambios de estructura.
6. **Pie (oscuro):** sello blanco, `#footTxt`, el aviso y el enlace legal en tres columnas sobre una línea fina.

## Plan de ejecución

1. Tokens y estilos de oscuro en `css/styles.css`, en `:root` y en una clase `.oscuro` reutilizable.
2. Inicio:
   - En `index.html`, sello blanco fijo.
   - En CSS, escena fijada, fondo oscuro y brillo.
   - Menú sobre el inicio cuando no está `.scrolled`, solo en escritorio y en los iconos.
3. Frase y catálogo:
   - En `index.html`, unir `statement` y `#tramites` en una sola sección y quitar el h2 antiguo.
   - En CSS, la hoja que se superpone.
   - En `js/app.js`, `sofia()` como acción discreta.
4. WhatsApp:
   - En `index.html`, el nuevo marcado.
   - En CSS, el oscuro, los pasos y el teléfono.
   - En `js/app.js`, la secuencia de burbujas con `IntersectionObserver`.
5. Pie: marcado y CSS.
6. Tests:
   - En `e2e/portada.e2e.js`, 3 pasos en lugar de 6.
   - Recuperar la aserción de desvanecido del inicio.
7. Verificación:
   - `npm test` y `npm run test:e2e`.
   - Capturas a 1440 px y 390 px, en claro y oscuro.
