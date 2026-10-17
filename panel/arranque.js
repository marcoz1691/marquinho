// Red de seguridad del arranque del panel (script clásico, corre antes que panel.js): si algo falla o tarda demasiado,
// la pantalla de carga lo explica y ofrece reintentar, en vez de quedarse en «Cargando el panel…» para siempre.
(function () {
  var errores = [];
  function mostrar(texto) {
    var c = document.getElementById("cargando");
    if (!c || c.hidden) return;
    c.querySelector("span").textContent = texto;
    if (!c.querySelector("button")) {
      var b = document.createElement("button");
      b.className = "btn"; b.type = "button"; b.textContent = "Volver a intentar";
      b.addEventListener("click", function () { location.reload(); });
      c.appendChild(b);
    }
    var d = c.querySelector("small") || c.appendChild(document.createElement("small"));
    d.textContent = errores.length ? "Detalle: " + errores.slice(-2).join(" · ") : "";
  }
  window.addEventListener("error", function (e) {
    var t = e.target && e.target !== window && (e.target.src || e.target.href);
    errores.push(t ? "no se pudo descargar " + t.split("/").pop() : e.message || "error desconocido");
    mostrar("No pudimos abrir el panel.");
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    errores.push(r && r.message ? r.message : String(r));
    mostrar("No pudimos abrir el panel.");
  });
  setTimeout(function () { mostrar("El panel está tardando más de lo normal. Revisa tu conexión y vuelve a intentar."); }, 15000);
})();
