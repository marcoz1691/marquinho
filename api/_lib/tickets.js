// Ticket de una cita: 4 dígitos para que la persona lo diga en la notaría. Es una referencia, no una credencial:
// por sí solo no autoriza nada (GLOSSARY.md). Se genera con azar criptográfico; el generador se inyecta en las pruebas.
import { randomInt } from "node:crypto";
export const nuevoCodigo = (azar = randomInt) => String(azar(1000, 10000));
