(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (n) { return "$" + n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var isPlaceholder = function (s) { return !s || String(s).indexOf("[EDITAR") !== -1; };

  var ICONS = {
    key: '<path d="M14 10a4 4 0 1 0-3.9 5H12l1 1h2v2h2v2h3v-3l-6.600-6.600A4 4 0 0 0 14 10Z"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
    heart: '<path d="M12 20s-8-5-8-11a4.500 4.500 0 0 1 8-2.700A4.500 4.500 0 0 1 20 9c0 6-8 11-8 11Z"/>',
    doc: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
    building: '<path d="M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M3 21h18"/>',
    scroll: '<path d="M8 4h11v13a3 3 0 0 1-3 3H7a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v1h3M12 9h4M12 13h4"/>'
  };
  var icon = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || ICONS.doc) + "</svg>"; };

  var state = { cat: "todos", q: "", data: null, tarifas: null, notaria: null };

  function precio(t) {
    var f = t.tarifa, T = state.tarifas;
    if (f.tipo === "pct") return money(f.valor * T.sbu) + " + IVA" + (f.unidad ? " " + f.unidad : "");
    if (f.tipo === "fija") return money(f.valor) + " + IVA" + (f.unidad ? " " + f.unidad : "");
    if (f.tipo === "cuantia") return "Según cuantía";
    return "Consultar";
  }

  function renderCategorias() {
    $("#categorias").innerHTML = state.data.categorias.map(function (c) {
      var n = state.data.tramites.filter(function (t) { return t.cat === c.id; }).length;
      return '<button class="card reveal" type="button" data-cat="' + c.id + '">' + icon(c.icono) + "<h3>" + esc(c.nombre) + "</h3><p>" + esc(c.resumen) + "</p><small>" + n + " trámites ›</small></button>";
    }).join("");
    $("#categorias").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]"); if (!b) return;
      state.cat = b.dataset.cat; renderChips(); renderLista();
      $("#tramites").scrollIntoView({ behavior: "smooth" });
    });
  }

  function renderChips() {
    var items = [{ id: "todos", nombre: "Todos" }].concat(state.data.categorias);
    $("#chips").innerHTML = items.map(function (c) {
      return '<button class="chip" type="button" data-c="' + c.id + '" aria-pressed="' + (state.cat === c.id) + '">' + esc(c.nombre) + "</button>";
    }).join("");
  }

  function norm(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function renderLista() {
    var q = norm(state.q.trim());
    var res = state.data.tramites.filter(function (t) {
      if (state.cat !== "todos" && t.cat !== state.cat) return false;
      return !q || norm(t.nombre + " " + t.desc + " " + t.req.join(" ")).indexOf(q) !== -1;
    });
    $("#vacio").hidden = res.length > 0;
    $("#lista").innerHTML = res.map(function (t) {
      return "<details><summary><span>" + esc(t.nombre) + '</span><span class="price">' + esc(precio(t)) + '</span></summary><div class="body"><p>' + esc(t.desc) +
        '</p><div class="cols"><div><h4>Requisitos</h4><ul>' + t.req.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") +
        '</ul></div><div><h4>Proceso</h4><ol>' + t.pasos.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ol></div></div></div></details>";
    }).join("");
  }

  function renderFaq() {
    $("#faqList").innerHTML = state.data.faq.map(function (f) {
      return "<details><summary>" + esc(f.q) + '</summary><div class="body"><p>' + esc(f.a) + "</p></div></details>";
    }).join("");
  }

  function setupCalc() {
    var T = state.tarifas, sel = $("#calcTramite");
    $("#anioTarifa").textContent = T.anio; $("#sbuTxt").textContent = money(T.sbu);
    sel.innerHTML = state.data.tramites.map(function (t) { return '<option value="' + t.id + '">' + esc(t.nombre) + "</option>"; }).join("");
    function calc() {
      var t = state.data.tramites.find(function (x) { return x.id === sel.value; }), f = t.tarifa;
      var qty = Math.max(1, parseInt($("#calcQty").value, 10) || 1), base = null, note = "";
      var multi = f.unidad && /por/.test(f.unidad);
      $("#calcQtyWrap").hidden = !multi;
      $("#calcUnit").textContent = multi ? "(" + f.unidad + ")" : "";
      if (f.tipo === "pct") base = f.valor * T.sbu * (multi ? qty : 1);
      else if (f.tipo === "fija") base = f.valor * (multi ? qty : 1);
      else note = f.tipo === "cuantia" ? "La tasa depende de la cuantía del acto. Consulta con la notaría para una cotización exacta." : "Este trámite no tiene un valor fijo publicado aquí. Consulta con la notaría.";
      if (base === null) { $("#rBase").textContent = $("#rIva").textContent = $("#rTotal").textContent = "—"; }
      else { var iva = base * T.iva; $("#rBase").textContent = money(base); $("#rIva").textContent = money(iva); $("#rTotal").textContent = money(base + iva); }
      $("#calcNote").textContent = note;
    }
    sel.addEventListener("change", calc); $("#calcQty").addEventListener("input", calc); calc();
  }

  function renderContacto() {
    var N = state.notaria, rows = "";
    var tels = (N.telefonos || []).filter(function (t) { return !isPlaceholder(t); });
    $("#brandName").textContent = N.nombre;
    $("#heroTitle").textContent = N.eslogan || $("#heroTitle").textContent;
    if (!isPlaceholder(N.notario)) $("#heroNotario").textContent = N.nombre + " · " + N.notario;
    else $("#heroNotario").textContent = N.nombre;
    document.title = N.nombre + " — Trámites, requisitos y tarifas";
    rows += "<div><h3>Dirección</h3><p>" + esc(N.direccion) + "</p></div>";
    rows += "<div><h3>Teléfonos</h3><p>" + (tels.length ? tels.map(function (t) { return '<a href="tel:' + esc(t.replace(/[^+\d]/g, "")) + '">' + esc(t) + "</a>"; }).join("<br>") : "[EDITAR]") + "</p></div>";
    if (!isPlaceholder(N.correo)) rows += '<div><h3>Correo</h3><p><a href="mailto:' + esc(N.correo) + '">' + esc(N.correo) + "</a></p></div>";
    else rows += "<div><h3>Correo</h3><p>[EDITAR]</p></div>";
    rows += "<div><h3>Horario</h3><p>" + esc(N.horario.texto) + "</p></div>";
    var labels = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", x: "X" };
    var soc = Object.keys(N.redes || {}).filter(function (k) { return N.redes[k]; }).map(function (k) { return '<a href="' + esc(N.redes[k]) + '" target="_blank" rel="noopener">' + labels[k] + "</a>"; }).join("");
    if (soc) rows += '<div><h3>Redes</h3><div class="social">' + soc + "</div></div>";
    $("#contactInfo").innerHTML = rows;
    var m = N.mapa;
    $("#mapa").src = "https://www.openstreetmap.org/export/embed.html?bbox=" + [m.lng - .006, m.lat - .004, m.lng + .006, m.lat + .004].join("%2C") + "&layer=mapnik&marker=" + m.lat + "%2C" + m.lng;
    if (N.whatsapp) { var wa = $("#waBtn"); wa.href = "https://wa.me/" + N.whatsapp.replace(/\D/g, ""); wa.target = "_blank"; wa.rel = "noopener"; wa.hidden = false; }
    $("#footTxt").textContent = "© " + new Date().getFullYear() + " " + N.nombre;
    $("#ld").textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Notary", name: N.nombre, address: N.direccion, telephone: tels[0] || undefined, email: isPlaceholder(N.correo) ? undefined : N.correo, openingHours: "Mo-Fr " + N.horario.abre + "-" + N.horario.cierra });
    var tick = function () {
      var d = new Date(), hm = d.getHours() * 60 + d.getMinutes(), p = function (s) { var a = s.split(":"); return +a[0] * 60 + +a[1]; };
      var open = N.horario.dias.indexOf(d.getDay()) !== -1 && hm >= p(N.horario.abre) && hm < p(N.horario.cierra);
      $("#estado").innerHTML = '<span class="dot' + (open ? " on" : "") + '"></span>' + (open ? "Abierto ahora · cierra a las " + N.horario.cierra : "Cerrado ahora · " + esc(N.horario.texto));
    };
    tick(); setInterval(tick, 60000);
  }

  function setupUI() {
    var nav = $("#nav"), menu = $("#menu"), burger = $("#burger");
    window.addEventListener("scroll", function () { nav.classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });
    burger.addEventListener("click", function () { var o = menu.classList.toggle("open"); burger.setAttribute("aria-expanded", o); });
    menu.addEventListener("click", function (e) { if (e.target.tagName === "A") { menu.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") menu.classList.remove("open"); });
    $("#themeBtn").addEventListener("click", function () {
      var cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
      var next = cur === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = next;
      try { localStorage.setItem("tema", next); } catch (e) {}
    });
    $("#buscar").addEventListener("input", function (e) { state.q = e.target.value; renderLista(); });
    $("#chips").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b) return; state.cat = b.dataset.c; renderChips(); renderLista(); });
    observe();
  }

  function observe() {
    var els = document.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { threshold: .12 });
    els.forEach(function (e) { io.observe(e); });
  }

  function get(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  Promise.all([get("data/tramites.json"), get("data/tarifas.json"), get("data/notaria.json")]).then(function (r) {
    state.data = r[0]; state.tarifas = r[1]; state.notaria = r[2];
    renderCategorias(); renderChips(); renderLista(); renderFaq(); setupCalc(); renderContacto(); setupUI();
  }).catch(function (e) {
    document.body.insertAdjacentHTML("afterbegin", '<p style="padding:16px;text-align:center">No se pudieron cargar los datos. Abre el sitio desde un servidor web (no file://). ' + esc(e.message) + "</p>");
    document.querySelectorAll(".reveal").forEach(function (x) { x.classList.add("in"); });
  });
})();
