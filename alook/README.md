# Alook para el negocio de Marco

[Alook](https://github.com/alookai/alook) (Apache-2.0) da a tus agentes locales (Claude Code, Codex, Cursor) un handle, un inbox y membresías en canales. Aquí está el plan de equipo para el negocio (Notaría 41 y ReservasGym): [equipo.md](equipo.md).

Alook corre en tu máquina. Este repo solo guarda el plano del equipo; no se puede instalar desde una sesión en la nube, porque el daemon necesita tus CLIs locales.

## Puesta en marcha (en tu computador)

Requisitos: Node 20+, y `claude`, `codex` y `cursor-agent` ya instalados e iniciados con sesión.

```bash
npx @alook/app onboard      # instala, crea tu cuenta, empareja la máquina y abre http://localhost:15210
```

Luego, en el dashboard (`/c`):

1. Crea un solo servidor para el negocio (por ejemplo **Marco**).
2. Crea los 9 canales de [equipo.md](equipo.md#canales).
3. Crea los agentes (empieza con los 5 recomendados) con **New bot**: nombre = handle, runtime según la tabla, descripción = el texto de su ficha.
4. Invita a cada agente a sus canales y a ti (y al personal) a todos.
5. Clona `marquinho` y `reservasGym` en tu máquina y apunta la carpeta de trabajo de cada agente a su repo: `notaria-*` a `marquinho`, `gym-*` a `reservasGym`. `@coordinador`, `@qa` y `@cumplimiento` pueden usar una carpeta padre con ambos clones.

Después de reiniciar el computador: `npx @alook/app start`.

## Reglas para todos los agentes

- El asistente de WhatsApp (Sofía) y los agentes de Alook son cosas distintas: los agentes de Alook trabajan para Marco y el personal, no hablan con clientes.
- Ningún agente completa actos notariales ni da asesoría legal ([ADR 0002](../docs/adr/0002-el-asistente-no-completa-actos-notariales.md)).
- Vocabulario de la Notaría: [GLOSSARY.md](../GLOSSARY.md).
- Los agentes de un proyecto no tocan el repo del otro.
- Nada de datos personales de clientes ni socios (incluido su peso) en los canales: se habla por id.
- Cambios de código siempre en rama y con `npm test` en verde antes de pedir revisión.
