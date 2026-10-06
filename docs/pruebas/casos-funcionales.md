# Casos de prueba funcionales: sitio web de la Notaría 41

Cada caso tiene su prueba automática en `e2e/` con el mismo código (CF-xx). Para ejecutarlas:

```bash
npm run test:e2e                 # todas (escritorio + móvil)
npx playwright test -g "CF-57"   # un caso
npx playwright show-report e2e/reporte
```

Condiciones de las pruebas: Chrome de escritorio y Pixel 7 (casos `@movil`), idioma es-EC, zona horaria America/Guayaquil, datos locales de `data/*.json`. Se bloquean fuentes, íconos y mapas externos, y la API `/api/chat` se simula (no se gastan llamadas al asistente real).

Estado: **Pasa** = funciona; **Pasa (corregido)** = defecto encontrado en la revisión y ya arreglado (ver tabla al final).

## 1. Catálogo de trámites (`tramites.e2e.js`)

| ID | Caso | Resultado esperado | Estado |
|----|------|--------------------|--------|
| CF-10 | Abrir la portada | Pestaña "Más pedidos" activa con los 8 trámites destacados en orden | Pasa |
| CF-11 | Abrir la portada | El primer trámite queda seleccionado y su detalle visible | Pasa |
| CF-12 | Pulsar cada pestaña de categoría | Solo aparecen los trámites de esa categoría | Pasa |
| CF-13 | Ver la sección Servicios | Una fila por área, con su número de trámites | Pasa |
| CF-14 | Pulsar un área en Servicios | Baja a Trámites con esa pestaña activa | Pasa |
| CF-15 | Elegir un trámite | Detalle con categoría, requisitos, pasos y nota; URL `#t-<id>` | Pasa |
| CF-16 | Ver precios en la lista | `$57,84 + IVA`, `Según cuantía`, `$1,79 + IVA por hoja` | Pasa |
| CF-17 | Abrir un trámite con tarifa "Consultar" | No ofrece "Calcular costo" | Pasa |

## 2. Buscador

| ID | Caso | Resultado esperado | Estado |
|----|------|--------------------|--------|
| CF-20 | Buscar "divorcio" | Aparece el trámite; ninguna pestaña activa | Pasa |
| CF-21 | Buscar "POSESION" (sin tilde, mayúsculas) | Encuentra "Posesión efectiva" | Pasa |
| CF-22 | Buscar texto de un requisito | Encuentra el trámite que lo pide | Pasa |
| CF-23 | Buscar algo inexistente | Mensaje "No encontramos ese trámite…" y lista oculta | Pasa |
| CF-24 | Borrar la búsqueda | Vuelve "Más pedidos" | Pasa |
| CF-25 | Elegir pestaña con búsqueda escrita | Se limpia la búsqueda | Pasa |

## 3. Detalle del trámite

| ID | Caso | Resultado esperado | Estado |
|----|------|--------------------|--------|
| CF-30 | Marcar requisitos y recargar | Las casillas siguen marcadas | Pasa |
| CF-31 | Botones de WhatsApp | `wa.me/593996530276` con el nombre del trámite en el mensaje | Pasa |
| CF-32 | "Calcular costo" | La calculadora se posiciona con ese trámite y su total | Pasa |
| CF-33 | "Compartir" (móvil con menú nativo) | Comparte nombre, requisitos y enlace `#t-<id>` | Pasa |
| CF-34 | "Compartir" sin menú nativo | Abre WhatsApp con el texto | Pasa |
| CF-35 | "Imprimir" | Abre el diálogo de impresión en modo ficha | Pasa |
| CF-40 | Abrir `/#t-salida-pais` | "Más pedidos" activa con ese trámite | Pasa |
| CF-41 | Abrir `/#t-hipoteca` | Pestaña "Escrituras e inmuebles" con ese trámite | Pasa |
| CF-42 | Abrir `/#t-no-existe` | Portada normal, sin errores | Pasa |
| CF-43 | Cambiar el hash con la página abierta | Cambia el trámite mostrado | Pasa |

## 4. Calculadora de tarifas (`calculadora.e2e.js`)

Valores calculados a mano con SBU 2026 = $482 e IVA 15 %.

