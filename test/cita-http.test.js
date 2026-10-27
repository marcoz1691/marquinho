import { it, expect, vi, beforeEach, describe } from 'vitest';
import { crearManejadorCita } from '../api/_lib/cita-http.js';
import { consumirVinculo } from '../api/_lib/vinculos.js';
import { crearAlmacenMemoria } from '../api/_lib/almacen-memoria.js';
const C={notaria:{direccion:'Quito',horario:{dias:[1,2,3,4,5],abre:'08:00',cierra:'17:00',texto:'Lunes a viernes'},citas:{porHora:2,feriados:[]}},data:{tramites:[{id:'poder',nombre:'Poder',cat:'poderes',req:['Cédula'],tarifa:{tipo:'fija',valor:10}},{id:'revision',nombre:'Revisión',revision:true,req:[],tarifa:{tipo:'consultar'}}]},tarifas:{iva:0.15}};
let almacen, avisar, api;
const cuerpo={nombre:'Ana Pérez',celular:'0991234567',tramiteId:'poder',fecha:'2026-10-12',hora:'09:30',aceptaTerminos:true,aceptaDatos:true,sitio:''};
const req=(b=cuerpo,ip='1')=>new Request('https://n.ec/api/cita',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body:JSON.stringify(b)});
beforeEach(()=>{almacen=crearAlmacenMemoria();avisar=vi.fn();api=crearManejadorCita({almacen,avisar,contenido:async()=>C,ahora:()=>new Date('2026-10-12T12:00:00Z')});});
it('GET entrega disponibilidad, trámites y no-store',async()=>{const r=await api.GET(new Request('https://n.ec/api/cita'));expect(r.headers.get('Cache-Control')).toBe('no-store');expect(await r.json()).toMatchObject({dias:expect.any(Array),tramites:[{id:'poder',nombre:'Poder',cat:'poderes'},{id:'revision',nombre:'Revisión'}]});});
it.each([{nombre:'A'},{nombre:'A'.repeat(81)},{celular:'123'},{celular:'593812345678'},{aceptaTerminos:false},{aceptaDatos:false},{tramiteId:'inventado'},{nota:'a'.repeat(201)},{fecha:'2026-02-30'},{hora:'25:00'}])('valida %j',async cambio=>{expect((await api.POST(req({...cuerpo,...cambio}))).status).toBe(400);});
it('campo trampa no guarda datos',async()=>{expect((await api.POST(req({...cuerpo,sitio:'robot'}))).status).toBe(201);expect(await almacen.conversaciones()).toEqual([]);expect(avisar).not.toHaveBeenCalled();});
it('confirma, registra consentimiento y contacto, avisa hoy y rechaza cita activa',async()=>{const r=await api.POST(req());expect(r.status).toBe(201);const {resumen}=await r.json();expect(resumen).toMatchObject({estado:'confirmada',subirDocumentos:false,codigo:expect.stringMatching(/^\d{4}$/)});const conv=await almacen.conversacionPorTelefono('form:593991234567');expect(conv).toMatchObject({consentimiento:true,nombre:'Ana Pérez',consentimientoAviso:expect.any(String)});expect((await almacen.solicitudesCita(conv.id))[0]).toMatchObject({contacto:'593991234567'});expect(avisar).toHaveBeenCalledWith(expect.stringContaining('(formulario)'));const repetida=await api.POST(req());expect(repetida.status).toBe(409);const cuerpoRepetida=JSON.stringify(await repetida.json());expect(cuerpoRepetida).toContain('Ya tienes una cita activa con este celular');expect(cuerpoRepetida).not.toContain(resumen.codigo);expect(cuerpoRepetida).not.toContain('09:30');});
it('queda pendiente si requiere revisión; desconocido queda confirmado',async()=>{let r=await api.POST(req({...cuerpo,tramiteId:'revision',fecha:'2026-10-13'}));expect((await r.json()).resumen.estado).toBe('pendiente');expect(avisar).toHaveBeenCalledOnce();r=await api.POST(req({...cuerpo,celular:'0991234568',tramiteId:null,fecha:'2026-10-13'}));expect((await r.json()).resumen.estado).toBe('confirmada');expect(avisar).toHaveBeenCalledOnce();});
it('409 devuelve días renovados si se ocupó la hora',async()=>{await almacen.guardarAjuste('citas.porHora','1');await api.POST(req());const r=await api.POST(req({...cuerpo,celular:'0991234568',hora:'09:00'}));expect(r.status).toBe(409);const b=await r.json();expect(b.error).toBe('Esa hora acaba de ocuparse. Elige otra.');expect(b.dias[0].horas).not.toContain('09:30');});
it.each(['consultas','porIp','porCelular','porDia'])('limita %s con 429',async clave=>{const limites={consultas:120,porIp:5,porCelular:3,porDia:200,[clave]:0};const a=crearManejadorCita({almacen,contenido:async()=>C,limites,ahora:()=>new Date('2026-10-12T12:00:00Z')});expect((await (clave==='consultas'?a.GET(new Request('https://n.ec/api/cita')):a.POST(req()))).status).toBe(429);});

