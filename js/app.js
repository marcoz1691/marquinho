import { norm, money, desdeHoja, urlPestana, precioTexto, montoEscrito, estaAbierto, calcularConHabilitantes, HABILITANTES, AVISO_HABILITANTES, esHabilitante } from "./nucleo.js";

(function () {
  "use strict";
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  var state = { cat: "destacados", q: "", sel: null, data: null, tarifas: null, notaria: null };
  // La pestaña inicial "Más pedidos": la lista de los trámites más pedidos que dio el notario, en su orden.
  var DESTACADOS = ["compraventa-vehiculo", "declaracion-natural", "poder-natural", "salida-pais", "copias-certificadas", "certificacion-electronica", "posesion-efectiva", "disolucion-sociedad-conyugal", "divorcio"];

  /* ---------- Contenido: Google Sheets con respaldo local ---------- */

  function get(u, as) {
    return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(u); return as === "text" ? r.text() : r.json(); });
  }

  function cargar() {
    return Promise.all([get("data/tramites.json"), get("data/tarifas.json"), get("data/notaria.json"), get("data/config.json").catch(function () { return {}; })]).then(function (r) {
      var base = { data: r[0], tarifas: r[1], notaria: r[2] }, G = (r[3] || {}).googleSheet || {};
      var gids = G.pestanas || {};
      if (!(G.documento || G.publicado) || !gids.tramites) return base;
      // "documento": hoja compartida por enlace (lee los datos al instante).
      // "publicado": hoja publicada en la web (Google la actualiza cada ~5 minutos).
      var url = function (gid) { return urlPestana(G, gid); };
      var names = Object.keys(gids).filter(function (k) { return gids[k] !== ""; });
      var hoja = Promise.all(names.map(function (k) { return get(url(gids[k]), "text"); })).then(function (txt) {
        var tabs = {}; names.forEach(function (k, i) { tabs[k] = txt[i]; });
        var res = desdeHoja(tabs, base);
        store.set("n41-hoja", res);
        return res;
      });
      var limite = new Promise(function (_, no) { setTimeout(function () { no(new Error("tiempo")); }, 7000); });
      // Si la hoja falla o tarda, se usan los últimos datos válidos guardados y, si no hay, los locales.
      return Promise.race([hoja, limite]).catch(function (e) {
        if (window.console) console.warn("Google Sheets no disponible:", e.message);
        return store.get("n41-hoja") || base;
      });
    });
  }

  /* ---------- Tarifas ---------- */

  var precio = function (t) { return precioTexto(t, state.tarifas); };

  /* ---------- Contacto rápido ---------- */

  var wa = function (texto, numero) {
    var n = (numero === undefined ? state.notaria.whatsapp : numero || "").replace(/\D/g, "");
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(texto);
  };
  var tieneWa = function () { return !!(state.notaria.whatsapp || "").replace(/\D/g, ""); };
  var telefono = function () { var t = (state.notaria.telefonos || [])[0]; return t ? "tel:+593" + t.replace(/\D/g, "").replace(/^0/, "") : ""; };

  /* ---------- Render ---------- */

  function renderCategorias() {
    $("#categorias").innerHTML = state.data.categorias.map(function (c) {
      var n = state.data.tramites.filter(function (t) { return t.cat === c.id; }).length;
      return '<button class="svc__row reveal" type="button" data-cat="' + esc(c.id) + '"><span class="svc__name">' + esc(c.nombre) +
        '</span><span class="svc__desc">' + esc(c.resumen) + '</span><span class="svc__count">' + n + (n === 1 ? " trámite" : " trámites") + '</span><span class="svc__arr" aria-hidden="true">→</span></button>';
    }).join("");
  }

  function renderChips() {
    var items = [{ id: "destacados", nombre: "Más pedidos" }].concat(state.data.categorias);
    $("#chips").innerHTML = items.map(function (c) {
      return '<button class="tab" type="button" data-c="' + esc(c.id) + '" aria-pressed="' + (!state.q && state.cat === c.id) + '">' + esc(c.nombre) + "</button>";
    }).join("");
  }

  // Panel con el detalle del trámite elegido.
  function panel(t) {
    var hechos = store.get("n41-check-" + t.id) || [];
    var cat = (state.data.categorias.find(function (c) { return c.id === t.cat; }) || {}).nombre || "";
    var acciones = [];
    if (tieneWa()) acciones.push('<a class="act act--wa" target="_blank" rel="noopener" href="' + esc(wa("Hola, quiero información sobre el trámite: " + t.nombre)) + '"><i class="ph ph-whatsapp-logo" aria-hidden="true"></i>Consultar por WhatsApp</a>');
    else if (telefono()) acciones.push('<a class="act act--wa" href="' + esc(telefono()) + '"><i class="ph ph-phone" aria-hidden="true"></i>Llamar a la notaría</a>');
    if (state.notaria.agenda) acciones.push('<a class="act" target="_blank" rel="noopener" href="' + esc(state.notaria.agenda) + '"><i class="ph ph-calendar-check" aria-hidden="true"></i>Agendar cita</a>');
    else if (tieneWa()) acciones.push('<a class="act" target="_blank" rel="noopener" href="' + esc(wa("Hola, quiero agendar una cita para: " + t.nombre)) + '"><i class="ph ph-calendar-check" aria-hidden="true"></i>Agendar cita</a>');
    if (tieneWa()) acciones.push('<a class="act" target="_blank" rel="noopener" href="' + esc(wa("Hola, quiero enviar mis documentos para revisión previa del trámite: " + t.nombre)) + '"><i class="ph ph-file-arrow-up" aria-hidden="true"></i>Enviar documentos</a>');
    else if (state.notaria.correo) acciones.push('<a class="act" href="mailto:' + esc(state.notaria.correo) + "?subject=" + encodeURIComponent("Revisión previa: " + t.nombre) + '"><i class="ph ph-envelope-simple" aria-hidden="true"></i>Enviar documentos por correo</a>');
    if (t.tarifa.tipo !== "consultar") acciones.push('<button class="act" type="button" data-calc="' + esc(t.id) + '"><i class="ph ph-calculator" aria-hidden="true"></i>Calcular costo</button>');
    acciones.push('<button class="act" type="button" data-share="' + esc(t.id) + '"><i class="ph ph-share-network" aria-hidden="true"></i>Compartir</button>');
    acciones.push('<button class="act" type="button" data-print="' + esc(t.id) + '"><i class="ph ph-printer" aria-hidden="true"></i>Imprimir</button>');

    return '<button class="tp__cerrar" type="button" data-cerrar aria-label="Cerrar el trámite"><i class="ph ph-x" aria-hidden="true"></i></button>' +
      '<div class="tp__top"><p class="tp__cat">' + esc(cat) + '</p><h3 class="tp__nombre">' + esc(t.nombre) + '</h3><p class="tp__desc">' + esc(t.desc) + "</p></div>" +
      '<p class="tp__precio"><span>Tarifa</span><strong>' + esc(precio(t)) + "</strong></p>" +
      (esHabilitante(t.id) ? "" : '<p class="tp__aviso">' + esc(AVISO_HABILITANTES) + "</p>") +
      '<div class="tp__cols"><div><h4>Requisitos <span class="hint">marca lo que ya tienes</span></h4><ul class="check">' +
      t.req.map(function (r, i) {
        return '<li><label><input type="checkbox" data-t="' + esc(t.id) + '" data-i="' + i + '"' + (hechos.indexOf(i) !== -1 ? " checked" : "") + "><span>" + esc(r) + "</span></label></li>";
      }).join("") + "</ul></div>" +
      (t.pasos.length ? '<div><h4>Cómo es el trámite</h4><ol class="pasos">' + t.pasos.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ol></div>" : "") +
      "</div>" + (t.nota ? '<p class="nota">' + esc(t.nota) + "</p>" : "") + sofia(t) +
      '<div class="acts">' + acciones.join("") + "</div>";
  }

  // La web da lo general; el asistente resuelve el caso particular de cada persona.
  function sofia(t) {
    var n = state.notaria.asistente || "Sofía";
    return '<div class="tp__sofia"><p><strong>¿Tu caso es distinto?</strong> Cuéntaselo a ' + esc(n) + ' y te dice qué requisitos y costo aplican a tu situación.</p>' +
      '<button class="act act--sofia" type="button" data-sofia="' + esc(t.nombre) + '"><i class="ph ph-chat-circle-text" aria-hidden="true"></i>Preguntarle a ' + esc(n) + '</button></div>';
  }

  // Lista compacta (izquierda) + panel del trámite elegido (derecha).
  function renderLista() {
    var q = norm(state.q.trim());
    var res = q
      ? state.data.tramites.filter(function (t) { return norm(t.nombre + " " + t.desc + " " + t.req.join(" ")).indexOf(q) !== -1; })
      : state.cat === "destacados"
        ? DESTACADOS.map(function (id) { return state.data.tramites.find(function (t) { return t.id === id; }); }).filter(Boolean)
        : state.data.tramites.filter(function (t) { return t.cat === state.cat; });
    $("#vacio").hidden = res.length > 0;
    $("#tramitesUi").hidden = !res.length;
    if (!res.some(function (t) { return t.id === state.sel; })) state.sel = res.length ? res[0].id : null;
    $("#lista").innerHTML = res.map(function (t) {
      return '<li><button class="tl__item" type="button" data-sel="' + esc(t.id) + '" aria-current="' + (t.id === state.sel) + '"><span>' + esc(t.nombre) +
        '</span><span class="tl__precio">' + esc(precio(t)) + '</span></button></li>';
    }).join("");
    var t = state.data.tramites.find(function (x) { return x.id === state.sel; });
    $("#detalleTramite").innerHTML = t ? panel(t) : "";
  }

  // En la computadora las respuestas siempre están a la vista; en el celular, en acordeón.
  var faqAncha = matchMedia("(min-width: 861px)");
  function setupFaq() {
    $("#faqList").addEventListener("click", function (e) { if (e.target.closest("summary") && faqAncha.matches) e.preventDefault(); });
    faqAncha.addEventListener("change", function () {
      [].forEach.call(document.querySelectorAll("#faqList details"), function (d) { d.open = faqAncha.matches; });
    });
  }
  function renderFaq() {
    var ancha = faqAncha.matches;
    $("#faqList").innerHTML = state.data.faq.map(function (f, i) {
      return '<details class="faq__item reveal" style="--i:' + (i % 2) + '"' + (ancha ? " open" : "") + '><summary><h3>' + esc(f.q) + '</h3><i class="ph ph-plus" aria-hidden="true"></i></summary><p>' + esc(f.a) + "</p></details>";
    }).join("");

  }

  function renderAvisos() {
    var hoy = new Date().toISOString().slice(0, 10);
    var vistos = (function () { try { return JSON.parse(sessionStorage.getItem("n41-avisos")) || []; } catch (e) { return []; } })();
    var activos = (state.data.avisos || []).filter(function (a) {
      return (!a.desde || a.desde <= hoy) && (!a.hasta || hoy <= a.hasta) && vistos.indexOf(a.msg) === -1;
    });
    var el = $("#aviso");
    if (!activos.length) { el.hidden = true; return; }
    el.hidden = false;
    $("#avisoTxt").textContent = activos.map(function (a) { return a.msg; }).join("  ·  ");
    // Con el aviso visible, los enlaces internos deben quedar debajo de él.
    document.documentElement.style.scrollPaddingTop = (72 + el.offsetHeight) + "px";
    $("#avisoX").onclick = function () {
      el.hidden = true; document.documentElement.style.scrollPaddingTop = "";
      try { sessionStorage.setItem("n41-avisos", JSON.stringify(vistos.concat(activos.map(function (a) { return a.msg; })))); } catch (e) {}
    };
  }

  function setupCalc() {
    var T = state.tarifas, sel = $("#calcTramite"), habs = $("#calcHabs");
    var tramite = function (id) { return state.data.tramites.find(function (x) { return x.id === id; }); };
    $("#anioTarifa").textContent = T.anio; $("#sbuTxt").textContent = money(T.sbu);
    sel.innerHTML = state.data.categorias.map(function (c) {
      var ts = state.data.tramites.filter(function (t) { return t.cat === c.id && t.tarifa.tipo !== "consultar"; });
      return ts.length ? '<optgroup label="' + esc(c.nombre) + '">' + ts.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.nombre) + "</option>"; }).join("") + "</optgroup>" : "";
    }).join("");
    // Documentos habilitantes: la persona elige cuántas hojas; el precio sale del trámite de cada uno.
    var disponibles = HABILITANTES.filter(function (h) { var t = tramite(h.tramite); return t && t.tarifa.tipo !== "consultar"; });
    habs.closest("fieldset").hidden = !disponibles.length;
    habs.innerHTML = disponibles.map(function (h) {
      var n = esc(h.nombre.charAt(0).toLowerCase() + h.nombre.slice(1));
      return '<div class="hab" data-hab="' + esc(h.id) + '"><p class="hab__txt"><span class="hab__nombre">' + esc(h.nombre) + '</span><span class="hab__precio">' + esc(precioTexto(tramite(h.tramite), T)) + "</span></p>" +
        '<div class="hab__step"><button class="hab__btn" type="button" data-menos aria-label="Quitar una hoja de ' + n + '"><span aria-hidden="true">−</span></button>' +
        '<input class="hab__n" type="number" min="0" max="200" step="1" value="0" inputmode="numeric" aria-label="Hojas de ' + n + '">' +
        '<button class="hab__btn" type="button" data-mas aria-label="Agregar una hoja de ' + n + '"><span aria-hidden="true">+</span></button></div></div>';
    }).join("");
    var acotar = function (v) { var n = Math.floor(Number(v)); return isFinite(n) ? Math.min(200, Math.max(0, n)) : 0; };
    var extras = function () {
      var e = {};
      [].forEach.call(habs.querySelectorAll("[data-hab]"), function (row) { e[row.dataset.hab] = acotar(row.querySelector("input").value); });
      return e;
    };
    function calc() {
      var t = tramite(sel.value);
      if (!t) return;
      var f = t.tarifa, note = t.nota || "";
      var multi = f.unidad && /por/.test(f.unidad), esCuantia = f.tipo === "cuantia";
      $("#calcQtyWrap").hidden = !multi;
      $("#calcMontoWrap").hidden = !esCuantia;
      $("#calcUnit").textContent = multi ? "(" + f.unidad + ")" : "";
      var monto = montoEscrito($("#calcMonto").value);
      // Si el trámite elegido ya es una copia o materialización, no se ofrece sumarla otra vez.
      HABILITANTES.forEach(function (h) {
        var row = habs.querySelector('[data-hab="' + h.id + '"]'); if (!row) return;
        row.hidden = h.tramite === t.id;
        if (row.hidden) row.querySelector("input").value = 0;
      });
      var c = calcularConHabilitantes(t, T, { cantidad: parseInt($("#calcQty").value, 10) || 1, monto: monto }, extras(), state.data.tramites), r = c.tramite;
      if (esCuantia) {
        if (r.total !== null) note = "Rango " + (r.hasta === null ? "desde " + money(r.desde + .01) : money(r.desde ? r.desde + .01 : 0) + " a " + money(r.hasta)) + ": " +
          r.factor.toLocaleString("es-EC") + " SBU. " + note;
        else note = monto > 0 ? "Para este valor, consulta con la notaría." : "Ingresa el valor del contrato o del avalúo.";
      }
      $("#rHabWrap").hidden = !c.habilitantes.length;
      $("#rHab").textContent = money(c.habilitantesBase);
      if (c.total === null) { $("#rBase").textContent = $("#rIva").textContent = $("#rTotal").textContent = "-"; }
      else { $("#rBase").textContent = money(r.base); $("#rIva").textContent = money(c.iva); $("#rTotal").textContent = money(c.total); }
      $("#calcNote").textContent = note;
      $("#calcAviso").textContent = c.habilitantes.length ? "Incluye los documentos habilitantes que agregaste; se cobran por hoja." : esHabilitante(t.id) ? "" : AVISO_HABILITANTES;
    }
    habs.addEventListener("click", function (e) {
      var b = e.target.closest("[data-mas],[data-menos]");
      if (!b) return;
      var input = b.closest("[data-hab]").querySelector("input");
      input.value = acotar(acotar(input.value) + (b.hasAttribute("data-mas") ? 1 : -1));
      calc();
    });
    habs.addEventListener("input", calc);
    habs.addEventListener("change", function (e) { if (e.target.matches("input")) { e.target.value = acotar(e.target.value); calc(); } });
    sel.addEventListener("change", calc); $("#calcQty").addEventListener("input", calc); $("#calcMonto").addEventListener("input", calc);
    $("#calc").addEventListener("submit", function (e) { e.preventDefault(); });
    setupCalc.elegir = function (id) {
      sel.value = id;
      [].forEach.call(habs.querySelectorAll("input"), function (i) { i.value = 0; });
      calc(); $("#calculadora").scrollIntoView({ behavior: "smooth" });
    };
    calc();
  }

  function renderContacto() {
    var N = state.notaria, rows = "";
    var tels = (N.telefonos || []).filter(Boolean);
    var corto = N.notarioCorto || N.notario || N.nombre;
    $("#brandName").textContent = corto;
    $("#heroNotario").textContent = N.cargo || N.nombre;
    $("#heroTitle").textContent = N.notario || N.nombre;
    if (N.eslogan) $("#heroLema").textContent = N.eslogan;
    document.title = corto + " · " + N.nombre;
    rows += "<div><h3>Dirección</h3><p>" + esc(N.direccion) + "</p></div>";
    if (tels.length) rows += "<div><h3>Teléfonos</h3><p>" + tels.map(function (t) { return '<a href="tel:+593' + esc(t.replace(/\D/g, "").replace(/^0/, "")) + '">' + esc(t) + "</a>"; }).join("<br>") + "</p></div>";
    if (N.correo) rows += '<div><h3>Correo</h3><p><a href="mailto:' + esc(N.correo) + '">' + esc(N.correo) + "</a></p></div>";
    rows += "<div><h3>Horario</h3><p>" + esc(N.horario.texto) + "</p></div>";
    var m = N.mapa, acts = [];
    acts.push('<a class="act act--wa" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + m.lat + "," + m.lng + '"><i class="ph ph-navigation-arrow" aria-hidden="true"></i>Cómo llegar</a>');
    acts.push('<a class="act" target="_blank" rel="noopener" href="https://waze.com/ul?ll=' + m.lat + "," + m.lng + '&navigate=yes">Abrir en Waze</a>');
    if (tieneWa()) acts.push('<a class="act" target="_blank" rel="noopener" href="' + esc(wa("Hola, tengo una consulta.")) + '">WhatsApp</a>');
    if (N.agenda) acts.push('<a class="act" target="_blank" rel="noopener" href="' + esc(N.agenda) + '"><i class="ph ph-calendar-check" aria-hidden="true"></i>Agendar cita</a>');
    rows += '<div class="acts">' + acts.join("") + "</div>";
    var labels = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", x: "X" };
    var soc = Object.keys(N.redes || {}).filter(function (k) { return N.redes[k]; }).map(function (k) { return '<a href="' + esc(N.redes[k]) + '" target="_blank" rel="noopener">' + labels[k] + "</a>"; }).join("");
    if (soc) rows += '<div><h3>Redes</h3><div class="social">' + soc + "</div></div>";
    $("#contactInfo").innerHTML = rows;
    $("#mapa").src = "https://www.openstreetmap.org/export/embed.html?bbox=" + [m.lng - .006, m.lat - .004, m.lng + .006, m.lat + .004].join("%2C") + "&layer=mapnik&marker=" + m.lat + "%2C" + m.lng;
    if (tieneWa()) document.documentElement.dataset.wa = String(N.whatsapp).replace(/\D/g, "");
    $("#footTxt").textContent = "© " + new Date().getFullYear() + " " + N.nombre + " · " + N.notario;
    var redes = Object.keys(N.redes || {}).map(function (k) { return N.redes[k]; }).filter(Boolean);
    $("#ld").textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "Notary", name: N.nombre, founder: N.notario,
      address: { "@type": "PostalAddress", streetAddress: N.direccion, addressLocality: "Quito", addressRegion: "Pichincha", addressCountry: "EC" },
      geo: { "@type": "GeoCoordinates", latitude: m.lat, longitude: m.lng },
      telephone: tels[0] ? "+593" + tels[0].replace(/\D/g, "").replace(/^0/, "") : undefined, email: N.correo || undefined,
      openingHoursSpecification: { "@type": "OpeningHoursSpecification", dayOfWeek: N.horario.dias.map(function (d) { return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]; }), opens: N.horario.abre, closes: N.horario.cierra },
      sameAs: redes.length ? redes : undefined
    });
    var tick = function () {
      var open = estaAbierto(N.horario, new Date());
      $("#estado").innerHTML = '<span class="dot' + (open ? " on" : "") + '"></span>' + (open ? "Abierto ahora · cierra a las " + esc(N.horario.cierra) : "Cerrado ahora · " + esc(N.horario.texto));
    };
    tick(); setInterval(tick, 60000);
  }

  /* ---------- Interacción con los trámites ---------- */

  function setupTramites() {
    var lista = $("#lista"), det = $("#detalleTramite");
    var tramite = function (id) { return state.data.tramites.find(function (t) { return t.id === id; }); };
    var enlace = function (id) { return location.href.split("#")[0] + "#t-" + id; };
    var angosta = matchMedia("(max-width: 860px)");

    // En el celular el detalle sube como una hoja desde abajo, sin alargar la página.
    var velo = document.createElement("div");
    velo.className = "tp-velo"; velo.hidden = true; document.body.appendChild(velo);
    var origen = null;
    var abrirHoja = function () {
      if (!angosta.matches) return;
      origen = lista.querySelector('[data-sel="' + state.sel + '"]');   // la lista se repintó: el botón tocado ya no existe
      velo.hidden = false; det.scrollTop = 0;
      det.setAttribute("role", "dialog"); det.setAttribute("aria-modal", "true"); det.setAttribute("aria-label", "Detalle del trámite");
      requestAnimationFrame(function () {
        det.classList.add("tp--abierto"); velo.classList.add("on");
        var x = det.querySelector("[data-cerrar]"); if (x) x.focus({ preventScroll: true });
      });
      document.documentElement.classList.add("hoja-abierta");
    };
    var cerrarHoja = function () {
      if (!det.classList.contains("tp--abierto")) return;
      det.removeAttribute("role"); det.removeAttribute("aria-modal"); det.removeAttribute("aria-label");
      if (origen && origen.focus && document.contains(origen)) origen.focus({ preventScroll: true });
      det.classList.remove("tp--abierto"); velo.classList.remove("on");
      document.documentElement.classList.remove("hoja-abierta");
      setTimeout(function () { if (!det.classList.contains("tp--abierto")) velo.hidden = true; }, 350);
    };
    velo.addEventListener("click", cerrarHoja);
    document.addEventListener("keydown", function (e) {
      if (!det.classList.contains("tp--abierto")) return;
      if (e.key === "Escape") return cerrarHoja();
      if (e.key !== "Tab") return;
      var f = det.querySelectorAll("button, a[href], input, select, textarea"), primero = f[0], ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    });
    angosta.addEventListener("change", function () { if (!angosta.matches) cerrarHoja(); });

    lista.addEventListener("click", function (e) {
      var b = e.target.closest("[data-sel]"); if (!b) return;
      state.sel = b.dataset.sel; renderLista();
      if (history.replaceState) history.replaceState(null, "", "#t-" + state.sel);
      abrirHoja();
    });

    // Lista de requisitos: lo marcado se guarda en este navegador.
    det.addEventListener("change", function (e) {
      var c = e.target; if (!c.dataset.t) return;
      var marcados = [].map.call(det.querySelectorAll('input[data-t="' + c.dataset.t + '"]:checked'), function (x) { return +x.dataset.i; });
      store.set("n41-check-" + c.dataset.t, marcados);
    });

    det.addEventListener("click", function (e) {
      var b = e.target.closest("[data-calc],[data-share],[data-print],[data-sofia],[data-cerrar]"); if (!b) return;
      if (b.dataset.cerrar !== undefined || b.dataset.calc || b.dataset.sofia) cerrarHoja();
      if (b.dataset.cerrar !== undefined) return;
      if (b.dataset.sofia) return document.dispatchEvent(new CustomEvent("n41:preguntar", { detail: { texto: "Sobre «" + b.dataset.sofia + "»: " } }));
      if (b.dataset.calc) return setupCalc.elegir(b.dataset.calc);
      var t = tramite(b.dataset.share || b.dataset.print);
      if (b.dataset.print) {
        document.body.dataset.print = "1";
        window.print();
        setTimeout(function () { delete document.body.dataset.print; }, 500);
        return;
      }
      var texto = state.notaria.nombre + "\n" + t.nombre + "\n\nRequisitos:\n" + t.req.map(function (r) { return "• " + r; }).join("\n") + "\n\n" + enlace(t.id);
      if (navigator.share) navigator.share({ title: t.nombre, text: texto }).catch(function () {});
      else window.open(wa(texto, ""), "_blank", "noopener");
    });

    $("#categorias").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]"); if (!b) return;
      state.cat = b.dataset.cat; state.q = ""; $("#buscar").value = ""; state.sel = null; renderChips(); renderLista();
      $("#tramites").scrollIntoView({ behavior: "smooth" });
    });

    // Enlace directo: notaria/#t-compraventa muestra ese trámite en su categoría.
    var abrirHash = function () {
      var m = location.hash.match(/^#t-([\w-]+)/), t = m && tramite(m[1]); if (!t) return;
      state.q = ""; $("#buscar").value = ""; state.cat = DESTACADOS.indexOf(t.id) > -1 ? "destacados" : t.cat; state.sel = t.id;
      renderChips(); renderLista();
      setTimeout(function () { $("#tramites").scrollIntoView({ behavior: "smooth", block: "start" }); abrirHoja(); }, 60);
    };
    window.addEventListener("hashchange", abrirHash);
    abrirHash();
  }

  /* ---------- Escenas de scroll ---------- */

  // Escenas fijas: cada [data-scene] recibe --p (0 a 1) según cuánto se ha recorrido.
  function scenes() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var list = [].slice.call(document.querySelectorAll("[data-scene]"));
    var words = $("#words"), spans = [];
    if (words) {
      words.innerHTML = words.textContent.trim().split(/\s+/).map(function (w) { return "<span>" + esc(w) + "</span> "; }).join("");
      spans = [].slice.call(words.children);
    }
    var hs = $("[data-h]"), track = $("#track"), wide = { matches: true };   // el recorrido horizontal también corre en el celular
    // Recorrido horizontal: hasta que la última tarjeta quede alineada con el margen derecho.
    var travel = function () {
      var last = track.lastElementChild, pad = parseFloat(getComputedStyle(track).paddingLeft);
      return Math.max(0, last.offsetLeft + last.offsetWidth + pad - innerWidth);
    };
    // En el celular la barra del navegador cambia el alto al hacer scroll: se mide solo cuando cambia el ancho.
    var medida = { ancho: 0, alto: 0 };
    var size = function () {
      if (innerWidth !== medida.ancho || Math.abs(innerHeight - medida.alto) > 150) medida = { ancho: innerWidth, alto: innerHeight };
      if (hs) hs.style.height = wide.matches ? (travel() + medida.alto * 1.15) + "px" : "";
      frame();
    };
    var ticking = false;
    function frame() {
      ticking = false;
      list.forEach(function (el) {
        var r = el.getBoundingClientRect(), run = r.height - innerHeight;
        var p = run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 0;
        el.style.setProperty("--p", p.toFixed(4));
        if (el.contains(words)) {
          var lit = Math.round((p * 1.25 - .1) * spans.length);
          spans.forEach(function (s, i) { s.classList.toggle("on", i < lit); });
        }
        if (el === hs && wide.matches) {
          track.style.transform = "translate3d(" + (-p * travel()).toFixed(1) + "px,0,0)";
        }
      });
    }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
    window.addEventListener("resize", size);
    size();
  }

  function observe() {
    var els = document.querySelectorAll(".reveal:not(.in)");
    // Las filas de servicios aparecen escalonadas.
    [].forEach.call($("#categorias").children, function (c, i) { c.style.setProperty("--i", i); });
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { threshold: .12 });
    els.forEach(function (e) { io.observe(e); });
  }

  function setupUI() {
    var nav = $("#nav"), menu = $("#menu"), burger = $("#burger");
    window.addEventListener("scroll", function () { nav.classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });
    // El menú marca la sección que se está viendo.
    if ("IntersectionObserver" in window) {
      var enlaces = [].slice.call(menu.querySelectorAll("a"));
      var io = new IntersectionObserver(function (en) {
        en.forEach(function (x) {
          if (!x.isIntersecting) return;
          enlaces.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + x.target.id); });
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      enlaces.forEach(function (a) { var sec = $(a.getAttribute("href")); if (sec) io.observe(sec); });
    }
    burger.addEventListener("click", function () { var o = menu.classList.toggle("open"); burger.setAttribute("aria-expanded", o); });
    menu.addEventListener("click", function (e) { if (e.target.tagName === "A") { menu.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { menu.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); } });
    $("#buscar").addEventListener("input", function (e) { state.q = e.target.value; renderChips(); renderLista(); });
    $("#chips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-c]"); if (!b) return;
      state.cat = b.dataset.c; state.q = ""; $("#buscar").value = ""; state.sel = null; renderChips(); renderLista();
    });
    observe();
    scenes();
  }

  cargar().then(function (r) {
    state.data = r.data; state.tarifas = r.tarifas; state.notaria = r.notaria;
    renderAvisos(); renderCategorias(); renderChips(); renderLista(); renderFaq(); setupFaq(); setupCalc(); renderContacto(); setupTramites(); setupUI();
  }).catch(function (e) {
    document.body.insertAdjacentHTML("afterbegin", '<p style="padding:16px;text-align:center">No se pudieron cargar los datos. Abre el sitio desde un servidor web (no file://). ' + esc(e.message) + "</p>");
    document.querySelectorAll(".reveal").forEach(function (x) { x.classList.add("in"); });
  });
})();
