// Aplica antes de pintar el tema que la persona eligió en el botón de la portada; si no eligió, manda la preferencia del sistema.
(function () {
  try {
    var t = localStorage.getItem("n41-tema");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
