const botonesPeriodo = [...document.querySelectorAll("[data-periodo]")];
const planes = [...document.querySelectorAll(".plan[data-mensual]")];

function mostrarPeriodo(periodo) {
  botonesPeriodo.forEach(boton => boton.setAttribute("aria-pressed", String(boton.dataset.periodo === periodo)));
  planes.forEach(plan => {
    const mensual = Number(plan.dataset.mensual);
    const precio = plan.querySelector(".plan__precio strong");
    const factura = plan.querySelector(".plan__factura");
    if (periodo === "anual") {
      precio.textContent = Math.round(mensual * 10 / 12);
      factura.textContent = `Equivale a USD ${mensual * 10} al año · activación incluida`;
    } else {
      precio.textContent = mensual;
      factura.textContent = "Facturación mensual";
    }
  });
}

botonesPeriodo.forEach(boton => boton.addEventListener("click", () => mostrarPeriodo(boton.dataset.periodo)));

const compartir = document.querySelector("#compartir");
compartir.addEventListener("click", async () => {
  const datos = { title: document.title, text: "Conoce Sofía PreFirma: cada trámite, listo para avanzar.", url: location.href };
  try {
    if (navigator.share) await navigator.share(datos);
    else {
      await navigator.clipboard.writeText(location.href);
      compartir.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i> Enlace copiado';
      setTimeout(() => compartir.innerHTML = '<i class="ph ph-share-network" aria-hidden="true"></i> Compartir propuesta', 2200);
    }
  } catch (error) {
    if (error.name !== "AbortError") compartir.textContent = "Copia el enlace del navegador";
  }
});

document.querySelector("#imprimir").addEventListener("click", () => window.print());

document.querySelectorAll(".elegir-plan").forEach(enlace => {
  enlace.addEventListener("click", () => {
    const nombre = enlace.closest(".plan").dataset.plan;
    document.querySelector("#seleccion-titulo").textContent = `Elegiste ${nombre}. Ahora lo adaptamos a tu notaría.`;
    document.querySelector("#seleccion-texto").textContent = "Primero confirmamos los módulos, límites y canales contigo. Después configuramos una demostración con tus trámites principales y, cuando apruebes la propuesta, coordinamos la activación y el pago.";
  });
});

if ("IntersectionObserver" in window) {
  const observador = new IntersectionObserver(entradas => {
    entradas.forEach(entrada => {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add("visible");
      observador.unobserve(entrada.target);
    });
  }, { threshold: .1 });
  document.querySelectorAll(".revelar").forEach(elemento => observador.observe(elemento));
} else document.querySelectorAll(".revelar").forEach(elemento => elemento.classList.add("visible"));

mostrarPeriodo("mensual");
