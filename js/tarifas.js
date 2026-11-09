// Página «Tarifas»: el tarifario completo calculado con el SBU vigente. Todo sale de data/tarifas.json (o de la hoja)
// más el SBU y el año del panel, así que en enero basta con actualizar esos dos datos.
import { cargarContenido } from "./contenido.js";
import { cargarPrecios, cargarFunciones } from "./precios.js";
import { filasTabla, valorActo, money, norm, AVISO_VALOR } from "./nucleo.js";
import { esc } from "./chat-nucleo.js";

const $ = (id) => document.getElementById(id);
const numero = (n) => n.toLocaleString("es-EC", { maximumFractionDigits: 4 });
const desde = (n) => (n ? money(n + 0.01) : money(0));

function celdasValor(f, medida) {
  if (f.excedente && !f.factor) {
    const texto = f.excedente >= 0.01 ? `${numero(f.excedente * 100)} % del ${medida.toLowerCase()}` : `${medida} × ${numero(f.excedente)}`;
    return `<td class="num">—</td><td class="num" colspan="3">${esc(texto)}</td>`;
  }
  if (f.excedente) return `<td class="num">${numero(f.factor)}</td><td class="num" colspan="3">${money(f.base)} + ${numero(f.excedente)} del excedente sobre ${money(f.desde)}</td>`;
  return `<td class="num">${numero(f.factor)}</td><td class="num">${money(f.base)}</td><td class="num">${money(f.iva)}</td><td class="num total">${money(f.total)}</td>`;
}