| ID | Caso | Resultado esperado | Estado |
|----|------|--------------------|--------|
| CF-50 | Ver encabezado | Año 2026, SBU $482,00 | Pasa |
| CF-51 | Ver lista de trámites | Solo calculables, agrupados por categoría | Pasa |
| CF-52 | Poder persona natural (12 % SBU) | $57,84 + $8,68 = **$66,52** | Pasa |
| CF-53 | Salida del país, 2 menores | $48,20 + $7,23 = **$55,43** | Pasa |
| CF-54 | Copias certificadas, 2 hojas | $3,58 + $0,54 = **$4,12** | Pasa |
| CF-55 | Cantidad vacía, 0 o negativa | Se cuenta como 1 | Pasa |
| CF-56 | Compraventa sin monto | Pide "Ingresa el valor del contrato…" | Pasa |
| CF-57 | Compraventa $85000 | Rango $60.000,01–$90.000 (0,8 SBU) = **$443,44** | Pasa |
| CF-58 | Monto justo en el límite ($10000) | Pertenece al rango inferior | Pasa |
| CF-59 | Monto "85,000" | $443,44 | Pasa |
| CF-60 | Monto "85.000" (como lo escribe la web) | $443,44 | Pasa (corregido) |
| CF-61 | Monto "1.250.000,50" | $5.543,00 | Pasa (corregido) |
| CF-62 | Monto $5.000.000 | "Rango desde $3.000.000,01: 20 SBU" = $11.086,00 | Pasa |
| CF-63 | Constitución de compañía $2.000.000 | "Consulta con la notaría" | Pasa |
| CF-64 | Hipoteca $85000 | Usa tabla de hipotecas: $299,32 | Pasa |
| CF-65 | Nota del trámite | Se muestra bajo el resultado | Pasa |
| CF-66 | Compraventa $20000 (IVA exacto $25,305) | IVA $25,31, total $194,01 | Pasa (corregido) |

## 5. Portada, contacto y navegación (`portada.e2e.js`)

| ID | Caso | Resultado esperado | Estado |
|----|------|--------------------|--------|
| CF-70 | Datos de la notaría | Título, nombre, notario y eslogan desde los datos | Pasa |
| CF-71 | Teléfonos y correo | Enlaces `tel:+593…` y `mailto:` correctos | Pasa |
| CF-72 | Cómo llegar / Waze / mapa | Apuntan a las coordenadas de la notaría | Pasa |
| CF-73 | Redes sociales | Solo Facebook (la única configurada) | Pasa |
| CF-74 | Datos para Google (schema.org) | Tipo Notary, teléfono y días hábiles | Pasa |
| CF-75 | Pie de página | Año en curso | Pasa |
| CF-76 | Estado abierto/cerrado (7 horarios) | Lun 08:00 abierto, 07:59 cerrado, vie 17:00 cerrado, fines de semana cerrado | Pasa |
| CF-77 | Visitante en España, lunes 10:00 de Quito | "Abierto ahora" | Pasa (corregido) |
| CF-80 | Sin avisos | No aparece barra de aviso | Pasa |
| CF-81 | Avisos con fechas | Solo se muestra el vigente | Pasa |
| CF-82 | Cerrar un aviso y recargar | No vuelve en la misma sesión | Pasa |
| CF-85 | Falla la carga de datos | Mensaje de error visible | Pasa |
| CF-86 | Hoja de Google sin pestañas | Usa los JSON locales, sin pedir a Google | Pasa |
| CF-87 | Cargar la portada | Sin errores de JavaScript | Pasa |
| CF-90 | Enlaces del menú | Cada uno lleva a su sección | Pasa |
| CF-91 | Primer Tab | "Saltar al contenido" recibe el foco | Pasa |
| CF-92 | Preguntas frecuentes | Todas visibles | Pasa |
| CF-93 | Accesibilidad básica | Un solo h1; todas las imágenes con alt | Pasa |
| CF-94 | Móvil: menú hamburguesa | Abre, y se cierra al elegir sección | Pasa |
| CF-95 | Móvil: Escape con menú abierto | Se cierra y anuncia "cerrado" | Pasa (corregido) |
| CF-96 | Móvil: elegir trámite | La vista baja hasta el detalle | Pasa |
| CF-97 | Móvil: Tab con menú cerrado | No pasa por enlaces invisibles | Pasa (corregido) |
| CF-100 | Aviso de privacidad | Abre desde el pie y permite volver | Pasa |
| CF-101 | Página 404 | Enlaces a inicio y trámites | Pasa |
| CF-102 | Manifiesto, íconos, robots.txt | Responden 200 | Pasa |

## 6. Chat de la portada (`chat.e2e.js`)

