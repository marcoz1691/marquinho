// Web de la Notaría 42: catálogo de trámites, calculadora de tarifas, horario, menú y tema.
// Todo sale de los JSON de data/; el cálculo de tarifas es el mismo de la Notaría 41 (js/nucleo.js).
import { norm, money, precioTexto, estaAbierto, calcularConHabilitantes, cobraPorCantidad, AVISO_VALOR, muestraAvisoValor } from "./nucleo.js";

const $ = (s, el) => (el || document).querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const guardado = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const DESTACADOS = ["compraventa-vehiculo", "declaracion-natural", "poder-natural", "salida-pais", "copias-certificadas", "certificacion-electronica", "posesion-efectiva", "disolucion-sociedad-conyugal", "divorcio"];
const estado = { cat: "destacados", q: "", sel: null, data: null, tarifas: null, notaria: null };
const angosta = matchMedia("(max-width: 860px)");

document.documentElement.classList.add("anim");
interfaz();
revelar();

const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
Promise.all([json("data/tramites.json"), json("data/tarifas.json"), json("data/notaria.json")]).then(([data, tarifas, notaria]) => {
  Object.assign(estado, { data, tarifas, notaria });
  contacto();
  chips(); lista(); tramites();
  calculadora();
  faq();
}).catch((e) => {
  console.error(e);
  $("#vacio").textContent = "No pudimos cargar los trámites. Recarga la página o llámanos al 02 601 9691.";
  $("#vacio").hidden = false;
});

/* ---------- Catálogo ---------- */

const precio = (t) => precioTexto(t, estado.tarifas);
const tramite = (id) => estado.data.tramites.find((t) => t.id === id);
const telefono = () => { const t = (estado.notaria.telefonos || [])[0]; return t ? "tel:+593" + t.replace(/\D/g, "").replace(/^0/, "") : ""; };
const whatsapp = (texto) => { const n = (estado.notaria.whatsapp || "").replace(/\D/g, ""); return n ? "https://wa.me/" + n + "?text=" + encodeURIComponent(texto) : ""; };

function chips() {
  const items = [{ id: "destacados", nombre: "Más solicitados" }].concat(estado.data.categorias.filter((c) => estado.data.tramites.some((t) => t.cat === c.id)));
  $("#chips").innerHTML = items.map((c) => '<button class="chip" type="button" data-c="' + esc(c.id) + '" aria-pressed="' + (!estado.q && estado.cat === c.id) + '">' + esc(c.nombre) + "</button>").join("");
}

function resultados() {
  const q = norm(estado.q.trim());
  if (q) return estado.data.tramites.filter((t) => norm(t.nombre + " " + t.desc + " " + t.req.join(" ")).includes(q));
  if (estado.cat === "destacados") return DESTACADOS.map(tramite).filter(Boolean);
  return estado.data.tramites.filter((t) => t.cat === estado.cat);
}

function lista() {
  const res = resultados(), det = $("#detalle");
  $("#vacio").hidden = res.length > 0;
  $("#conteo").textContent = res.length === 1 ? "1 trámite" : res.length + " trámites";
  $("#catalogo").hidden = !res.length;
  if (!res.some((t) => t.id === estado.sel)) estado.sel = res.length && !angosta.matches ? res[0].id : null;
  $("#lista").innerHTML = res.map((t) => '<li><button class="lista__item" type="button" data-sel="' + esc(t.id) + '" aria-expanded="' + (t.id === estado.sel) + '"><span>' + esc(t.nombre) + '</span><span class="lista__precio">' + esc(precio(t)) + '</span><i class="ph ph-caret-right" aria-hidden="true"></i></button></li>').join("");
  const t = estado.sel && tramite(estado.sel);
  // En el celular el detalle se abre debajo del trámite tocado, como un acordeón; en la computadora va a la derecha.
  const sitio = angosta.matches && t ? $('[data-sel="' + estado.sel + '"]').parentElement : $("#detalleCol");
  sitio.appendChild(det);
  det.hidden = !t;
  det.classList.toggle("detalle--nuevo", !!t && det.dataset.id !== (t && t.id));
  det.dataset.id = t ? t.id : "";
  $("#detalleNucleo").innerHTML = t ? panel(t) : "";
}