function tablaCuantia(T, c, i) {
  const medida = c.medida || "Cuantía";
  const filas = filasTabla(T, c.tabla);
  if (!filas.length) return "";
  const id = "tabla-" + c.tabla;
  return `<section class="tarifa" aria-labelledby="${id}">
    <h3 id="${id}"><span class="tarifa__num">Tabla ${i + 1}</span> ${esc(c.titulo)}</h3>
    ${c.aplica?.length ? `<p class="tarifa__aplica">Se aplica a: ${c.aplica.map(esc).join(" · ")}.</p>` : ""}
    <div class="tarifa__marco" tabindex="0" role="region" aria-label="${esc(c.titulo)}">
      <table>
        <caption class="sr-only">${esc(c.titulo)}: tarifa según ${esc(medida.toLowerCase())} en dólares</caption>
        <thead><tr><th scope="col">${esc(medida)} desde</th><th scope="col">Hasta</th><th scope="col" class="num">N.º SBU</th><th scope="col" class="num">Valor</th><th scope="col" class="num">IVA</th><th scope="col" class="num">Total</th></tr></thead>
        <tbody>${filas.map((f) => `<tr><td>${desde(f.desde)}</td><td>${f.hasta === null ? "En adelante" : money(f.hasta)}</td>${celdasValor(f, medida)}</tr>`).join("")}</tbody>
      </table>
    </div>
    ${c.notas?.length ? `<ul class="tarifa__notas">${c.notas.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
  </section>`;
}

function filaActo(T, it) {
  const v = valorActo(it, T);
  const nombre = `${esc(it.nombre)}${it.unidad ? ` <span class="tarifa__unidad">(${esc(it.unidad)})</span>` : ""}`;
  if (!v.base) return `<tr data-buscar="${esc(norm(it.nombre))}"><th scope="row">${nombre}</th><td class="num total" colspan="3">Sin costo</td></tr>`;
  return `<tr data-buscar="${esc(norm(it.nombre))}"><th scope="row">${nombre}</th><td class="num">${money(v.base)}</td><td class="num">${money(v.iva)}</td><td class="num total">${money(v.total)}</td></tr>`;
}

function tablaLista(T, l) {
  const id = "lista-" + l.id;
  return `<section class="tarifa tarifa--lista" aria-labelledby="${id}">
    <h3 id="${id}">${esc(l.titulo)}</h3>
    ${l.nota ? `<p class="tarifa__aplica">${esc(l.nota)}</p>` : ""}
    <div class="tarifa__marco" tabindex="0" role="region" aria-label="${esc(l.titulo)}">
      <table>
        <caption class="sr-only">${esc(l.titulo)}</caption>
        <thead><tr><th scope="col">Acto</th><th scope="col" class="num">Valor</th><th scope="col" class="num">IVA</th><th scope="col" class="num">Total</th></tr></thead>
        <tbody>${l.items.map((it) => filaActo(T, it)).join("")}</tbody>
      </table>
    </div>
  </section>`;
}

function pintar(T, N) {
  const t = T.tarifario || {};
  const iva = numero(T.iva * 100);
  const [indeterminada, ...otras] = t.listas || [];
  $("anio").textContent = T.anio;
  document.title = `Tarifas notariales ${T.anio} | Notaría 41 de Quito`;
  $("impNotario").textContent = [N.notario, N.cargo].filter(Boolean).join(" · ");
  $("impContacto").textContent = [N.direccion, (N.telefonos || []).join(" / "), N.correo].filter(Boolean).join(" · ");
  $("contenido").innerHTML = `
    <p class="tarifario__lead">Valores vigentes en ${esc(T.anio)} según la Resolución 216-2017 del Consejo de la Judicatura y sus reformas, calculados sobre el Salario Básico Unificado (SBU) de <strong>${money(T.sbu)}</strong>. A cada valor se suma el IVA del ${iva} %.</p>
    <div class="tarifario__acciones">
      <button class="btn btn--primary" id="descargar" type="button"><i class="ph ph-printer" aria-hidden="true"></i> Descargar PDF</button>
      <a class="btn" href="./#calculadora"><i class="ph ph-calculator" aria-hidden="true"></i> Calcular mi trámite</a>
    </div>
    <p class="tarifario__aviso">${esc(AVISO_VALOR)}</p>
    <nav class="tarifario__indice" aria-label="Secciones del tarifario">
      <a href="#cuantia">Cuantía determinada</a>${indeterminada ? `<a href="#indeterminada">Cuantía indeterminada</a>` : ""}${otras.length ? `<a href="#otros">Sociedades, certificaciones y propiedad horizontal</a>` : ""}${t.exenciones?.length ? `<a href="#exenciones">Exenciones</a>` : ""}
    </nav>
    <section class="tarifario__seccion" id="cuantia" aria-labelledby="tCuantia">
      <h2 id="tCuantia">Cuantía determinada</h2>
      <p>El valor depende del monto del contrato o del avalúo. Para tu caso exacto, usa la <a href="./#calculadora">calculadora</a>.</p>
      ${(t.cuantia || []).map((c, i) => tablaCuantia(T, c, i)).join("")}
    </section>
    ${indeterminada ? `<section class="tarifario__seccion" id="indeterminada" aria-labelledby="tIndeterminada">
      <h2 id="tIndeterminada">Cuantía indeterminada</h2>
      <p>Actos con un valor fijo, sin importar el monto.</p>
      <label class="tarifario__buscar">Busca un acto<input id="buscar" type="search" autocomplete="off" placeholder="Ej.: poder, declaración, testamento"></label>
      <p class="tarifario__vacio" id="vacio" role="status"></p>
      ${tablaLista(T, { ...indeterminada, titulo: "Actos de cuantía indeterminada" })}
    </section>` : ""}
    ${otras.length ? `<section class="tarifario__seccion" id="otros" aria-labelledby="tOtros">
      <h2 id="tOtros">Sociedades, certificaciones y propiedad horizontal</h2>
      ${otras.map((l) => tablaLista(T, l)).join("")}
    </section>` : ""}
    ${t.exenciones?.length ? `<section class="tarifario__seccion" id="exenciones" aria-labelledby="tExenciones">
      <h2 id="tExenciones">Exenciones</h2>
      ${t.exenciones.map((e) => `<div class="exencion"><h3>${esc(e.titulo)}</h3><p>${esc(e.texto)}</p>${e.items?.length ? `<ul>${e.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>`).join("")}
    </section>` : ""}`;
  $("pie").textContent = `${N.nombre || "Notaría 41 de Quito"} · Tarifas ${T.anio} · SBU ${money(T.sbu)} · Consultado el ${new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeZone: "America/Guayaquil" }).format(new Date())}`;
  $("estado").hidden = true;
  $("contenido").hidden = false;
  $("descargar").addEventListener("click", () => window.print());
  const buscar = $("buscar");
  if (buscar) buscar.addEventListener("input", () => {
    const q = norm(buscar.value.trim());
    const filas = [...document.querySelectorAll("#indeterminada tbody tr")];
    let visibles = 0;
    filas.forEach((tr) => { tr.hidden = !!q && !tr.dataset.buscar.includes(q); if (!tr.hidden) visibles++; });
    $("vacio").textContent = visibles ? "" : "No encontramos ese acto. Revisa las otras secciones o escríbenos.";
  });
}

function noDisponible() {
  $("estado").innerHTML = `El tarifario no está disponible por ahora. Puedes calcular el valor de tu trámite en la <a href="./#calculadora">calculadora de la portada</a>.`;
}

Promise.all([cargarFunciones(), cargarContenido().then(cargarPrecios)]).then(([f, r]) => {
  if (!f.sitio) return location.replace("mantenimiento.html");
  if (!f.tarifario) return noDisponible();
  pintar(r.tarifas, r.notaria || {});
}).catch(() => {
  $("estado").innerHTML = `No pudimos cargar el tarifario. Inténtalo de nuevo o usa la <a href="./#calculadora">calculadora de la portada</a>.`;
});
