// Núcleo compartido por la web (navegador) y el asistente de WhatsApp (servidor):
// lectura de la hoja de contenido y cálculo de tarifas. Sin DOM ni dependencias.

export const norm = function (s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };
export const money = function (n) { return "$" + n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
// Pasar por texto evita que 25,305 quede como 25,30499999… y se redondee hacia abajo.
const redondear = function (n) { return Math.round(Number(n.toFixed(8) + "e2")) / 100; };

// CSV (RFC 4180): comillas, comas y saltos de línea dentro de celdas.
export function parseCSV(text) {
  var rows = [], row = [], f = "", q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); rows.push(row); row = []; f = "";
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// Filas a objetos usando claves normalizadas del encabezado ("Requisitos (uno por línea)" -> "requisitosunoporlinea").
function objetos(csv) {
  var rows = parseCSV(csv || "").filter(function (r) { return r.some(function (c) { return c.trim(); }); });
  var keys = (rows.shift() || []).map(function (h) { return norm(h).replace(/[^a-z0-9]/g, ""); });
  return rows.map(function (r) {
    var o = {};
    keys.forEach(function (k, i) { o[k] = (r[i] || "").trim(); });
    o.get = function (pref) { for (var k in o) if (k.indexOf(pref) === 0 && typeof o[k] === "string") return o[k]; return ""; };
    return o;
  });
}

const si = function (v) { return /^(s[ií]|x|true|1)/i.test(String(v).trim()); };
const visible = function (o) { var m = o.get("mostrar"); return !m || si(m); };

// Números como los publica Sheets en español: "0,35", "1.79", "10.000", "1.000.000,50".
export function num(v) {
  var s = String(v).replace(/[^\d,.\-]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  var n = parseFloat(s); return isNaN(n) ? null : n;
}

// Montos que escribe una persona: "85.000", "85,000", "1.250.000,50", "10000.01".
// Un separador repetido, o uno solo seguido de exactamente tres dígitos, es de miles; si hay ambos, el último es el decimal.
export function montoEscrito(v) {
  var s = String(v || "").replace(/[^\d,.]/g, "");
  if (!/\d/.test(s)) return null;
  var ultimo = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  var hayAmbos = s.indexOf(",") > -1 && s.indexOf(".") > -1;
  var sep = s.charAt(ultimo), veces = s.split(sep).length - 1;
  var decimal = ultimo > -1 && (hayAmbos || (veces === 1 && s.length - ultimo - 1 !== 3));
  var entero = (decimal ? s.slice(0, ultimo) : s).replace(/[,.]/g, "");
  return parseFloat(entero + (decimal ? "." + s.slice(ultimo + 1) : "")) || 0;
}

// ¿Está abierta la notaría en `fecha`? Siempre con la hora de Quito, aunque el visitante esté en otra zona.
export function estaAbierto(horario, fecha) {
  var partes = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Guayaquil", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(fecha).forEach(function (p) { partes[p.type] = p.value; });
  var dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.weekday);
  var ahora = +partes.hour * 60 + +partes.minute;
  return horario.dias.indexOf(dia) !== -1 && ahora >= minutos(horario.abre) && ahora < minutos(horario.cierra);
}

// Fechas "2026-11-02" o "2/11/2026" (día primero) a AAAA-MM-DD.
export function fecha(v) {
  var m = String(v).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/), d;
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  d = String(v).trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  return d ? d[3] + "-" + ("0" + d[2]).slice(-2) + "-" + ("0" + d[1]).slice(-2) : "";
}

// Horas de la hoja ("8:00", "08:00", "17:00:00", "5:00 PM") a minutos desde medianoche y a "HH:MM".
export function minutos(v) {
  var m = String(v || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?\s*m\.?)?$/i);
  if (!m) return null;
  var h = +m[1] % 24, pm = m[3] && /p/i.test(m[3]);
  if (m[3]) h = (h % 12) + (pm ? 12 : 0);
  return h * 60 + +m[2];
}
export function hhmm(v) {
  var n = minutos(v);
  return n === null ? String(v || "") : ("0" + Math.floor(n / 60)).slice(-2) + ":" + ("0" + (n % 60)).slice(-2);
}

const lineas = function (v) { return String(v).split(/\n+/).map(function (s) { return s.replace(/^[\s•\-–]+/, "").trim(); }).filter(Boolean); };
const tablaKey = function (v) {
  var n = norm(v);
  return /transfer/.test(n) ? "transferencia" : /promesa|cesion/.test(n) ? "promesa" : /hipotec/.test(n) ? "hipoteca" : /socied/.test(n) ? "sociedades" : "";
};

