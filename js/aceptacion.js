// Antes del primer mensaje del chat web: dos casillas separadas, términos y tratamiento de datos (LOPDP, art. 8).
// La aceptación se recuerda en este navegador hasta que cambie la versión de alguno de los dos textos.
import { AVISO_PRIVACIDAD, TERMINOS } from "./legal.js";

const CLAVE = "n41-acepta";
let aceptacionEnMemoria = false;
export function aceptado() {
  if (aceptacionEnMemoria) return true;
  try { const a = JSON.parse(localStorage.getItem(CLAVE)); return !!a && a.aviso === AVISO_PRIVACIDAD && a.terminos === TERMINOS; }
  catch (e) { return false; }
}
function guardarAceptacion() {
  aceptacionEnMemoria = true;
  try { localStorage.setItem(CLAVE, JSON.stringify({ aviso: AVISO_PRIVACIDAD, terminos: TERMINOS, en: new Date().toISOString() })); } catch (e) {}
}
// Lo que viaja con cada mensaje para que el servidor deje constancia.
export const banderasAceptacion = () => (aceptado() ? { aceptaTerminos: true, aceptaDatos: true } : {});

// Pone las casillas justo antes del formulario del chat. Devuelve una función que dice si ya se puede enviar.
export function montarAceptacion(form, clase) {
  let caja = null;
  const pintar = () => {
    if (aceptado() || caja) return;
    caja = document.createElement("fieldset");
    caja.className = clase;
    caja.innerHTML = '<legend>Antes de empezar</legend>' +
      '<label><input type="checkbox" name="aceptaTerminos"> <span>Acepto los <a href="terminos.html" target="_blank" rel="noopener">términos y condiciones</a>.</span></label>' +
      '<label><input type="checkbox" name="aceptaDatos"> <span>Autorizo el tratamiento de mis datos según el <a href="privacidad.html" target="_blank" rel="noopener">aviso de privacidad</a>, incluido su procesamiento por proveedores con servidores fuera del Ecuador.</span></label>' +
      '<p class="aceptacion__error" role="alert" hidden>Marca las dos casillas para empezar a chatear.</p>';
    form.before(caja);
  };
  pintar();
  return {
    puedeEnviar() {
      if (aceptado()) return true;
      pintar();
      const ok = [...caja.querySelectorAll("input")].every((i) => i.checked);
      caja.querySelector(".aceptacion__error").hidden = ok;
      if (!ok) { caja.querySelector("input:not(:checked)").focus(); return false; }
      guardarAceptacion(); caja.remove(); caja = null;
      return true;
    },
    // Si el servidor pide aceptar otra vez (cambió la versión o se borró el navegador), se vuelven a mostrar.
    pedirOtraVez() { aceptacionEnMemoria = false; try { localStorage.removeItem(CLAVE); } catch (e) {} pintar(); }
  };
}