it("GET entrega los nombres de las categorías para agrupar la lista de trámites", async () => {
  const conCategorias = { ...C, data: { ...C.data, categorias: [{ id: "poderes", nombre: "Poderes", desc: "no hace falta" }] } };
  const a = crearManejadorCita({ almacen, contenido: async () => conCategorias, ahora: () => new Date("2026-10-12T12:00:00Z") });
  expect((await (await a.GET(new Request("https://n.ec/api/cita"))).json()).categorias).toEqual([{ id: "poderes", nombre: "Poderes" }]);
});
it.each(["agenda", "sitio"])("bloquea GET y POST con %s apagada", async id => {
 await almacen.guardarAjuste("funcion." + id, "0", "admin");
 for (const r of [await api.GET(new Request("https://n.ec/api/cita")), await api.POST(req())]) { expect(r.status).toBe(503); expect((await r.json()).apagada).toBe(true); }
});
it("cuenta conversación y cita de formulario", async () => {
 await api.POST(req());
 const filas = await almacen.metricas("2026-10-12", "2026-10-12");
 for (const clave of ["conv.nueva.formulario", "cita.creada.formulario"]) expect(filas).toContainEqual({ fecha: "2026-10-12", clave, valor: 1 });
});

it("si no se pueden leer los ajustes (cupos y bloqueos), no agenda a ciegas", async () => {
  const roto = { ...almacen, ajustes: async () => { throw new Error("sin base"); } };
  const a = crearManejadorCita({ almacen: roto, avisar, contenido: async () => C, ahora: () => new Date("2026-10-12T12:00:00Z") });
  const r = await a.POST(req()).catch(() => null);
  expect(r === null || r.status >= 500).toBe(true);
  expect(await almacen.citasEntre("2026-10-01", "2026-10-31")).toEqual([]);
});
it('la cita deja constancia en el historial de consentimientos sin guardar el celular en claro',async()=>{expect((await api.POST(req())).status).toBeLessThan(300);const [c]=await almacen.consentimientos();expect(c).toMatchObject({canal:'formulario',texto:expect.stringContaining('términos')});expect(JSON.stringify(c)).not.toContain('991234567');});

