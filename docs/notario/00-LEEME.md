# Dossier de protección de datos de la Notaría 41 de Quito

Preparado el 7 de octubre de 2026 para el Dr. Dobri Miguel Albornoz Donoso. Describe el sistema tal como está en el código de la rama `claude/seguridad` (último cambio: `de6bcad`). **No es asesoría legal y no afirma que la notaría «cumpla» la ley**: dice qué hace el sistema, qué norma se aplica y qué falta. Un abogado ecuatoriano debe revisarlo antes de que lo firmes.

## Cómo leer las marcas

- **LOPDP** = Ley Orgánica de Protección de Datos Personales (RO Suplemento 459, 26-may-2021). **RGLOPDP** = su Reglamento General (Decreto Ejecutivo 904, 13-nov-2023). Los artículos citados están transcritos del informe legal `01-marco-legal.md` y comprobados contra los textos oficiales extraídos.
- **[NO CONFIRMADO]** = no se pudo verificar en la fuente primaria o depende de una configuración que no está en el código. Cada una está en `06-dudas-para-el-abogado.md`.
- **[Verificado en el código]** = lo comprobé leyendo el archivo indicado, no por suposición.
- **[Decisión del notario]** = hay una cifra o una elección que solo tú puedes tomar. Donde puse un número, es la propuesta del informe o el valor actual del sistema, no una exigencia legal.

## Qué es cada documento

| Archivo | Para qué sirve | Quién lo usa |
|---|---|---|
| `01-registro-de-actividades-de-tratamiento.md` | Inventario de qué datos tratas, para qué, con qué base legal, quién los recibe, dónde y cuánto tiempo (RGLOPDP arts. 38 y 39). Es la base de todo lo demás. | Notario, abogado, SPDP si lo pide |
| `02-evaluacion-de-impacto.md` | Los riesgos reales (cédulas, IA, transferencias, celular no verificado), qué los reduce hoy y qué riesgo queda. | Notario, abogado |
| `03-plan-de-respuesta-a-incidentes.md` | Qué hacer, en qué plazo y quién, si alguien accede a datos sin permiso. Incluye plantillas de aviso. | Notario, responsable interno, desarrollador |
| `04-politica-de-retencion-y-derechos.md` | Cuánto se guarda cada dato, cómo se borra y cómo atender, en 15 días, a quien pida ver, corregir o borrar sus datos. | Personal de la notaría |
| `05-proveedores-y-contratos.md` | Anthropic, Supabase, Vercel, Meta y Google: qué contrato aplica, qué falta y qué salvaguarda hay para los datos que salen del Ecuador. | Notario, abogado |
| `06-dudas-para-el-abogado.md` | Preguntas jurídicas abiertas, por prioridad, y los pendientes técnicos que salieron al revisar. | Abogado |
| `privacidad-nueva-BORRADOR.html` | Borrador del aviso de privacidad público que reemplazaría a `privacidad.html`. | Notario, abogado, desarrollador |

## Lo que debe firmar o decidir el notario

Tomado de la sección «Lo que debe firmar o decidir el notario» del informe legal, con el estado actual del sistema al lado.

