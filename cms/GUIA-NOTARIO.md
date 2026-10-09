# Cómo actualizar la página web de la Notaría 41

Todo el contenido de la página (trámites, requisitos, tarifas, preguntas, avisos y datos de contacto) está en una hoja de Google Sheets. Lo que cambies ahí aparece en la página en unos 5 minutos. No necesitas al desarrollador.

## Entrar a la hoja

Abre el enlace de la hoja «Notaría 41 – Contenido web» con tu cuenta de Gmail. Está en tu Google Drive.

## Las pestañas

| Pestaña | Para qué sirve |
|---|---|
| **Trámites** | Un trámite por fila: nombre, descripción, requisitos, pasos y tarifa. |
| **Categorías** | Los grupos de la sección «En qué podemos ayudarte». |
| **Preguntas** | Las preguntas frecuentes. |
| **Avisos** | Mensajes que salen arriba de la página: feriados, horarios especiales. |
| **Configuración** | Dirección, teléfonos, WhatsApp, correo, horario, SBU del año y enlace para agendar citas. |
| **Tablas** | Valores por cuantía (compraventas, hipotecas, compañías). Solo cambian si el Consejo de la Judicatura los modifica. |

## Tareas frecuentes

**Cambiar un requisito.** En «Trámites», busca el trámite y edita la celda de «Requisitos». Escribe un requisito por línea. Para pasar a la línea siguiente dentro de la celda: `Ctrl + Enter` (Windows) o `⌘ + Enter` (Mac).

**Agregar un trámite.** Copia una fila parecida, pégala al final y cámbiale los datos. El «Código» debe ser único, en minúsculas y sin espacios ni tildes (ejemplo: `poder-especial-exterior`).

**Ocultar un trámite sin borrarlo.** Pon «No» en la columna «Mostrar».

**Citas que confirma Sofía sola.** En «Trámites», la columna «Revisión antes de la cita» decide qué pasa cuando alguien pide una cita por WhatsApp o por la web. Con «No», Sofía la confirma al instante si hay cupo. Con «Sí», queda pendiente hasta que el personal la confirme en el panel (para trámites que necesitan minuta o revisar documentos antes).

**Cupo y feriados.** En «Configuración», «Citas por hora» es cuántas citas se aceptan en cada hora (por ejemplo, 2). En «Feriados» escribe las fechas en que no se atiende, separadas por comas (por ejemplo, 2/11/2026, 3/11/2026): ese día Sofía no agenda citas.

**Nombre y cargo en la portada.** En «Configuración», «Notario» es el nombre grande de la portada, «Cargo del notario» es la línea pequeña que va encima (por ejemplo, Notario Cuadragésimo Primero del Cantón Quito) «Nombre corto del notario» es el que aparece en el menú de arriba, y «Eslogan» es la frase que va debajo del nombre.

**Cambiar una tarifa.** En «Tipo de tarifa» elige de la lista:
- *Porcentaje del SBU*: en «Valor» escribe solo el número (12 = 12% del SBU).
- *Valor fijo (USD)*: en «Valor» escribe el monto (1.79).
- *Según cuantía*: elige la tabla en «Tabla de cuantía».
- *Consultar*: la página muestra «Consultar» en lugar de un precio.

**Nuevo año, nuevo SBU.** En «Configuración», cambia «SBU» y «Año de tarifas». Todos los precios se recalculan solos.

**Publicar un aviso.** En «Avisos», escribe el mensaje, las fechas «Desde» y «Hasta» (formato 2026-11-02) y pon «Sí» en «Mostrar». El aviso desaparece solo después de la fecha «Hasta».

## Importante

- No cambies los nombres de las pestañas ni los títulos de la primera fila.
- Si algo queda mal escrito, la página sigue mostrando los últimos datos correctos. Corrige la hoja y espera unos minutos.
- Los cambios tardan hasta 5 minutos en verse. Si no los ves, recarga la página.

## Cambiar un precio desde el panel

Entra al panel y abre **Precios**. Busca el trámite y, con una cuenta administradora, elige el tipo, valor y unidad. Para porcentajes escribe el porcentaje (por ejemplo, 12 para el 12 % del SBU). El precio final con IVA se actualiza mientras escribes. Pulsa **Guardar** y confirma el cambio «Antes → Después». Usa **Volver al valor oficial** para quitar una edición. Arriba puedes cambiar el SBU y el año. El personal puede consultar los precios, pero solo los administradores pueden cambiarlos. La web lo muestra en un minuto y Sofía en hasta cinco; una conversación que ya estaba abierta con Sofía puede seguir citando el valor anterior.

Reglas que el panel aplica por ti, para evitar errores de dedo:
- Los trámites que se cobran por unidad (copias certificadas, materializaciones, salida del país) deben conservar la palabra «por» en la unidad (por hoja, por firma…); si no, la cantidad dejaría de multiplicar.
- Las copias certificadas y las materializaciones siempre llevan un precio por hoja: no se pueden dejar en «Consultar» o «Según cuantía».
- El porcentaje del SBU va de 0,1 % a 500 % y un valor fijo de $0,01 a $1000.
- Si cambias el SBU o el año aquí, los cambios de la hoja de Google dejan de verse hasta que pulses **Volver al SBU de la hoja**.

**Quién es administrador.** Hoy lo es la cuenta del desarrollador. Para que otra persona del personal pueda cambiar precios, hay que marcarla como administradora en la tabla «personal» de Supabase (columna «rol» = admin).
