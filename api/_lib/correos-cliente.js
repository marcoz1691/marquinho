// Plantillas de los correos al cliente del portal. Español de Ecuador, de tú, con estilos en línea (los clientes de
// correo ignoran las hojas de estilo) y sin imágenes externas salvo el logotipo opcional por https.
const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function correoCodigo({ codigo, notaria, logo = "" }) {
  const nombre = (typeof notaria === "string" ? notaria : notaria?.nombre) || "la notaría";
  const asunto = `Tu código para entrar a Mis trámites · ${nombre}`;
  const texto = [
    "Hola:",
    "",
    `Tu código para entrar a «Mis trámites» de ${nombre} es:`,
    "",
    codigo,
    "",
    "Vence en 10 minutos. No lo compartas con nadie: el personal de la notaría nunca te lo pedirá.",
    "",
    "Si no pediste este código, ignora este correo: nadie puede entrar a tu cuenta sin él.",
    "",
    nombre
  ].join("\n");
  const imagen = /^https:\/\/[^\s"'<>]+$/.test(logo) ? `<img src="${escapar(logo)}" alt="${escapar(nombre)}" height="48" style="display:block;margin:0 0 16px;border:0;height:48px;width:auto">` : "";
  const html = `<!doctype html><html lang="es-EC"><body style="margin:0;padding:24px;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#1f2a2e">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e3ded3;border-radius:12px;padding:28px">
${imagen}<p style="margin:0 0 4px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6b6457">${escapar(nombre)}</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1f2a2e">Tu código para entrar a Mis trámites</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">Escribe este código en la página donde lo pediste:</p>
<p style="margin:0 0 20px;font-size:32px;font-weight:bold;letter-spacing:.3em;font-family:'Courier New',monospace;color:#1f2a2e">${escapar(codigo)}</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5">Vence en 10 minutos. No lo compartas con nadie: el personal de la notaría nunca te lo pedirá.</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#6b6457">Si no pediste este código, ignora este correo: nadie puede entrar a tu cuenta sin él.</p>
</div></body></html>`;
  return { asunto, texto, html };
}