// Convierte las pestañas CSV de la hoja en { data, tarifas, notaria }, usando `base` (JSON locales) para lo que falte.
export function desdeHoja(tabs, base) {
  var categorias = objetos(tabs.categorias).filter(visible).map(function (o) {
    return { id: o.get("codigo"), nombre: o.get("nombre"), resumen: o.get("resumen") };
  }).filter(function (c) { return c.id && c.nombre; });

  var tramites = objetos(tabs.tramites).filter(visible).map(function (o) {
    var tipoTxt = norm(o.get("tipo")), valor = num(o.get("valor")), unidad = o.get("unidad");
    var tipo = /porc/.test(tipoTxt) ? "pct" : /fij|valor/.test(tipoTxt) ? "fija" : /cuant/.test(tipoTxt) ? "cuantia" : "consultar";
    var tarifa = { tipo: tipo };
    if ((tipo === "pct" || tipo === "fija") && valor === null) tarifa.tipo = "consultar";
    else if (tipo === "pct") tarifa.valor = valor / 100;
    else if (tipo === "fija") tarifa.valor = valor;
    if (unidad) tarifa.unidad = unidad;
    if (tipo === "cuantia") tarifa.tabla = tablaKey(o.get("tabla")) || "transferencia";
    var t = { id: norm(o.get("codigo") || o.get("tramite")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), cat: o.get("categoria"),
      nombre: o.get("tramite"), desc: o.get("descripcion"), req: lineas(o.get("requisitos")), pasos: lineas(o.get("pasos")), tarifa: tarifa };
    if (o.get("nota")) t.nota = o.get("nota");
    // Sin la columna de revisión en la hoja, se conserva la marca local: nunca confirmar solo un trámite largo por omisión.
    var conColumna = Object.keys(o).some(function (k) { return k.indexOf("revision") === 0; });
    var local = (base.data.tramites || []).find(function (x) { return x.id === t.id; }) || {};
    if (conColumna ? /^s/.test(norm(o.get("revision"))) : local.revision) t.revision = true;
    return t;
  }).filter(function (t) { return t.nombre && t.cat; });

  if (!tramites.length || !categorias.length) throw new Error("La hoja no tiene trámites o categorías válidos");

  var faq = tabs.preguntas ? objetos(tabs.preguntas).filter(visible).map(function (o) { return { q: o.get("pregunta"), a: o.get("respuesta") }; }).filter(function (f) { return f.q && f.a; }) : base.data.faq;
  var avisos = tabs.avisos ? objetos(tabs.avisos).filter(visible).map(function (o) { return { msg: o.get("mensaje"), desde: fecha(o.get("desde")), hasta: fecha(o.get("hasta")) }; }).filter(function (a) { return a.msg; }) : [];

  // Configuración: pares Dato / Valor sobre los datos locales.
  var C = {};
  if (tabs.configuracion) objetos(tabs.configuracion).forEach(function (o) { C[norm(o.get("dato")).replace(/[^a-z0-9]/g, "")] = o.get("valor"); });
  var N = JSON.parse(JSON.stringify(base.notaria)), T = JSON.parse(JSON.stringify(base.tarifas));
  var set = function (k, fn) { if (C[k]) fn(C[k]); };
  set("nombre", function (v) { N.nombre = v; });
  set("notario", function (v) { N.notario = v; });
  set("eslogan", function (v) { N.eslogan = v; });
  set("direccion", function (v) { N.direccion = v; });
  set("telefonos", function (v) { N.telefonos = v.split(/[,;\/]+/).map(function (s) { return s.trim(); }).filter(Boolean); });
  set("whatsapp", function (v) { N.whatsapp = v; });
  set("correo", function (v) { N.correo = v; });
  set("horario", function (v) { N.horario.texto = v; });
  set("abre", function (v) { N.horario.abre = hhmm(v); });
  set("cierra", function (v) { N.horario.cierra = hhmm(v); });
  set("diasdeatencion", function (v) { N.horario.dias = v.split(/[^\d]+/).filter(Boolean).map(Number); });
  set("latitud", function (v) { if (num(v) !== null) N.mapa.lat = num(v); });
  set("longitud", function (v) { if (num(v) !== null) N.mapa.lng = num(v); });
  set("enlaceparaagendar", function (v) { N.agenda = v; });
  set("nombredelasistente", function (v) { N.asistente = v; });
  set("citasporhora", function (v) { if (num(v)) N.citas = Object.assign({}, N.citas, { porHora: num(v) }); });
  set("feriados", function (v) { N.citas = Object.assign({}, N.citas, { feriados: v.split(/[,;\n]+/).map(fecha).filter(Boolean) }); });
  ["facebook", "instagram", "tiktok", "linkedin", "x"].forEach(function (k) { set(k, function (v) { N.redes[k] = v; }); });
  set("sbu", function (v) { if (num(v)) T.sbu = num(v); });
  set("iva", function (v) { if (num(v) !== null) T.iva = num(v) > 1 ? num(v) / 100 : num(v); });
  set("anodetarifas", function (v) { T.anio = v; });

  if (tabs.tablas) {
    var tablas = {};
    objetos(tabs.tablas).forEach(function (o) {
      var k = tablaKey(o.get("tabla")), f = num(o.get("factor"));
      if (!k || f === null) return;
      (tablas[k] = tablas[k] || []).push([num(o.get("hasta")), f]);
    });
    Object.keys(tablas).forEach(function (k) {
      T.tablas[k] = tablas[k].sort(function (a, b) { return (a[0] === null) - (b[0] === null) || a[0] - b[0]; });
    });
  }
  return { data: { categorias: categorias, tramites: tramites, faq: faq, avisos: avisos }, tarifas: T, notaria: N };
}

