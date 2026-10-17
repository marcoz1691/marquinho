const mercado = 595;
const participacion = document.querySelector("#participacion");
const precio = document.querySelector("#precio");
const participacionValor = document.querySelector("#participacionValor");
const clientes = document.querySelector("#clientes");
const ingreso = document.querySelector("#ingreso");
const lectura = document.querySelector("#lectura");

const dineroCorto = valor => {
  if (valor >= 1_000_000) return `$${(valor / 1_000_000).toLocaleString("es-EC", { maximumFractionDigits: 2 })} millones`;
  return `$${Math.round(valor / 1_000).toLocaleString("es-EC")} mil`;
};

function actualizarModelo() {
  const cuota = Number(participacion.value);
  const mensual = Math.max(0, Number(precio.value) || 0);
  const cantidad = Math.round(mercado * cuota / 100);
  participacionValor.value = `${cuota} %`;
  participacionValor.textContent = `${cuota} %`;
  clientes.textContent = cantidad.toLocaleString("es-EC");
  ingreso.textContent = dineroCorto(cantidad * mensual * 12);
  lectura.textContent = `Con ${cuota} % del mercado ecuatoriano.`;
}

participacion.addEventListener("input", actualizarModelo);
precio.addEventListener("input", actualizarModelo);
document.querySelector("#imprimir").addEventListener("click", () => window.print());

const observador = new IntersectionObserver(entradas => {
  entradas.forEach(entrada => {
    if (!entrada.isIntersecting) return;
    entrada.target.classList.add("visible");
    observador.unobserve(entrada.target);
  });
}, { threshold: .12 });

document.querySelectorAll(".revelar").forEach(elemento => observador.observe(elemento));
actualizarModelo();
