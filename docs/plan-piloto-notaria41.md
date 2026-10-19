# Plan maestro: Sofía PreFirma y piloto de Notaría 41

Estado del plan: **Fase 0 en ejecución**
Producto: **Sofía PreFirma**  
Primer tenant: **Notaría 41 de Quito**

## 1. Objetivo

Validar Sofía PreFirma con personas y trámites reales de la Notaría 41 sin convertir el piloto en una variante separada del producto. Todo lo que se construya para el piloto debe pertenecer al repositorio y a la arquitectura de Sofía PreFirma; las diferencias de cada notaría deben quedar en configuración y datos aislados.

El piloto se abrirá por etapas. Una función solo avanza cuando supera su puerta de seguridad, operación y calidad. Incorporar una segunda notaría y cobrar trámites son hitos posteriores, no requisitos para iniciar el piloto controlado.

## 2. Decisiones de arquitectura

### Un producto, tres despliegues con responsabilidades distintas

| Proyecto Vercel | Dominio | Responsabilidad |
|---|---|---|
| `sofiaprefirma` | `sofiaprefirma.com`, `www.sofiaprefirma.com` | Presentación comercial de la plataforma |
| `sofiaprefirma-notaria41` | `notaria41.sofiaprefirma.com` | Aplicación piloto con `NOTARIA_ID=notaria41` |
| `notaria41` | dominio institucional de la notaría | Web oficial existente; enlaza al piloto, pero no recibe despliegues del producto |

Los tres proyectos pueden salir del mismo repositorio durante la transición, pero cada checkout de despliegue debe verificar el `projectId` esperado antes de publicar. Nunca se despliega desde el checkout principal mientras `.vercel/project.json` apunte a `notaria41`.

### Un solo repositorio de producto

- Crear `marcoz1691/sofia-prefirma` como repositorio independiente.
- Llevar `claude/portal-base` y sus cambios pendientes a ese repositorio.
- Mantener `.shots.mjs`, `inmobiliaria/`, secretos y artefactos locales fuera del repositorio.
- Proteger la rama principal, exigir pruebas y usar previews antes de producción.
- Notaría 41 consume versiones del producto; no mantiene un fork funcional propio.

### Dos niveles de madurez

1. **Piloto mononotaría aislado:** proyecto y host exclusivos, tenant fijado en servidor y base usada solo por Notaría 41.
2. **Multinotaría real:** todas las consultas, archivos, configuraciones, usuarios, crones, canales y pagos están aislados por tenant y probados con dos notarías simultáneas.

El nivel 1 puede iniciar antes. El nivel 2 es obligatorio antes de incorporar una segunda notaría.

## 3. Estado actual comprobado

### Ya disponible

- Cuenta del cliente mediante código por correo, sin contraseña.
- Cookie de sesión `__Host-`, `HttpOnly`, `Secure` y `SameSite=Strict`.
- Código con HMAC, vencimiento, límite de intentos y consumo atómico.
- Vínculo de trámite con token aleatorio de un solo uso; el ticket no es credencial.
- El token de vínculo viaja en el fragmento de URL y se retira antes de hacer solicitudes.
- Portal filtrado por `notaria_id` y `cliente_id`.
- Separación entre nota interna y observación visible para el cliente.
- Cálculo de pagos en servidor, idempotencia y webhook firmado como base técnica.
- Interruptores `portal`, `documentos` y `pagosEnLinea`; portal y pagos nacen apagados.
- Migración de cuentas, sesiones, vínculos, eventos y pagos preparada en `supabase/esquema.sql`.
- 567 pruebas unitarias y 213 pruebas E2E aprobadas con la barrera de despliegue.
- `sofiaprefirma.com` y `www.sofiaprefirma.com` sirven la portada comercial desde el proyecto `sofiaprefirma`, sin autenticación de Vercel.
- Proyecto aislado `sofiaprefirma-notaria41` creado con `projectId` `prj_upo2XAFcjMVTjEVgp9tE2l8ECukg`.
- Deployment de preparación del piloto creado sin dominio, Supabase ni datos reales; permanece protegido por Vercel Authentication.
- `NOTARIA_ID=notaria41` está fijado en producción y previews del piloto; sus definiciones de cron están vacías hasta el corte operativo.
- Sin Supabase, las funciones de producción fallan cerradas y no recurren al almacén temporal en memoria.

### Bloqueos actuales