// URL de cada pestaña según la configuración de data/config.json.
export function urlPestana(G, gid) {
  return G.documento ? "https://docs.google.com/spreadsheets/d/" + G.documento + "/export?format=csv&gid=" + gid
    : "https://docs.google.com/spreadsheets/d/e/" + G.publicado + "/pub?gid=" + gid + "&single=true&output=csv";
}

// Tarifa de un trámite. opciones: { monto } para cuantía, { cantidad } para tarifas por unidad.
// Devuelve { base, iva, total } en USD (null si no se puede calcular) y, para cuantía, { factor, desde, hasta }.
export function calcularTarifa(t, T, opciones) {
  var f = t.tarifa, o = opciones || {}, r = { base: null, iva: null, total: null };
  var multi = !!(f.unidad && /por/.test(f.unidad)), qty = Math.max(1, Math.floor(o.cantidad || 1));
  if (f.tipo === "pct") r.base = f.valor * T.sbu * (multi ? qty : 1);
  else if (f.tipo === "fija") r.base = f.valor * (multi ? qty : 1);
  else if (f.tipo === "cuantia" && o.monto > 0) {
    var rows = (T.tablas || {})[f.tabla] || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === null || o.monto <= rows[i][0]) {
        r.factor = rows[i][1]; r.hasta = rows[i][0]; r.desde = i ? rows[i - 1][0] : 0;
        r.base = r.factor * T.sbu;
        break;
      }
    }
  }
  if (r.base !== null) { r.base = redondear(r.base); r.iva = redondear(r.base * T.iva); r.total = redondear(r.base + r.iva); }
  return r;
}

// Documentos habilitantes: se cobran aparte, por hoja, con el precio de su propio trámite.
export const AVISO_HABILITANTES = "Este valor no incluye documentos habilitantes, como copias certificadas, compulsas o materializaciones de documentos electrónicos.";
export const HABILITANTES = [
  { id: "copias", tramite: "copias-certificadas", nombre: "Copias certificadas o compulsas" },
  { id: "materializaciones", tramite: "certificacion-electronica", nombre: "Materialización de documentos electrónicos" }
];

// Tarifa del trámite más los habilitantes que la persona agregue. extras: { copias: n, materializaciones: m }.
// Devuelve { tramite, habilitantes: [{ id, nombre, cantidad, base, iva, total }], base, iva, total } (null si el trámite no se puede calcular).
export function calcularConHabilitantes(t, T, opciones, extras, tramites) {
  var r = calcularTarifa(t, T, opciones), e = extras || {}, lista = [];
  HABILITANTES.forEach(function (h) {
    var n = Math.floor(Number(e[h.id]));
    n = isFinite(n) ? Math.min(200, Math.max(0, n)) : 0;
    var th = (tramites || []).find(function (x) { return x.id === h.tramite; });
    if (!n || !th) return;
    var p = calcularTarifa(th, T, { cantidad: n });
    if (p.total === null) return;
    lista.push({ id: h.id, nombre: h.nombre, cantidad: n, base: p.base, iva: p.iva, total: p.total });
  });
  var suma = function (k) { return lista.reduce(function (a, h) { return redondear(a + h[k]); }, r[k]); };
  var ok = r.total !== null;
  return { tramite: r, habilitantes: lista, base: ok ? suma("base") : null, iva: ok ? suma("iva") : null, total: ok ? suma("total") : null };
}

export function precioTexto(t, T) {
  var f = t.tarifa, u = f.unidad ? " " + f.unidad : "";
  if (f.tipo === "pct") return money(f.valor * T.sbu) + " + IVA" + u;
  if (f.tipo === "fija") return money(f.valor) + " + IVA" + u;
  if (f.tipo === "cuantia") return "Según cuantía";
  return "Consultar";
}
