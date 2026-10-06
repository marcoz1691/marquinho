// Conversa con el asistente desde la terminal, sin WhatsApp ni Supabase (usa Claude real: cuesta centavos por mensaje).
// Uso: node scripts/probar-asistente.mjs            (interactivo)
//      node scripts/probar-asistente.mjs "hola" "cuánto cuesta un poder"   (mensajes en orden)
import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { crearAsistente } from "../api/_lib/asistente.js";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { crearContenido } from "../api/_lib/contenido.js";

const almacen = crearAlmacenMemoria();
const whatsapp = { descargarArchivo: async () => ({ bytes: new Uint8Array([0]), mime: "application/pdf" }) };
const asistente = crearAsistente({ claude: new Anthropic(), almacen, whatsapp, contenido: crearContenido(),
  avisar: async (t) => console.log(`\x1b[33m[aviso al personal] ${t}\x1b[0m`) });

let n = 0;
async function enviar(texto) {
  const m = texto.startsWith("/archivo")
    ? { id: "local." + ++n, de: "593990000000", nombre: "Prueba", tipo: "archivo", texto: texto.slice(8).trim(), media: { id: "MEDIA" + n, mime: "application/pdf", nombre: "documento.pdf" } }
    : { id: "local." + ++n, de: "593990000000", nombre: "Prueba", tipo: "texto", texto };
  console.log(`\x1b[36mCliente:\x1b[0m ${texto}`);
  for (const r of await asistente.atender(m)) console.log(`\x1b[32mAsistente:\x1b[0m ${r}\n`);
}

const args = process.argv.slice(2);
if (args.length) { for (const a of args) await enviar(a); }
else {
  console.log("Escribe como cliente. /archivo <leyenda> simula enviar un PDF. Ctrl+C para salir.\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  for (;;) await enviar(await rl.question("> "));
}