- El checkout principal continúa vinculado en `.vercel/project.json` a `notaria41`.
- El remoto Git sigue siendo `marcoz1691/marquinho.git`; falta el repositorio independiente.
- GitHub CLI no tiene una sesión autenticada, por lo que aún no se puede crear ni proteger el repositorio independiente desde este entorno.
- `.shots.mjs` y el repositorio anidado y vacío `inmobiliaria/` siguen ajenos y sin seguimiento; no deben incluirse.
- El núcleo histórico —panel, conversaciones, citas y documentos— todavía tiene consultas globales.
- Precios, ajustes, interruptores, contenido, métricas, auditoría y algunos límites siguen siendo globales.
- Los archivos no tienen cuarentena ni análisis antimalware.
- No existe una pasarela real ni interfaz de pago lista para producción.

## 4. Fases y puertas de avance

### Fase 0 — Recuperar separación, dominio y despliegues

Prioridad: **crítica**.

- [x] Guardar los cambios pendientes de dominio e iconos sin incluir archivos ajenos.
- [x] Repetir pruebas unitarias y E2E desde el SHA que se publicará.
- [ ] Crear y autenticar el repositorio `sofia-prefirma`.
- [ ] Subir la rama y proteger la rama principal.
- [x] Crear o confirmar los proyectos `sofiaprefirma` y `sofiaprefirma-notaria41`.
- [x] Añadir una verificación previa al despliegue que compare nombre y `projectId` esperados.
- [x] Confirmar el dominio `.vercel.app` real de cada proyecto; no codificar un alias histórico como si fuera estable.
- [x] Desplegar primero sin mover dominios; el primer deployment del proyecto piloto quedó protegido y sin dominio personalizado.
- [x] Validar portada y cabeceras CSP en los deployments aislados.
- [x] Mover `sofiaprefirma.com` y `www` únicamente al proyecto comercial.
- [ ] Asociar `notaria41.sofiaprefirma.com` únicamente al proyecto piloto.
- [ ] Verificar DNS, HTTPS, certificado, redirección de `www` y contenido de cada host. Comercial completado; falta el host del piloto.
- [ ] Documentar cómo volver al deployment anterior y conservar su URL.

**Puerta G0:** cada dominio muestra su proyecto esperado; desplegar Sofía no modifica la web institucional; existe rollback comprobado.

### Fase 1 — Infraestructura del piloto

Prioridad: **crítica**.

- [ ] Crear un respaldo verificable de Supabase antes de migrar.
- [ ] Registrar cada bloque SQL aplicado y su fecha; no ejecutar migraciones a ciegas.
- [ ] Aplicar, en orden, métricas y perfil notario del 2026-10-11, consentimientos del 2026-10-16 y portal del 2026-10-18.
- [ ] Configurar en el proyecto piloto: Supabase, `NOTARIA_ID=notaria41`, `CUENTA_SECRETO`, Resend, remitente, `SITIO_URL`, retención, MFA y secretos de cron.
- [ ] Exigir un `CUENTA_SECRETO` aleatorio de al menos 32 bytes y documentar su rotación.
- [ ] Verificar `sofiaprefirma.com` en Resend y probar entrega, demora y carpeta de spam.
- [ ] Permitir la URL exacta del panel piloto en Supabase Auth.
- [ ] Confirmar que producción nunca usa el almacén en memoria.
- [ ] Mantener `portal=0`, `documentos=0` y `pagosEnLinea=0` durante la preparación.
- [ ] Mantener un solo backend dueño del webhook de WhatsApp y de los crones; no copiar credenciales operativas a dos proyectos activos.
- [ ] Planificar el corte de Meta y crones como una sola operación: activar el proyecto piloto y retirar secretos operativos del proyecto anterior.
- [ ] Añadir alertas de errores de funciones, correo, crones y almacenamiento sin registrar datos personales.

**Puerta G1:** base persistente respaldada, correo operativo, secretos solo en Vercel, crones autenticados y funciones todavía apagadas.

### Fase 2 — Seguridad mínima antes del piloto interno

Prioridad: **crítica/alta**.

- [ ] Usar el proyecto dedicado del piloto con `NOTARIA_ID=notaria41`.
- [ ] Hacer que APIs de marketing, previews y hosts desconocidos fallen cerradas; nunca deben caer por defecto en Notaría 41.
- [ ] Propagar el tenant desde la entrada hasta creación de conversación, cita, evento y vínculo.
- [ ] Añadir `notariaId` obligatorio al panel, agenda y documentos, no solo al portal.
- [ ] Comprobar tenant y autorización antes de generar una URL firmada de documento.
- [ ] Añadir pruebas de que notas internas nunca llegan a portal, correo o WhatsApp.
- [ ] Validar la IP proporcionada por Vercel y usar HMAC secreto para las huellas y límites.
- [ ] Tenantizar las cuotas de OTP y vinculación.
- [ ] Endurecer solicitudes mutables con origen exacto y señales `Sec-Fetch-Site` cuando estén presentes.
- [ ] Ejecutar `npm audit`, revisar dependencias y comprobar cabeceras en el deployment real.
- [ ] Mantener pagos apagados.
- [ ] Mantener documentos apagados hasta completar la siguiente fase.