| # | Decisión o firma | Estado hoy en el sistema |
|---|---|---|
| 1 | **Plazos de conservación.** El informe propone borrar cédulas entre 30 y 90 días tras la cita o el trámite, y conversaciones entre 6 y 12 meses. | El sistema borra **conversaciones y documentos juntos a los 90 días sin actividad** (valor por defecto; se puede cambiar con la variable `RETENCION_DIAS`, con mínimo de 30). No distingue cédulas de conversaciones. Debes confirmar si 90 días te sirve para todo. Ver documento 04. |
| 2 | **Aprobar el aviso de privacidad** y el **texto del consentimiento explícito** para las cédulas y la transferencia internacional. | El borrador está en `privacidad-nueva-BORRADOR.html`. El texto de consentimiento que usa hoy el asistente es corto y **no menciona** la IA, EE. UU., Brasil ni el plazo. Hay que cambiarlo (ver documento 06, pendientes técnicos). |
| 3 | **Aceptar o descargar los contratos de encargo (DPA)** de Anthropic, Supabase, Vercel y Meta, y confirmar el **plan Pro de Vercel**. | Pendiente. Ver documento 05. El DPA de Vercel solo cubre planes Pro y Enterprise. |
| 4 | **Firmar acuerdos de confidencialidad** con cada empleado y con el desarrollador (LOPDP art. 47.10). | Pendiente. No hay modelo en este dossier. |
| 5 | **Inscribir los tratamientos en el Registro Nacional** de la SPDP (LOPDP art. 51; RGLOPDP art. 86: 10 días desde el inicio del tratamiento). | Pendiente. [NO CONFIRMADO] si la plataforma está operativa. |
| 6 | **Decidir si las imágenes de cédulas van al modelo de IA.** El informe recomienda revisión humana sin IA. | **Hoy no van.** [Verificado en el código: `api/_lib/asistente.js`, función `textoUsuario` y `llamar`.] Al modelo solo llega un texto como «El cliente envió un archivo: nombre, tipo, id» y el pie de foto que haya escrito el cliente. Solo debes confirmar que esa es tu decisión y que no se cambiará sin tu autorización. |
| 7 | **Decidir si pides retención cero (ZDR) a Anthropic.** | Pendiente de decisión. Sin ZDR, Anthropic borra entradas y salidas en un plazo de hasta 30 días (informe 3.1). |
| 8 | **Designar un responsable interno de privacidad** y un contacto para incidentes. | Pendiente. El Oficio SPDP-IRD-2025-0017-O dice que la notaría individual no está obligada a tener Delegado de Protección de Datos (informe 1.16). Designar un responsable interno es voluntario. |
| 9 | **Cambiar el correo de contacto** a uno con contrato de encargo (Google Workspace u otro). | Hoy es `notaria41uio@gmail.com`, una cuenta gratuita (`data/notaria.json`). Ver documento 05. |
| 10 | **Aprobar la política interna** y el procedimiento de incidentes. | Borradores: documentos 03 y 04. |
| 11 | **Decidir si haces una consulta formal a la SPDP** (EIPD o DPD) para tener un criterio propio (RGLOPDP arts. 31 y 53). | Pendiente. |

## Orden sugerido

1. **Lee el documento 01** (registro): es el mapa. Si algo no coincide con cómo trabaja tu notaría, corrígelo primero.
2. **Decide los plazos** (documento 04, sección «Lo que debes decidir») y el punto 6 de arriba.
3. **Lee el documento 02** (riesgos) y marca los que no aceptas.
4. **Manda 05 y 06 al abogado** para que los resuelva en una sola reunión. Pídele que valide también la lista de la sección anterior.
5. **Revisa el aviso público** (`privacidad-nueva-BORRADOR.html`) con el abogado. No se publica hasta que ambos lo aprueben, y hay que cambiar a la vez el texto del consentimiento y la versión del aviso en el código.
6. **Entrega el documento 03** al responsable interno y al desarrollador y haz un simulacro corto.
7. **Firma**: acuerdos de confidencialidad, aprobación de la política y, cuando corresponda, la inscripción en el Registro Nacional. Guarda todo con fecha en una carpeta de cumplimiento (lista de 14 documentos en el informe, sección 4).

## Lo que este dossier no cubre

- El **protocolo notarial** (escrituras y libros) y la plataforma electrónica del Consejo de la Judicatura: se rigen por la Ley Notarial (arts. 18.1 y 22) y no pasan por este sistema. El asistente de chat y WhatsApp **no es un canal notarial oficial**: es atención y preparación de trámites.
- Los equipos y teléfonos del personal, el correo y el archivo físico de la notaría. Recomiendo un inventario aparte.
- Cualquier configuración que está fuera del código (por ejemplo, si el registro de nuevos usuarios de Supabase está desactivado, qué plan tiene Vercel o qué variables están cargadas). Esas se marcan [NO CONFIRMADO] y hay que revisarlas en cada panel.