function panel(t) {
  const hechos = guardado.get("n42-check-" + t.id) || [];
  const cat = (estado.data.categorias.find((c) => c.id === t.cat) || {}).nombre || "";
  const acciones = [];
  const wa = whatsapp("Hola, quiero información sobre el trámite: " + t.nombre);
  if (wa) acciones.push('<a class="btn btn--pri" target="_blank" rel="noopener" href="' + esc(wa) + '"><i class="ph ph-whatsapp-logo" aria-hidden="true"></i>Consultar por WhatsApp</a>');
  else if (telefono()) acciones.push('<a class="btn btn--pri" href="' + esc(telefono()) + '"><i class="ph ph-phone" aria-hidden="true"></i>Llamar a la notaría</a>');
  if (estado.notaria.correo) acciones.push('<a class="btn" href="mailto:' + esc(estado.notaria.correo) + "?subject=" + encodeURIComponent("Revisión previa: " + t.nombre) + '"><i class="ph ph-envelope-simple" aria-hidden="true"></i>Enviar documentos</a>');
  if (calculables().includes(t)) acciones.push('<button class="btn" type="button" data-calc="' + esc(t.id) + '"><i class="ph ph-calculator" aria-hidden="true"></i>Calcular costo</button>');
  acciones.push('<button class="btn btn--icono" type="button" data-share="' + esc(t.id) + '" aria-label="Compartir"><i class="ph ph-share-network" aria-hidden="true"></i></button>');
  acciones.push('<button class="btn btn--icono" type="button" data-print aria-label="Imprimir"><i class="ph ph-printer" aria-hidden="true"></i></button>');
  const forms = (t.formularios || []).filter((f) => /^https:\/\//.test(f.url));
  const formularios = forms.length ? '<div class="acciones">' + forms.map((f) => '<a class="btn" target="_blank" rel="noopener" href="' + esc(f.url) + '"><i class="ph ph-files" aria-hidden="true"></i>' + esc(f.nombre) + "</a>").join("") + "</div>" : "";
  return '<p class="detalle__cat">' + esc(cat) + '</p><h3 class="detalle__nombre">' + esc(t.nombre) + '</h3><p class="detalle__desc">' + esc(t.desc) + "</p>" +
    '<p class="detalle__precio"><span>Tarifa</span><strong>' + esc(precio(t)) + "</strong></p>" +
    (muestraAvisoValor(t) ? '<p class="nota">' + esc(AVISO_VALOR) + "</p>" : "") +
    '<div class="detalle__cols"><div><h4>Requisitos <span>marca lo que ya tienes</span></h4><ul class="check">' +
    t.req.map((r, i) => '<li><label><input type="checkbox" data-t="' + esc(t.id) + '" data-i="' + i + '"' + (hechos.includes(i) ? " checked" : "") + "><span>" + esc(r) + "</span></label></li>").join("") + "</ul></div>" +
    (t.pasos.length ? '<div><h4>Cómo es el trámite</h4><ol class="pasos">' + t.pasos.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ol></div>" : "") +
    "</div>" + formularios + (t.nota ? '<p class="nota">' + esc(t.nota) + "</p>" : "") +
    '<div class="acciones">' + acciones.join("") + "</div>";
}

function tramites() {
  $("#buscar").addEventListener("input", (e) => { estado.q = e.target.value; chips(); lista(); });
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]"); if (!b) return;
    estado.cat = b.dataset.c; estado.q = ""; $("#buscar").value = ""; estado.sel = null;
    chips(); lista();
    $('[data-c="' + estado.cat + '"]').focus();
  });
  $("#lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sel]"); if (!b || e.target.closest("#detalle")) return;
    // En el celular, tocar otra vez el trámite abierto lo cierra.
    estado.sel = angosta.matches && estado.sel === b.dataset.sel ? null : b.dataset.sel;
    lista();
    if (history.replaceState) history.replaceState(null, "", estado.sel ? "#t-" + estado.sel : location.pathname);
    const abierto = estado.sel && $('[data-sel="' + estado.sel + '"]');
    if (abierto) { abierto.focus({ preventScroll: true }); if (angosta.matches) abierto.scrollIntoView({ block: "start", behavior: reducido() ? "auto" : "smooth" }); }
  });
  angosta.addEventListener("change", lista);
  const det = $("#detalle");
  det.addEventListener("change", (e) => {
    const c = e.target; if (!c.dataset.t) return;
    guardado.set("n42-check-" + c.dataset.t, [...det.querySelectorAll('input[data-t="' + c.dataset.t + '"]:checked')].map((x) => +x.dataset.i));
  });
  det.addEventListener("click", (e) => {
    const b = e.target.closest("[data-calc],[data-share],[data-print]"); if (!b) return;
    if (b.dataset.calc) return calculadora.elegir(b.dataset.calc);
    // En el celular print() no bloquea: la marca se quita al terminar de imprimir, no con un temporizador.
    if (b.hasAttribute("data-print")) { document.body.dataset.imprimir = "1"; addEventListener("afterprint", () => delete document.body.dataset.imprimir, { once: true }); window.print(); return; }
    const t = tramite(b.dataset.share);
    const texto = estado.notaria.nombre + "\n" + t.nombre + "\n\nRequisitos:\n" + t.req.map((r) => "• " + r).join("\n") + "\n\n" + location.href.split("#")[0] + "#t-" + t.id;
    if (navigator.share) navigator.share({ title: t.nombre, text: texto }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(texto).then(() => {
      b.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i>'; b.setAttribute("aria-label", "Copiado");
      setTimeout(() => { b.innerHTML = '<i class="ph ph-share-network" aria-hidden="true"></i>'; b.setAttribute("aria-label", "Compartir"); }, 2000);
    }).catch(() => {});
    else location.href = "mailto:?subject=" + encodeURIComponent(t.nombre) + "&body=" + encodeURIComponent(texto);
  });
  // Enlace directo: notaria42quito.com/#t-poder-natural abre ese trámite.
  const abrirHash = () => {
    const m = location.hash.match(/^#t-([\w-]+)/), t = m && tramite(m[1]); if (!t) return;
    estado.q = ""; $("#buscar").value = ""; estado.cat = DESTACADOS.includes(t.id) ? "destacados" : t.cat; estado.sel = t.id;
    chips(); lista();
    $('[data-sel="' + t.id + '"]').scrollIntoView({ block: "start" });
  };
  window.addEventListener("hashchange", abrirHash);
  abrirHash();
}

/* ---------- Calculadora ---------- */

// Calculadora básica: solo los trámites más solicitados, con la cantidad cuando se cobra por firma, por menor o por hoja.
function calculadora() {
  const T = estado.tarifas, sel = $("#calcTramite");
  $("#anio").textContent = T.anio; $("#sbu").textContent = money(T.sbu);
  sel.innerHTML = calculables().map((t) => '<option value="' + esc(t.id) + '">' + esc(t.nombre) + "</option>").join("");
  function calc() {
    const t = tramite(sel.value); if (!t) return;
    const multi = cobraPorCantidad(t);
    $("#calcQtyWrap").hidden = !multi;
    $("#calcUnit").textContent = multi && t.tarifa.unidad ? "(" + t.tarifa.unidad + ")" : "";
    const q = $("#calcQty"), cantidad = Math.min(200, Math.max(1, parseInt(q.value, 10) || 1));
    if (q.value !== "" && +q.value !== cantidad) q.value = cantidad;   // lo que se ve es lo que se calcula (1 a 200)
    const c = calcularConHabilitantes(t, T, { cantidad: multi ? cantidad : 1, monto: 0 }, {}, estado.data.tramites);
    if (c.total === null) $("#rBase").textContent = $("#rIva").textContent = $("#rTotal").textContent = "-";
    else { $("#rBase").textContent = money(c.tramite.base); $("#rIva").textContent = money(c.iva); $("#rTotal").textContent = money(c.total); }
    $("#calcNota").textContent = t.nota || "";
    $("#calcAviso").textContent = muestraAvisoValor(t) ? AVISO_VALOR : "";
  }
  sel.addEventListener("change", calc);
  // Solo cifras: el campo es de texto (inputmode numérico) para que no acepte letras ni signos.
  $("#calcQty").addEventListener("input", function () { const v = this.value.replace(/\D/g, ""); if (v !== this.value) this.value = v; calc(); });
  $("#calc").addEventListener("submit", (e) => e.preventDefault());
  calculadora.elegir = (id) => {
    sel.value = id; $("#calcQty").value = 1;
    calc();
    $("#calculadora").scrollIntoView({ behavior: reducido() ? "auto" : "smooth" });
    sel.focus({ preventScroll: true });
  };
  calc();
}
const calculables = () => DESTACADOS.map(tramite).filter((t) => t && (t.tarifa.tipo === "pct" || t.tarifa.tipo === "fija"));

/* ---------- Preguntas, contacto y horario ---------- */

function faq() {
  $("#faq").innerHTML = (estado.data.faq || []).map((f) => '<details class="faq__item"><summary>' + esc(f.q) + '<i class="ph ph-plus" aria-hidden="true"></i></summary><p>' + esc(f.a) + "</p></details>").join("");
}

function contacto() {
  const N = estado.notaria;
  $("#horario").textContent = N.horario.texto;
  $("#anioPie").textContent = new Date().getFullYear();
  const wa = whatsapp("Hola, tengo una consulta.");
  if (wa) { $("#waEnlace").href = wa; $("#waContacto").hidden = false; }
  if (N.mapa && N.mapa.lat != null) {
    $("#comoLlegar").href = "https://www.google.com/maps/dir/?api=1&destination=" + N.mapa.lat + "," + N.mapa.lng;
    $("#waze").href = "https://waze.com/ul?ll=" + N.mapa.lat + "," + N.mapa.lng + "&navigate=yes";
  }
  let antes = null;
  const tic = () => {
    const abierto = estaAbierto(N.horario, new Date());
    if (abierto === antes) return;
    antes = abierto;
    const html = '<span class="punto' + (abierto ? " punto--on" : "") + '"></span>' + (abierto ? "Abierto ahora · cierra a las " + esc(N.horario.cierra) : "Cerrado ahora · " + esc(N.horario.texto));
    $("#estado").innerHTML = html;
    $("#estado2").innerHTML = html;
  };
  tic(); setInterval(tic, 60000);
}

/* ---------- Menú, tema y animaciones ---------- */

function reducido() { return matchMedia("(prefers-reduced-motion: reduce)").matches; }

function interfaz() {
  const raiz = document.documentElement, boton = $("#tema"), sistema = matchMedia("(prefers-color-scheme: dark)");
  const oscuro = () => raiz.dataset.theme ? raiz.dataset.theme === "dark" : sistema.matches;
  const pintar = () => {
    boton.innerHTML = '<i class="ph ' + (oscuro() ? "ph-sun" : "ph-moon") + '" aria-hidden="true"></i>';
    boton.setAttribute("aria-label", oscuro() ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  };
  boton.addEventListener("click", () => {
    const nuevo = oscuro() ? "light" : "dark";
    raiz.dataset.theme = nuevo;
    try { localStorage.setItem("n41-tema", nuevo); } catch {}
    pintar();
  });
  sistema.addEventListener("change", pintar);
  pintar();

  const burger = $("#burger"), isla = $("#isla");
  // Con el menú abierto, lo de detrás queda inerte para que el Tab no se pierda bajo la capa.
  const fondo = (inerte) => document.querySelectorAll("main, footer, .saltar").forEach((el) => { el.inert = inerte; });
  const cerrar = () => { isla.classList.remove("isla--abierta"); burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", "Abrir el menú"); raiz.classList.remove("menu-abierto"); fondo(false); };
  burger.addEventListener("click", () => {
    const abierto = isla.classList.toggle("isla--abierta");
    burger.setAttribute("aria-expanded", abierto); burger.setAttribute("aria-label", abierto ? "Cerrar el menú" : "Abrir el menú");
    raiz.classList.toggle("menu-abierto", abierto);
    fondo(abierto);
    if (abierto) $("#menu a").focus();
  });
  $("#menu").addEventListener("click", (e) => { if (e.target.closest("a")) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isla.classList.contains("isla--abierta")) { cerrar(); burger.focus(); } });
  angosta.addEventListener("change", cerrar);
}

// Cada bloque entra con un fundido suave al aparecer en pantalla (con «Reducir movimiento», solo el fundido).
function revelar() {
  const els = document.querySelectorAll(".revelar");
  if (!("IntersectionObserver" in window)) return els.forEach((el) => el.classList.add("visible"));
  const io = new IntersectionObserver((entradas) => entradas.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => io.observe(el));
}