**Puerta G2:** ninguna ruta de cuenta, panel, cita o documento puede cambiar de tenant mediante cuerpo, query, host falso o cabecera reenviada.

### Fase 3 — Documentos seguros

Prioridad: **alta**; bloquea documentos reales.

- [ ] Guardar cada objeto bajo `<notaria_id>/<conversacion_id>/...`.
- [ ] Subir primero a cuarentena.
- [ ] Integrar análisis antimalware y, para PDF, sanitización/CDR cuando corresponda.
- [ ] No mostrar ni firmar archivos hasta que el resultado sea limpio.
- [ ] Tratar infección, error y timeout como no disponibles para el personal.
- [ ] Servir descargas como adjunto o desde un origen aislado.
- [ ] Eliminar el objeto si falla la creación del registro en base.
- [ ] Registrar auditoría de apertura sin guardar URL firmada ni contenido.
- [ ] Probar archivo limpio, infectado, tipo falso, archivo grande, timeout, huérfano y acceso cruzado.

**Puerta G3:** cero acceso antes del análisis, cero lectura cruzada y recuperación documentada ante fallo del escáner.

### Fase 4 — Piloto interno con datos ficticios

Duración sugerida: 3 a 5 días laborables.

Activar `portal=1`; activar `documentos=1` solo después de G3; mantener `pagosEnLinea=0`.

Ejecutar con cinco clientes ficticios:

1. Solicitar una cita desde web y asistente.
2. Recibir y abrir el vínculo de un solo uso.
3. Crear cuenta con código de correo.
4. Completar perfil y consentimientos separados.
5. Consultar estado, requisitos y siguiente paso.
6. Confirmar y rechazar citas desde el panel.
7. Enviar, aprobar y observar un documento.
8. Ver la observación pública y comprobar que la nota interna nunca aparece.
9. Probar cierre de una sesión y de todos los dispositivos.
10. Repetir en móvil, escritorio y una conexión interrumpida.
11. Apagar cada interruptor y confirmar degradación segura.

Pruebas negativas obligatorias:

- Cliente A intenta abrir trámite, documento y pago de B.
- Un ticket se usa como credencial.
- Un vínculo usado, vencido o de otra notaría se reutiliza.
- Una cookie se presenta en otro subdominio.
- Se altera `notaria`, `cliente`, monto o estado desde el navegador.
- Se envía un documento con MIME/extensión falsa.
- Se fuerza Origin ausente, `null` o ajeno.

**Puerta G4:** cero exposición de datos, cero pérdida de citas/documentos, todos los recorridos aprobados y rollback por interruptor verificado.

### Fase 5 — Piloto real limitado

Duración inicial: **dos semanas**, con **10–20 citas reales**.

- [ ] Nombrar responsable operativo de la notaría y contacto técnico.
- [ ] Capacitar al notario y al personal con un ejercicio completo.
- [ ] Entregar procedimiento de incidentes y canal de soporte.
- [ ] Empezar con cuenta, citas y seguimiento; añadir documentos solo tras G3.
- [ ] Revisar errores y métricas diariamente durante la primera semana.
- [ ] Recoger retroalimentación breve del cliente y del personal.
- [ ] No activar pagos durante esta fase.

Métricas mínimas:

| Área | Métrica |
|---|---|
| Adopción | citas invitadas y porcentaje de vínculos consumidos |
| Acceso | códigos solicitados, entregados, verificados y tiempo de entrega |
| Operación | tiempo hasta confirmación de cita y revisión de documento |
| Calidad | errores por recorrido, reintentos y solicitudes de soporte |
| Resultado | documentos preparados antes de la cita e inasistencias |
| Seguridad | accesos denegados, intentos limitados e incidentes confirmados |
| Experiencia | satisfacción del cliente y del personal |

**Puerta G5:** cero incidentes críticos, cero pérdida de datos, personal capaz de operar sin ayuda continua y evidencia suficiente para decidir mejoras.

### Fase 6 — Multinotaría real antes del segundo cliente

Prioridad: obligatoria antes de incorporar otra notaría.