describe("enlace para guardar el trámite (portal)", () => {
  it("con el portal apagado responde igual que siempre: sin vinculo", async () => {
    const r = await api.POST(req());
    expect(r.status).toBe(201);
    const b = await r.json();
    expect(Object.keys(b)).toEqual(["resumen"]);
    expect(JSON.stringify(b)).not.toContain("vinculo");
  });
  it("con el portal encendido devuelve un token de un solo uso que vence en 24 horas y registra el evento", async () => {
    await almacen.guardarAjuste("funcion.portal", "1");
    const b = await (await api.POST(req())).json();
    expect(Object.keys(b)).toEqual(["resumen", "vinculo"]);
    expect(b.resumen.vinculo).toBeUndefined();
    expect(b.vinculo.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b.vinculo.expira).toBe(Date.parse("2026-10-12T12:00:00Z") + 24 * 3600e3);
    const cliente = await almacen.crearCliente({ notariaId: "notaria41", email: "ana@ejemplo.ec", emailVerificadoEn: new Date().toISOString() });
    const id = await consumirVinculo({ almacen, notariaId: "notaria41", clienteId: cliente.id, token: b.vinculo.token, ahora: Date.parse("2026-10-12T13:00:00Z") });
    expect(id).toBeTruthy();
    const tramite = await almacen.tramiteDeCliente("notaria41", cliente.id, id);
    expect(tramite.codigo).toBe(b.resumen.codigo);
    expect(tramite.eventos.map((e) => e.tipo)).toEqual(["creada", "vinculada"]);
    expect(tramite.eventos[0]).toMatchObject({ texto: "Recibimos tu solicitud de cita.", actor: "cliente" });
    expect(await consumirVinculo({ almacen, notariaId: "notaria41", clienteId: cliente.id, token: b.vinculo.token, ahora: Date.parse("2026-10-12T13:00:00Z") })).toBeNull();
  });
  it("nunca entrega vinculo en la trampa, en el 409 ni en el 429", async () => {
    await almacen.guardarAjuste("funcion.portal", "1");
    expect(await (await api.POST(req({ ...cuerpo, sitio: "robot" }))).json()).not.toHaveProperty("vinculo");
    await api.POST(req());
    const repetida = await api.POST(req());
    expect(repetida.status).toBe(409);
    expect(await repetida.json()).not.toHaveProperty("vinculo");
    const a = crearManejadorCita({ almacen, contenido: async () => C, limites: { consultas: 120, porIp: 0, porCelular: 3, porDia: 200 }, ahora: () => new Date("2026-10-12T12:00:00Z") });
    const limitada = await a.POST(req({ ...cuerpo, celular: "0991234568" }));
    expect(limitada.status).toBe(429);
    expect(await limitada.json()).not.toHaveProperty("vinculo");
  });
  it("si no se puede emitir el enlace, la cita igual queda creada", async () => {
    await almacen.guardarAjuste("funcion.portal", "1");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    almacen.crearVinculacion = async () => { throw new Error("sin base"); };
    const r = await api.POST(req());
    expect(r.status).toBe(201);
    expect(await r.json()).not.toHaveProperty("vinculo");
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});

describe("corte del mediodía para el mismo día", () => {
  const tarde = () => new Date("2026-10-12T18:30:00Z"); // lunes 13:30 en Quito
  it("después de las 12:00 hoy ya no hay horas y el siguiente día hábil sí", async () => {
    const a = crearManejadorCita({ almacen, contenido: async () => C, ahora: tarde });
    const b = await (await a.GET(new Request("https://n.ec/api/cita"))).json();
    expect(b.dias[0].fecha).toBe("2026-10-13");
    expect(b.hoyCerrado).toEqual({ corte: "12:00" });
  });
  it("antes de las 12:00 hoy sigue disponible y no hay aviso", async () => {
    const b = await (await api.GET(new Request("https://n.ec/api/cita"))).json();
    expect(b.dias[0].fecha).toBe("2026-10-12");
    expect(b.hoyCerrado).toBeNull();
  });
  it("rechaza agendar para hoy pasado el corte y devuelve los días disponibles", async () => {
    const a = crearManejadorCita({ almacen, contenido: async () => C, ahora: tarde });
    const r = await a.POST(req({ ...cuerpo, hora: "16:00" }));
    expect(r.status).toBe(409);
    const b = await r.json();
    expect(b.error).toMatch(/hasta las 12:00/);
    expect(b.dias[0].fecha).toBe("2026-10-13");
  });
  it("el viernes después del corte, el siguiente día hábil es el lunes", async () => {
    const a = crearManejadorCita({ almacen, contenido: async () => C, ahora: () => new Date("2026-10-16T18:30:00Z") });
    expect((await (await a.GET(new Request("https://n.ec/api/cita"))).json()).dias[0].fecha).toBe("2026-10-19");
  });
});
