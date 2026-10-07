// Parte pura para conservar la proporción sin ampliar fotos pequeñas.
export function dimensionesImagen(ancho, alto) {
  const escala = Math.min(1, 1600 / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}
export async function reducirImagen(file) {
  if (!file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const imagen = new Image();
    await new Promise((resolver, rechazar) => { imagen.onload = resolver; imagen.onerror = () => rechazar(new Error("No pude abrir la imagen. Prueba con otro archivo.")); imagen.src = url; });
    const { ancho, alto } = dimensionesImagen(imagen.naturalWidth, imagen.naturalHeight);
    const canvas = document.createElement("canvas"); canvas.width = ancho; canvas.height = alto;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, ancho, alto); ctx.drawImage(imagen, 0, 0, ancho, alto);
    const blob = await new Promise((resolver) => canvas.toBlob(resolver, "image/jpeg", 0.8));
    if (!blob) throw new Error("No pude preparar la imagen. Inténtalo de nuevo.");
    return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" });
  } finally { URL.revokeObjectURL(url); }
}