| ID | Caso | Resultado esperado | Estado |
|----|------|--------------------|--------|
| CF-110 | Pulsar "¿Te ayudo?" | Bienvenida, 3 sugerencias, foco en el campo | Pasa |
| CF-111 | Enviar pregunta | Burbuja del cliente y respuesta; sesión válida | Pasa |
| CF-112 | Pulsar sugerencia | Se envía como pregunta | Pasa |
| CF-113 | Varias respuestas | Una burbuja por respuesta | Pasa |
| CF-114 | Respuesta con formato | Negritas, listas y enlaces | Pasa |
| CF-115 | HTML malicioso en mensajes | Se muestra como texto, no se ejecuta | Pasa |
| CF-116 | Mensaje vacío | No se envía | Pasa |
| CF-117 | Shift+Enter | Salto de línea sin enviar | Pasa |
| CF-118 | Mensaje largo | Límite de 1000 caracteres | Pasa |
| CF-119 | Esperando respuesta | Indicador "escribiendo" y no se duplica el envío | Pasa |
| CF-120 | Servidor saturado (429) | Muestra el mensaje del servidor | Pasa |
| CF-121 | Error 500 | Mensaje genérico | Pasa |
| CF-122 | Sin internet | "Sin conexión. Revisa tu internet…" | Pasa |
| CF-123 | Recargar la página | La conversación y la sesión se conservan | Pasa |
| CF-124 | "Conversación nueva" | Chat limpio y sesión distinta | Pasa |
| CF-125 | "Conversación nueva" con respuesta pendiente | La respuesta no cae en la nueva | Pasa (corregido) |
| CF-126 | Escape / X | Cierra y devuelve el foco al botón | Pasa |
| CF-127 | "Prefiero WhatsApp" | Enlace al número de la notaría | Pasa |
| CF-128 | "Pantalla completa" | Abre la página del asistente | Pasa |
| CF-129 | Móvil: usar el chat | Respuesta y campo visibles | Pasa |

## 7. Asistente a pantalla completa (`asistente.e2e.js`)

| ID | Caso | Resultado esperado | Estado |
|----|------|--------------------|--------|
| CF-130 | Abrir `asistente.html` | Inicio, 4 tarjetas, historial vacío, sin errores JS | Pasa |
| CF-131 | Botón Enviar | Deshabilitado sin texto | Pasa |
| CF-132 | Pulsar una tarjeta | Envía la pregunta; aparece en historial bajo "Hoy" | Pasa |
| CF-133 | Cambiar de conversación en el historial | Muestra la conversación elegida | Pasa |
| CF-134 | Borrar conversación | Pide confirmación; cancelar no borra | Pasa |
| CF-135 | Conversación iniciada en la burbuja | Aparece en la página completa | Pasa |
| CF-136 | Error del servidor | Se muestra como aviso | Pasa |
| CF-137 | "Copiar respuesta" | Copia el texto original | Pasa |
| CF-138 | Enlaces laterales | WhatsApp, portada y privacidad | Pasa |
| CF-139 | Nueva conversación con respuesta pendiente | La respuesta no cae en la nueva | Pasa (corregido) |
| CF-140 | Móvil: menú lateral | Abre y se cierra tocando fuera | Pasa |

## Defectos encontrados (todos corregidos)

| ID | Severidad | Defecto | Corrección |
|----|-----------|---------|------------|
| DEF-01 | **Alta** | La calculadora leía "85.000" como 85 dólares: el cliente veía $110,86 en vez de $443,44. | Nueva función `montoEscrito()` en `js/nucleo.js`: acepta "85.000", "85,000", "1.250.000,50" y "10000.01". |
| DEF-02 | Media | "Abierto/Cerrado ahora" usaba la hora del dispositivo del visitante, no la de Quito. | Nueva función `estaAbierto()` en `js/nucleo.js`, siempre con la zona America/Guayaquil. |
| DEF-03 | Baja | En móvil, Escape cerraba el menú pero lo seguía anunciando como abierto. | `js/app.js`: Escape también pone `aria-expanded="false"`. |
| DEF-04 | Baja | Un IVA de $25,305 se redondeaba a $25,30 en vez de $25,31. | `redondear()` en `js/nucleo.js` evita el error de coma flotante. Afecta también al asistente de WhatsApp, que usa el mismo cálculo. |
| DEF-05 | Baja | En móvil, con el menú cerrado, el foco del teclado pasaba por enlaces invisibles. | `css/styles.css`: el menú cerrado lleva `visibility:hidden`. |
| DEF-06 | Media | Una respuesta que llegaba tras pulsar "Conversación nueva" se guardaba en la conversación nueva. | `js/chat.js` y `js/asistente.js`: la respuesta va a la conversación donde se preguntó. |