- [ ] Crear un `TenantContext` derivado de una relación dominio→tenant registrada.
- [ ] Exigir el contexto en API, panel, almacén, contenido, crones, WhatsApp y pagos.
- [ ] Eliminar el fallback de hosts desconocidos a `notaria41`.
- [ ] Tenantizar `precios`, `ajustes`, interruptores, métricas, auditoría, uso, consentimientos y procesados.
- [ ] Cambiar restricciones a `(notaria_id, telefono)`, `(notaria_id, fecha, codigo)`, `(notaria_id, tramite_id)` y equivalentes.
- [ ] Crear membresías de personal por notaría; no usar correo como identidad global del tenant.
- [ ] Añadir `notaria_id` a documentos y relaciones que hoy lo heredan implícitamente.
- [ ] Incorporar claves foráneas compuestas que impidan relacionar filas de notarías distintas.
- [ ] Separar marca, catálogo, horarios, contactos, WhatsApp, correo, sales y configuración de pagos.
- [ ] Reemplazar singletons y cachés globales por servicios/cachés por tenant.
- [ ] Hacer que los crones recorran tenants con bloqueo e idempotencia.
- [ ] Crear una “Notaría Demo” y probar dos tenants con el mismo correo, celular y ticket.
- [ ] Ejecutar la matriz de aislamiento contra Supabase real, no solo el almacén de memoria.

**Puerta G6:** dos tenants simultáneos no comparten usuarios, datos, archivos, configuración, canales, métricas, caché ni webhooks.

### Fase 7 — Pagos reales

Prioridad: posterior al piloto funcional.

- [ ] Elegir una pasarela que opere legalmente en Ecuador y use checkout alojado.
- [ ] Tenantizar tarifas, IVA, interruptores, credenciales y comercio.
- [ ] Implementar adaptador real; Sofía nunca recibe datos de tarjeta.
- [ ] Validar timestamp y replay del webhook según el proveedor.
- [ ] Procesar en una transacción/RPC: reclamar evento, conciliar, transicionar y auditar.
- [ ] No guardar una fila por cada firma inválida; usar límite/WAF y métrica agregada.
- [ ] Añadir conciliación periódica para webhooks perdidos.
- [ ] Definir comprobantes, cancelación, devolución y responsabilidad contable.
- [ ] Versionar términos, privacidad y política de reembolsos antes de cobrar.
- [ ] Probar sandbox, duplicados, concurrencia, monto distinto, evento atrasado y devolución.
- [ ] Activar solo trámites de monto determinístico y mediante lista controlada.

**Puerta G7:** un trámite no puede cobrarse dos veces, el navegador no cambia estados y cada pago se concilia y audita dentro de su tenant.

## 5. Estrategia de pruebas

Cada cambio debe pasar:

1. Pruebas unitarias y de contrato.
2. Integración con Supabase efímero o dedicado a QA.
3. E2E de escritorio y móvil.
4. Matriz de aislamiento con tenants A y B.
5. Revisión de dependencias, CSP, HTTPS, cookies y cabeceras reales.
6. Auditoría de accesibilidad, SEO, mejores prácticas y rendimiento sobre URLs desplegadas.
7. Recorrido manual del personal y del cliente.

Un puntaje de Lighthouse no demuestra seguridad. Los resultados automáticos se acompañarán de pruebas de autorización, aislamiento y operación.

## 6. Despliegue y reversión

Antes de cada despliegue:

- árbol limpio y SHA identificado;
- proyecto Vercel y `projectId` verificados;
- variables requeridas presentes sin imprimir secretos;
- migraciones compatibles aplicadas y respaldo disponible;
- pruebas aprobadas;
- preview validado;
- interruptores nuevos apagados.

Reversión:

1. Apagar la función afectada desde el panel.
2. Promover el deployment anterior de Vercel.
3. Si el dominio quedó mal asociado, devolverlo al proyecto correcto según la tabla de arquitectura.
4. No revertir una migración destructiva sin restauración probada; usar migraciones hacia adelante.
5. Registrar incidente, alcance, usuarios afectados y rotación de secretos si aplica.

## 7. Orden de ejecución inmediato

1. Completar Fase 0 y recuperar los dominios.
2. Crear el proyecto aislado `sofiaprefirma-notaria41`.
3. Completar Fase 1 con funciones apagadas.
4. Corregir los puntos críticos de tenant de Fase 2.
5. Ejecutar el piloto interno sin pagos y sin documentos reales.
6. Implementar seguridad de documentos y repetir el piloto interno.
7. Abrir el piloto real limitado.
8. Completar Fase 6 antes de una segunda notaría.
9. Considerar pagos reales únicamente después de estabilizar el producto.

## 8. Definición de terminado

El piloto de Notaría 41 estará terminado cuando:

- sus dominios y despliegues estén separados del sitio comercial e institucional;
- el personal complete los recorridos sin asistencia técnica continua;
- cuentas, citas, observaciones y documentos funcionen con autorización comprobada;
- no existan incidentes críticos ni pérdida de datos durante el periodo acordado;
- las métricas y comentarios produzcan un backlog priorizado;
- se haya ejercitado rollback e incidente;
- pagos continúen apagados salvo que G7 se complete.

Sofía PreFirma estará lista para venderse como multinotaría cuando, además, supere G6 con dos tenants simultáneos en una base real.
