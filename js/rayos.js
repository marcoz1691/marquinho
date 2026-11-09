// Rayos de luz que unen cada paso de Sofía con su mensaje en el chat de ejemplo (sección de WhatsApp).
// Es una versión sin dependencias de «Pulse Beams»: el sitio no usa React, Tailwind ni un build. Solo se dibujan
// con dos columnas; en el celular, con los pasos sobre el chat, no hay nada que unir.
const NS = "http://www.w3.org/2000/svg";
const HUECO_MINIMO = 24, SEPARACION = 8;
// Mensajes del chat de ejemplo a los que llega cada paso: «Tú» escribe, Sofía pide los documentos y confirma la cita.
const MENSAJES = [0, 1, 3];

// Curva suave de un punto a otro: sale y entra en horizontal, como un cable.
export function trazo(x0, y0, x1, y1) {
  const m = (x1 - x0) / 2, f = (n) => +n.toFixed(1);
  return `M${f(x0)} ${f(y0)}C${f(x0 + m)} ${f(y0)} ${f(x1 - m)} ${f(y1)} ${f(x1)} ${f(y1)}`;
}

// Posición de un elemento dentro de la raíz, sumando los offsets: no cambia con los transform de la animación de entrada.
function posicion(el, raiz) {
  let x = 0, y = 0;
  for (let e = el; e && e !== raiz; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  return { x, y };
}

const nodo = (nombre, atributos) => {
  const el = document.createElementNS(NS, nombre);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  return el;
};

export function dibujarRayos(wa) {
  wa.querySelector(".rayos")?.remove();
  const lista = wa.querySelector(".wa-pasos"), chat = wa.querySelector(".wa-tel");
  const pasos = [...wa.querySelectorAll(".wa-pasos > li")], mensajes = [...wa.querySelectorAll(".wa-burbuja")];
  if (!lista || !chat || !pasos.length) return;
  const x0 = lista.offsetLeft + lista.offsetWidth, borde = posicion(chat, wa).x;
  if (borde - x0 < HUECO_MINIMO) return;
  // El punto final queda junto a la tarjeta, no detrás de ella.
  const x1 = borde - SEPARACION;

  const svg = nodo("svg", { class: "rayos", width: wa.offsetWidth, height: wa.offsetHeight, viewBox: `0 0 ${wa.offsetWidth} ${wa.offsetHeight}`, "aria-hidden": "true", focusable: "false" });
  pasos.forEach((paso, i) => {
    const numero = paso.querySelector(":scope > span") || paso, destino = mensajes[MENSAJES[i]] || mensajes[i];
    if (!destino) return;
    const y0 = posicion(numero, wa).y + numero.offsetHeight / 2, y1 = posicion(destino, wa).y + destino.offsetHeight / 2;
    const d = trazo(x0, y0, x1, y1);
    svg.append(
      nodo("path", { class: "rayo__base", d }),
      nodo("path", { class: "rayo__pulso", d, pathLength: 100, style: `animation-delay:${(i * 0.7).toFixed(1)}s` }),
      nodo("circle", { class: "rayo__punto", cx: x0, cy: y0, r: 5 }),
      nodo("circle", { class: "rayo__punto", cx: x1, cy: y1, r: 5 })
    );
  });
  wa.prepend(svg);
}

function iniciar(wa) {
  let tramite = 0;
  // Varios cambios seguidos (fuentes, tamaño, imágenes) se dibujan una sola vez.
  const redibujar = () => { cancelAnimationFrame(tramite); tramite = requestAnimationFrame(() => dibujarRayos(wa)); };
  dibujarRayos(wa);
  if ("ResizeObserver" in window) new ResizeObserver(redibujar).observe(wa);
  window.addEventListener("resize", redibujar);
  window.addEventListener("load", redibujar);
  document.fonts?.ready.then(redibujar);
  // Los rayos solo se mueven mientras la sección está a la vista.
  if ("IntersectionObserver" in window) new IntersectionObserver((en) => wa.classList.toggle("rayos--vivo", en[0].isIntersecting)).observe(wa);
  else wa.classList.add("rayos--vivo");
}

if (typeof document !== "undefined") {
  const wa = document.querySelector("#whatsapp .wa");
  if (wa) iniciar(wa);
}
