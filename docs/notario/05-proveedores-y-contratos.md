# 05 · Proveedores, contratos y transferencias internacionales

**Notaría 41 de Quito.** Borrador del 7 de octubre de 2026. Los datos de cada proveedor vienen del informe legal `01-marco-legal.md` (sección 3), consultado el 2026-10-07 en las páginas oficiales de cada uno; cada URL está en el informe. Lo que dice cada contrato **cambia**: hay que descargar la versión vigente el día que la aceptes y archivarla con fecha.

## 1. Qué exige la ley

- **Contrato escrito** con cada encargado, con objeto, duración, naturaleza, finalidad, categoría de datos, titulares y obligaciones (RGLOPDP art. 41; LOPDP art. 34). El encargado debe tratar solo según instrucciones, no usar los datos para otros fines, no comunicarlos a otros y, al terminar, destruirlos o devolverlos (LOPDP art. 34).
- **Subencargados:** se permiten si el contrato lo prevé expresamente; si no, hace falta autorización escrita (RGLOPDP art. 45). Esto concilia en parte el choque con el art. 34 de la ley, que prohíbe comunicar los datos a otros «ni siquiera para su conservación» [NO CONFIRMADO cómo lo lee la SPDP; duda 5].
- **Derecho a auditar** al encargado (RGLOPDP art. 47). **Devolución o eliminación** al terminar (art. 46).
- **Brecha:** el encargado avisa al responsable en máximo **2 días** (LOPDP art. 43).
- **Garantías suficientes:** elegir un encargado sin ellas es infracción leve (LOPDP art. 67 núm. 4); no firmar contratos con encargados, infracción grave (art. 68). Multas: informe 1.14.
- Si el encargado decide fines o medios por su cuenta, se vuelve responsable (RGLOPDP art. 43): importa si un proveedor usara datos para entrenar modelos.
- **Transferencias internacionales** (LOPDP arts. 55 a 61): país con nivel adecuado declarado por la Autoridad (art. 56); garantías adecuadas en un instrumento vinculante (art. 57); normas corporativas vinculantes (art. 58); autorización de la Autoridad (art. 59); o excepciones (art. 60), entre ellas el consentimiento explícito tras informar los riesgos (núm. 2) y la necesidad para medidas precontractuales pedidas por el titular (núm. 4). Garantías válidas según el Reglamento: cláusulas tipo «avaladas por la autoridad de control», entre otras (RGLOPDP art. 74). El acceso del encargado para prestar el servicio «no se considera transferencia» (LOPDP art. 34), y hay discusión sobre si eso exime del régimen internacional cuando el encargado está fuera [NO CONFIRMADO: duda 4]. Hay que registrar las transferencias (RGLOPDP art. 78) y, antes de hacerlas, inscribirlas (LOPDP art. 59 inciso 2).

## 2. Cuadro general

| Proveedor | Para qué se usa | Datos | País | Contrato aplicable | ¿Descargado y archivado? | Pendiente principal |
|---|---|---|---|---|---|---|
| **Anthropic** (API de Claude) | Genera las respuestas del asistente | Texto de mensajes, nombre, número de WhatsApp, citas, descripciones de documentos. **No** archivos | EE. UU. | Commercial Terms (DPA incorporado por referencia) | **No** | Archivar; decidir ZDR; no usar Files API |
| **Supabase** | Base de datos, almacén de documentos, cuentas del personal | Todo | Brasil (sa-east-1) | DPA de Supabase (se acepta con el contrato) | [NO CONFIRMADO] | Descargar copia; subencargados; backups |
| **Vercel** | Alojamiento y funciones del servidor | Todo lo que pasa por el servidor, archivos en tránsito, registros | EE. UU. | DPA de Vercel: **solo planes Pro y Enterprise** | **No** | **Confirmar plan Pro**; sin plazo de 48 h |
| **Meta** (WhatsApp Cloud API) | Canal de WhatsApp | Mensajes, archivos, plantillas con nombre y trámite | EE. UU. y centros de datos de Meta | WhatsApp Business Data Processing Terms + Meta Hosting Terms for Cloud API | [NO CONFIRMADO] | Leer y archivar; informar que Meta ve el contenido en claro |
| **Google** (Sheets y Gmail) | Hoja de contenido público; correo de contacto | Hoja: nada personal. Correo: lo que escriban las personas | EE. UU. | Gmail gratuita: sin DPA | No aplica | Pasar a Workspace |

