import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DESTINOS_VERCEL = Object.freeze({
  comercial: Object.freeze({
    projectName: "sofiaprefirma",
    projectId: "prj_MJWXidhzCEkrzFMOdKi61GSfSjPj",
  }),
  piloto: Object.freeze({
    projectName: "sofiaprefirma-notaria41",
    projectId: "prj_upo2XAFcjMVTjEVgp9tE2l8ECukg",
  }),
});

export function validarProyectoVercel(destino, vinculo) {
  const esperado = DESTINOS_VERCEL[destino];
  if (!esperado) {
    throw new Error(`Destino desconocido: ${destino || "(vacío)"}. Usa comercial o piloto.`);
  }

  if (!vinculo || typeof vinculo !== "object") {
    throw new Error("No se pudo leer .vercel/project.json.");
  }

  if (vinculo.projectId !== esperado.projectId || vinculo.projectName !== esperado.projectName) {
    throw new Error(
      `Despliegue bloqueado: este checkout apunta a ${vinculo.projectName || "un proyecto desconocido"} `
      + `(projectId: ${vinculo.projectId || "ausente"}), pero el destino ${destino} exige `
      + `${esperado.projectName} (projectId: ${esperado.projectId}).`,
    );
  }

  return esperado;
}

async function ejecutar() {
  const destino = process.argv[2];
  let vinculo;
  try {
    vinculo = JSON.parse(await readFile(resolve(".vercel/project.json"), "utf8"));
  } catch {
    throw new Error("Despliegue bloqueado: falta un .vercel/project.json válido. Ejecuta vercel link en un checkout de despliegue aislado.");
  }

  const esperado = validarProyectoVercel(destino, vinculo);
  console.log(`Proyecto verificado: ${esperado.projectName} (${esperado.projectId}).`);
}

const invocadoDirectamente = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invocadoDirectamente) {
  ejecutar().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
