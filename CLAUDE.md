@AGENTS.md

## Skills del proyecto

Los procedimientos largos y ocasionales viven en `.claude/skills/`. Para desplegar cambios de base de datos, equipo o textos legales usa el skill `notaria-despliegue`.

Subagente: `despliegue-auditor` (solo lectura, carga el skill de despliegue). Los subagentes no heredan skills: se declaran con `skills:` en `.claude/agents/`.