## 3. Anthropic (EE. UU.)

- **Rol:** encargado. Recibe el texto de la conversación para generar la respuesta.
- **Lo que recibe el modelo (verificado en `api/_lib/asistente.js`):** el texto del cliente, el pie de foto de un archivo, el nombre (el que escribió o el del perfil de WhatsApp), el **número de WhatsApp**, los resultados de las herramientas (citas, descripciones de documentos, notas del personal) y los mensajes del personal en esa sesión. **No recibe imágenes ni PDF.**
- **Contrato:** Commercial Terms vigentes desde el 17-jun-2025; el DPA (vigente desde el 24-feb-2025) está «incorporado por referencia», es decir, se acepta al usar la API; no hay nada que firmar aparte (informe 3.1). Cláusulas tipo de la UE (módulos 2 y 3); subencargados con autorización general y aviso de nuevos con 15 días para objetar; brecha en **48 horas**; devolución o borrado en 30 días; auditoría por informes SOC 2.
- **Sin entrenamiento:** «Anthropic may not train models on Customer Content from Services» (Commercial Terms, secc. B).
- **Retención:** entradas y salidas se borran del sistema en hasta 30 días; excepciones: contenido marcado por infringir la política de uso (hasta 2 años; puntuaciones de seguridad hasta 7 años). Retención cero (ZDR) solo por acuerdo.
- **Seguridad declarada:** AES-256 en reposo, TLS 1.2+, MFA, control de acceso por roles, pentest anual. Certificaciones (SOC 2, ISO 27001, ISO/IEC 42001): [SECUNDARIO/NO CONFIRMADO]; verificar en trust.anthropic.com.
- **Salvaguarda de la transferencia:** cláusulas tipo de la UE. [NO CONFIRMADO] que la SPDP las haya avalado (RGLOPDP art. 74). Alternativa de apoyo: consentimiento explícito informado (LOPDP art. 60 núm. 2), que requiere un texto de consentimiento que mencione EE. UU. (hoy no lo hace).
- **Modelo de respaldo:** el código usa el modelo configurado (`claude-opus-5-5` por defecto) con un **respaldo automático** (`fallbacks: "default"`) ante rechazos. [NO CONFIRMADO] a qué modelo se redirige y si queda cubierto por el mismo contrato y región. Preguntar a Anthropic.
- **Por hacer:** (1) archivar Commercial Terms y DPA con fecha; (2) guardar la lista de subencargados; (3) decidir ZDR [decisión del notario]; (4) **no usar nunca la Files API para cédulas**; (5) mantener que las imágenes no vayan al modelo, y registrar cualquier cambio como decisión del notario.

## 4. Supabase (Brasil)

- **Rol:** encargado. Guarda la base de datos, el almacén privado de documentos y las cuentas del personal.
- **Región:** sa-east-1 (São Paulo), según la configuración del proyecto. [No se puede ver en el código; verifícalo en Project Settings.] Los respaldos y subencargados auxiliares pueden estar en otros países [NO CONFIRMADO].
- **Contrato:** el DPA se incorpora al aceptar el contrato; «acceptance of the Agreement shall have the same effect as signing the SCCs» (secc. 12.2). Brecha en 48 horas «donde sea posible» (secc. 10); 30 días de aviso de nuevos subencargados (secc. 6.3); borrado tras el término con 30 días (secc. 11.2) (informe 3.2).
- **Seguridad declarada:** AES-256 en reposo, TLS 1.2 (Schedule 1). Certificaciones declaradas: SOC 2 Type 2, ISO 27001 (pedir informes en su Trust Center).
- **Estado de configuración que SÍ está en el código:** RLS activado sin políticas; bucket privado; solo la clave de servicio accede. **Que NO está en el código y hay que verificar en el panel de Supabase:** (a) registro público de usuarios desactivado (README, paso 5); (b) MFA en la cuenta de la organización; (c) copias de seguridad y su retención; (d) acceso de quienes administran el proyecto.
- **Salvaguarda de la transferencia a Brasil:** cláusulas tipo del DPA. No se encontró declaración de adecuación para Brasil [NO CONFIRMADO]. Este es el destino donde se guardan las cédulas, por lo que es la transferencia más sensible.
- **Por hacer:** descargar el DPA vigente (y la copia firmada si existe: Dashboard → Organization → Legal documents [NO CONFIRMADO que exista]); suscribirse a los avisos de subencargados; conocer el plazo de copias de seguridad; activar MFA en la organización.

