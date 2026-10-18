// Revisión de archivos recibidos por WhatsApp, por la web o por el portal del cliente.

// Tipo real del archivo según sus primeros bytes; el MIME que declara WhatsApp no basta.
export function tipoArchivo(b) {
  const empieza = (...x) => x.every((v, i) => b[i] === v);
  if (empieza(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (empieza(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (empieza(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

// Vercel rechaza pedidos de más de 4,5 MB: 3 MB de archivo son 4 MB en base64, que caben con el resto del JSON.
export const MAX_BYTES = 3 * 1024 * 1024;
export const ERROR_DESCRIPCION = "Describe el documento con entre 2 y 120 caracteres.";

// Una sola línea y sin caracteres de control: la descripción llega tal cual al aviso del personal. null si no sirve.
export function limpiarDescripcion(v) {
  const d = typeof v === "string" ? v.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim() : "";
  return d.length >= 2 && d.length <= 120 ? d : null;
}
export const limpiarNombre = (v) => (typeof v === "string" ? v : "").replace(/[^\w. -]/g, "").slice(0, 120);

// Archivo en base64 subido por la web o por el portal. Devuelve { bytes, tipo } o { error, status }.
export function validarArchivo(base64, { maxBytes = MAX_BYTES } = {}) {
  const invalido = { error: "El archivo no contiene base64 válido.", status: 400 };
  // Buffer.from es permisivo: revisa el alfabeto y el relleno antes de decodificar.
  if (typeof base64 !== "string" || !base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return invalido;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) return invalido;
  if (bytes.length > maxBytes) return { error: "El archivo pesa más de 3 MB. Reduce su tamaño e inténtalo de nuevo.", status: 413 };
  const tipo = tipoArchivo(bytes);
  return tipo ? { bytes, tipo } : { error: "Envía un archivo PDF, JPG, PNG o WEBP.", status: 415 };
}
