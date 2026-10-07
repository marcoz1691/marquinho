// Revisión de archivos recibidos por WhatsApp o por la web.

// Tipo real del archivo según sus primeros bytes; el MIME que declara WhatsApp no basta.
export function tipoArchivo(b) {
  const empieza = (...x) => x.every((v, i) => b[i] === v);
  if (empieza(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (empieza(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (empieza(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}