## 5. Vercel (EE. UU.)

- **Rol:** encargado. Ejecuta las funciones que reciben los mensajes, hablan con la IA y con Supabase. Los archivos de WhatsApp **pasan** por Vercel de camino a Supabase. Los registros de ejecución quedan en Vercel.
- **Contrato:** el DPA (actualizado el 17-mar-2026, vigente desde el 31-mar-2026) «forma parte de Vercel Enterprise Terms… u otro acuerdo» y **aplica a los planes Pro y Enterprise** (informe 3.3). **Si el proyecto está en el plan Hobby (gratuito), no hay DPA aplicable.** Además, Hobby es para uso no comercial [NO CONFIRMADO en el informe; verificar en vercel.com/legal/terms]. **PENDIENTE PRINCIPAL: confirmar con el desarrollador qué plan tiene el proyecto; si es Hobby, pasar a Pro antes de seguir tratando datos de clientes.**
- **Brecha:** solo «sin demora indebida», **sin plazo de horas**; no asegura el plazo de 2 días de la LOPDP (art. 43). Es riesgo residual y duda 11 para el abogado. Es difícil negociar un cambio en el plan Pro.
- **Subencargados:** lista en security.vercel.com, 5 días para objetar. **Borrado** al terminar: «dentro de un plazo comercialmente razonable». Ubicación: «principalmente en EE. UU.», pero puede tratar datos en cualquier lugar.
- **Transferencia:** cláusulas tipo de la UE 2021/914 (módulos 1, 2 y 3) y IDTA del Reino Unido (informe 3.3).
- **Certificación:** SOC 2 Type 2 [OFICIAL]; ISO 27001 propia [NO CONFIRMADO].
- **Región de las funciones:** el informe sugiere fijarla cerca de la base de datos (por ejemplo `gru1`, São Paulo) [NO CONFIRMADO]. El código actual no la fija (`vercel.json`).
- **Registros:** el código no escribe el contenido de los mensajes en los registros, solo identificadores y mensajes de error. [NO CONFIRMADO] cuánto tiempo guarda Vercel esos registros en tu plan.
- **Por hacer:** confirmar plan; descargar el DPA vigente; archivar la lista de subencargados; revisar a quién tiene acceso al proyecto y con qué MFA.

## 6. Meta, WhatsApp Business Cloud API (EE. UU. y otros)

- **Rol:** encargado: «Meta, in providing Cloud API service, acts as a data processor… on behalf of the business» (informe 3.4). Se rige por los **WhatsApp Business Data Processing Terms** y los **Meta Hosting Terms for Cloud API**, que se aceptan al configurar la cuenta de WhatsApp Business o la app en Meta for Developers. [No leí el texto de los Data Processing Terms: su contenido es NO CONFIRMADO.]
- **Lo que ve Meta:** el cifrado extremo a extremo llega hasta la Cloud API; esta **descifra** el mensaje y lo reenvía a la notaría. **Meta ve el contenido en claro.** El aviso público debe decirlo. Los mensajes se conservan hasta 30 días.
- **Datos en plantillas:** los avisos al personal, recordatorios y confirmaciones de cita llevan nombre y trámite; viajan por Meta.
- **Publicidad:** Cloud API no usa los mensajes para decidir qué anuncios ve la persona (informe 3.4).
- **Certificaciones:** SOC 2 Type II e ISO 27001 según su Compliance Center.
- **Ubicación:** centros de datos en todo el mundo; existe «Local Storage» en algunos países [NO CONFIRMADO si incluye alguno latinoamericano].
- **Por hacer:** leer y archivar los términos vigentes con fecha; confirmar el plazo de aviso de brechas; registrar en el aviso público que la persona ya acepta además las condiciones de WhatsApp al usar el servicio.
- **Observación sobre el WhatsApp del personal:** los avisos llegan a un número de teléfono del personal (`AVISOS_WHATSAPP`, plantilla `aviso_personal`). Si es un teléfono personal, los datos de clientes quedan allí. Decide una política (teléfono de la notaría, bloqueo, borrado de mensajes).

## 7. Google (Sheets y Gmail)

- **Hoja de contenido:** el servidor y la página leen una hoja publicada con trámites, tarifas y datos de la notaría. Debe tener **cero datos personales de clientes**. Si es así, no hay tratamiento de datos de clientes ni hace falta DPA (informe 3.5, interpretación). Los datos del personal que edita la hoja son sus correos de Google.
- **Gmail de contacto** (notaria41uio@gmail.com): una cuenta de consumo, **sin contrato de encargo**. Ahí llegan solicitudes de derechos y, posiblemente, copias de cédulas. El informe recomienda **Google Workspace** (que sí tiene la Cloud Data Processing Addendum) u otro correo con contrato [no verifiqué el texto del DPA de Google: NO CONFIRMADO].
- **Otros servicios de Google en el sitio:** Google Fonts. Recibe la IP del visitante al cargar las fuentes. Opcional: alojarlas localmente.

## 8. Otros terceros que ven la IP de los visitantes

- **unpkg.com** (íconos), **OpenStreetMap** (mapa de la portada). No son encargados de datos de clientes. La IP se comunica al cargar los recursos. Podrías alojar íconos localmente y sustituir el mapa por un enlace.

## 9. El desarrollador o mantenedor del sistema

Es una persona (o empresa) con acceso a Vercel, Supabase, Meta y Anthropic, y puede ver datos. Es **encargado** o parte del personal: necesita **contrato escrito de confidencialidad y manejo de datos** (LOPDP art. 47.10; falta de contrato: infracción grave, art. 68 núm. 9, informe 4). Hoy [NO CONFIRMADO] que exista. Incluye: acceso con cuentas nominativas y MFA, no usar datos reales para pruebas, devolución de accesos al terminar.

## 10. Lista de verificación para el notario (por proveedor)

| Proveedor | Descargar y archivar con fecha | Verificar | Decidir |
|---|---|---|---|
| Anthropic | Commercial Terms; DPA; lista de subencargados | Modelo de respaldo; certificaciones en Trust Center | ZDR |
| Supabase | DPA (y copia firmada si existe); lista de subencargados | Región; copias de seguridad; registro público de usuarios apagado; MFA | — |
| Vercel | DPA; lista de subencargados | **Plan Pro**; retención de registros; región de funciones | Pasar a Pro |
| Meta | WhatsApp Business Data Processing Terms; Hosting Terms | Quién aceptó los términos en la cuenta; plazo de aviso de brechas | — |
| Google | (Workspace) Cloud Data Processing Addendum | Que la hoja no tenga datos de clientes | Pasar a Workspace |
| Desarrollador | Contrato de confidencialidad firmado | Lista de accesos | — |

## 11. Estado de las transferencias, para el Registro Nacional

| País | Proveedores | Categorías de datos | Finalidad | Mecanismo | Estado |
|---|---|---|---|---|---|
| EE. UU. | Anthropic, Vercel, Meta, Google | Texto de mensajes, nombre, celular, citas; archivos en tránsito (Vercel y Meta); correos | Atención y pre-revisión de trámites | Cláusulas tipo de cada DPA; consentimiento explícito informado como respaldo | Sin archivar contratos; adecuación y aval de cláusulas [NO CONFIRMADO] |
| Brasil | Supabase | Todo, incluidos documentos de identidad | Almacenamiento | Cláusulas tipo del DPA | Igual que arriba |

Para el aviso al ciudadano, la publicación incluye estos países y proveedores (ver `privacidad-nueva-BORRADOR.html`).
