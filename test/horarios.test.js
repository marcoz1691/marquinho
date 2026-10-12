import { describe, it, expect } from "vitest";
import { crearAlmacenMemoria } from "../api/_lib/almacen-memoria.js";
import { horasLibres, elegirMatricero, reglasCitas, diasDisponibles } from "../api/_lib/citas.js";
import { crearPanel } from "../api/_lib/panel.js";
const C = { notaria: { horario: { dias: [1,2,3,4,5], abre: "08:00", cierra: "17:00" }, citas: { feriados: ["2026-10-13"] } }, data: { tramites: [] } };
const fecha = "2026-10-12", ahora = new Date("2026-10-11T12:00:00Z");
const persona = (email, horario = { 1: [["08:00","13:00"],["14:00","17:00"]] }) => ({ email, nombre: email, rol: "personal", horario });
const opciones = almacen => ({ almacen, C, fecha, ahora });
describe("horarios de matriceros", () => {
  it("cubre todo el intervalo y respeta el almuerzo y cierre", async () => {
    const a = crearAlmacenMemoria({ personal: [persona("a@test.ec")] });
    const libres = await horasLibres(opciones(a));
    expect(libres).toContain("11:30"); expect(libres).not.toContain("12:00");
    expect(libres).toContain("15:30"); expect(libres).not.toContain("16:00");
  });
  it("resta citas asignadas y sin asignar por cruce, excluye citas cerradas", async () => {
    const a = crearAlmacenMemoria({ personal: [persona("a@test.ec"),persona("b@test.ec")] });
    await a.crearSolicitudCita({ fecha, hora: "09:00", asignadaA: "a@test.ec" });
    expect(await elegirMatricero({ ...opciones(a), hora: "10:00" })).toBe("b@test.ec");
    await a.crearSolicitudCita({ fecha, hora: "09:30" });
    expect(await horasLibres(opciones(a))).not.toContain("10:00");
    expect(await horasLibres({ ...opciones(a), ajustes: { "citas.duracionMin": "30" } })).toContain("10:00");
  });
  it("respeta ausencias, bloqueos y feriados", async () => {
    const a = crearAlmacenMemoria({ personal: [persona("a@test.ec")] });
    await a.guardarAusencias("a@test.ec", [{ desde: fecha, hasta: fecha, motivo: "" }]);
    expect(await horasLibres(opciones(a))).toEqual([]);
    await a.guardarAusencias("a@test.ec", []);
    expect(await horasLibres({ ...opciones(a), ajustes: { "citas.bloqueos": JSON.stringify([{ fecha, hora: "09:00" }]) } })).not.toContain("09:30");
    expect(await diasDisponibles({ ...opciones(a), desde: "2026-10-13", dias: 1 })).toEqual([]);
  });
  it("respalda el cupo fijo incluso cerca del cierre", async () => {
    const a = crearAlmacenMemoria({ personal: [persona("a@test.ec", null)] });
    expect(await horasLibres(opciones(a))).toContain("16:30");
    expect(await elegirMatricero({ ...opciones(a), hora: "09:00" })).toBeNull();
    await a.crearSolicitudCita({ fecha, hora: "09:00" }); await a.crearSolicitudCita({ fecha, hora: "09:30" });
    expect(await horasLibres(opciones(a))).not.toContain("09:00"); expect(await horasLibres(opciones(a))).toContain("10:00");
  });
  it("desempata por primera cita más tarde y correo", async () => {
    const a = crearAlmacenMemoria({ personal: [persona("b@test.ec"),persona("a@test.ec")] });
    expect(await elegirMatricero({ ...opciones(a), hora: "08:00" })).toBe("a@test.ec");
    await a.crearSolicitudCita({ fecha, hora: "14:00", asignadaA: "a@test.ec" });
    await a.crearSolicitudCita({ fecha, hora: "15:00", asignadaA: "b@test.ec" });
    expect(await elegirMatricero({ ...opciones(a), hora: "08:00" })).toBe("b@test.ec");
  });
  it("lecturas estrictas y duración válida", async () => {
    const a = crearAlmacenMemoria(); a.matriceros = async () => { throw Error("lectura"); };
    await expect(horasLibres(opciones(a))).rejects.toThrow("lectura");
    const b = crearAlmacenMemoria(); b.ajustes = async () => { throw Error("ajustes"); };
    await expect(horasLibres(opciones(b))).rejects.toThrow("ajustes");
    for (const valor of [0,31,241,"x"]) expect(reglasCitas(C, { "citas.duracionMin": valor }).duracionMin).toBe(90);
  });
});
describe("panel horarios", () => {
  const preparar = () => {
    const almacen = crearAlmacenMemoria({ personal: [persona("p@test.ec"), { ...persona("admin@test.ec"), rol: "admin" }, { ...persona("n@test.ec"), rol: "notario" }] });
    return { almacen, panel: crearPanel({ almacen, contenido: async () => C, ahora: () => ahora }) };
  };
  it("guarda horario y duración con admin o notario", async () => {
    const { panel, almacen } = preparar();
    await panel.guardarHorario({ email: "p@test.ec", atiendeCitas: false, horario: { 1: [["00:00","23:55"]] } }, "n@test.ec");
    expect((await almacen.equipo())[0]).toBeDefined();
    expect(await almacen.matriceros()).not.toContainEqual(expect.objectContaining({ email: "p@test.ec" }));
    await panel.guardarDuracionCita({ minutos: 120 }, "admin@test.ec");
    expect(await panel.citasConfig()).toMatchObject({ duracionMin: 120, modoHorarios: "matriceros" });
  });
  it.each([null, [], { 7: [] }, { 1: [["08:03","09:00"]] }, { 1: [["09:00","08:00"]] }, { 1: [["08:00","10:00"],["09:00","11:00"]] }, JSON.parse('{"__proto__":[]}')])("rechaza horario malicioso %j", async horario => {
    const { panel } = preparar(); await expect(panel.guardarHorario({ email: "p@test.ec", atiendeCitas: true, horario }, "admin@test.ec")).rejects.toThrow();
  });
  it("personal solo administra sus ausencias", async () => {
    const { panel } = preparar();
    await expect(panel.guardarHorario({}, "p@test.ec")).rejects.toMatchObject({ status: 403 });
    await expect(panel.guardarDuracionCita({ minutos: 90 }, "p@test.ec")).rejects.toMatchObject({ status: 403 });
    await expect(panel.misAusencias("n@test.ec", "p@test.ec")).rejects.toMatchObject({ status: 403 });
    await panel.guardarAusencias({ email: "p@test.ec", ausencias: [{ desde: fecha, hasta: fecha, motivo: "Vacaciones" }] }, "p@test.ec");
    expect(await panel.misAusencias(null, "p@test.ec")).toMatchObject({ puedeEditar: true, ausencias: [expect.objectContaining({ motivo: "Vacaciones" })] });
  });
});
describe('límites de validación y auditoría HTTP', () => {
  async function preparar(rol = 'admin') {
    const { crearManejadorPanel } = await import('../api/_lib/panel-http.js');
    const a = crearAlmacenMemoria({ personal: [{ ...persona('actor@test.ec'), rol }, persona('otra@test.ec')] });
    a.usuarioDeToken = async () => ({ email: 'actor@test.ec', email_confirmed_at: '2026-01-01', aal: 'aal2' });
    const panel = crearPanel({ almacen: a, contenido: async () => C, ahora: () => ahora });
    const http = crearManejadorPanel({ panel, auth: a, exigirMfa: false });
    const post = b => http.POST(new Request('https://test.ec/api/panel', { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(b) }));
    const get = q => http.GET(new Request('https://test.ec/api/panel?' + q, { headers: { authorization: 'Bearer test' } }));
    return { a, panel, post, get };
  }
  it.each(['admin','notario','personal'])('audita acciones exitosas y denegadas para %s', async rol => {
    const { a, post, get } = await preparar(rol);
    const horario = await post({ accion: 'guardarHorario', email: 'otra@test.ec', atiendeCitas: true, horario: { 1: [['08:00','17:00']] } });
    const duracion = await post({ accion: 'guardarDuracionCita', minutos: 90 });
    expect(horario.status).toBe(rol === 'personal' ? 403 : 200);
    expect(duracion.status).toBe(rol === 'personal' ? 403 : 200);
    if (rol === 'personal') expect((await horario.json()).error).toContain('perfil');
    expect((await post({ accion: 'guardarAusencias', email: 'actor@test.ec', ausencias: [] })).status).toBe(200);
    expect((await post({ accion: 'guardarAusencias', email: 'otra@test.ec', ausencias: [] })).status).toBe(rol === 'personal' ? 403 : 200);
    expect((await get('accion=misAusencias')).status).toBe(200);
    expect((await get('accion=misAusencias&email=otra@test.ec')).status).toBe(rol === 'personal' ? 403 : 200);
    const auditoria = await a.auditoria();
    for (const accion of ['guardarHorario','guardarAusencias','guardarDuracionCita','misAusencias']) expect(auditoria).toContainEqual(expect.objectContaining({ accion, email: 'actor@test.ec' }));
    expect(auditoria.find(x => x.accion === 'guardarHorario').ok).toBe(rol !== 'personal');
  });
  it.each([true,'true',null,0])('exige booleano real: %j', async atiendeCitas => {
    const { post } = await preparar();
    const r = await post({ accion: 'guardarHorario', email: 'otra@test.ec', atiendeCitas, horario: {} });
    expect(r.status).toBe(atiendeCitas === true ? 200 : 400);
  });
  it.each([
    { 1: [['24:00','25:00']] }, { 1: [['08:00:00','09:00']] }, { 1: [['8:00','09:00']] },
    { 1: [['08:00','08:00']] }, { 1: [['08:00','09:00'],['07:00','08:00']] },
    { 1: Array(4).fill(['08:00','09:00']) }, { 1: ['08:00','09:00'] }, { constructor: [] }, { 1: [['08:00','09:00','10:00']] }
  ])('rechaza tramos inválidos %j', async horario => {
    const { post } = await preparar(); expect((await post({ accion: 'guardarHorario', email: 'otra@test.ec', atiendeCitas: true, horario })).status).toBe(400);
  });
  it('acepta límites, tramos contiguos y horario vacío', async () => {
    const { post } = await preparar();
    for (const horario of [{}, { 0: [['00:00','08:00'],['08:00','16:00'],['16:00','23:55']] }]) expect((await post({ accion: 'guardarHorario', email: 'otra@test.ec', atiendeCitas: true, horario })).status).toBe(200);
    for (const minutos of [30,240]) expect((await post({ accion: 'guardarDuracionCita', minutos })).status).toBe(200);
    for (const minutos of [0,29,31,270,90.5,'90',null]) expect((await post({ accion: 'guardarDuracionCita', minutos })).status).toBe(400);
  });
  it.each([null, {}, Array(25).fill({ desde: fecha, hasta: fecha, motivo: '' }), [{ desde:'2026-02-30',hasta:fecha,motivo:'' }], [{desde:fecha,hasta:'2026-10-11',motivo:''}], [{desde:fecha,hasta:fecha,motivo:'x'.repeat(81)}], [{desde:fecha,hasta:fecha,motivo:'\u0000'}], [{desde:fecha,hasta:fecha,motivo:'\u0085'}], [{desde:fecha,hasta:fecha,motivo:3}], [{desde:fecha,hasta:fecha,motivo:'',extra:true}], [null]])('rechaza ausencias inválidas %j', async ausencias => {
    const { post } = await preparar(); expect((await post({ accion:'guardarAusencias',email:'otra@test.ec',ausencias })).status).toBe(400);
  });
  it('descarta ausencias vencidas y conserva hoy y motivos de 80 caracteres', async () => {
    const { post, a } = await preparar();
    const vigentes = Array(23).fill({ desde:'2026-10-11',hasta:fecha,motivo:'x'.repeat(80) });
    const r = await post({ accion:'guardarAusencias',email:'otra@test.ec',ausencias:[...vigentes,{desde:'2026-10-01',hasta:'2026-10-10',motivo:''}] });
    expect(r.status).toBe(200); expect((await r.json()).ausencias).toEqual(vigentes);
    expect((await a.equipo()).find(p => p.email === 'otra@test.ec').ausencias).toEqual(vigentes);
  });
  it('muestra nombres y avisa cruces sin impedir asignar', async () => {
    const { a, panel, post } = await preparar();
    const c = await a.crearSolicitudCita({ fecha, hora:'09:00', asignadaA:'otra@test.ec' });
    const d = await a.crearSolicitudCita({ fecha, hora:'10:00', asignadaA:'Texto antiguo' });
    expect((await panel.agenda(fecha)).citas).toContainEqual(expect.objectContaining({ id:c.id,asignadaNombre:'otra@test.ec' }));
    expect((await panel.agenda(fecha)).citas).toContainEqual(expect.objectContaining({ id:d.id,asignadaNombre:'Texto antiguo' }));
    const r = await post({ accion:'asignarCita',id:d.id,persona:'otra@test.ec' });
    expect((await r.json()).aviso).toBe('otra@test.ec ya tiene una cita a esa hora');
    expect((await a.cita(d.id)).asignadaA).toBe('otra@test.ec');
  });
});
it('excluye reprogramadas, citas cerradas y personal sin horario en modo matriceros', async () => {
  const a = crearAlmacenMemoria({personal:[persona('a@test.ec'),persona('b@test.ec',null),{...persona('c@test.ec'),atiende_citas:false}]});
  const c = await a.crearSolicitudCita({fecha,hora:'09:00',asignadaA:'a@test.ec'});
  expect(await elegirMatricero({...opciones(a),hora:'09:30'})).toBeNull();
  expect(await elegirMatricero({...opciones(a),hora:'09:30',excluirIds:[c.id]})).toBe('a@test.ec');
  await a.actualizarCita(c.id,{estado:'rechazada'});
  expect(await elegirMatricero({...opciones(a),hora:'09:30'})).toBe('a@test.ec');
  expect(await horasLibres(opciones(a))).toContain('10:30');
  await a.guardarHorario('a@test.ec',{atiendeCitas:true,horario:{}});
  expect(await horasLibres(opciones(a))).toEqual([]);
  expect(await elegirMatricero({...opciones(a),hora:'09:30'})).toBeNull();
});
it('lee rangos y matriceros estrictamente y sin repetir por día', async () => {
  const a = crearAlmacenMemoria();
  let lecturas = 0; a.matriceros = async () => { lecturas++; return []; };
  await diasDisponibles({...opciones(a),desde:fecha,dias:30}); expect(lecturas).toBe(1);
  a.matriceros = async () => { throw Error('matriceros'); };
  await expect(diasDisponibles({...opciones(a),desde:fecha,dias:30})).rejects.toThrow('matriceros');
  await expect(elegirMatricero({...opciones(a),hora:'09:00'})).rejects.toThrow('matriceros');
});
it('elige menor carga incluso si todas las personas están libres', async () => {
  const a = crearAlmacenMemoria({personal:[persona('a@test.ec'),persona('b@test.ec')]});
  await a.crearSolicitudCita({fecha,hora:'14:00',asignadaA:'a@test.ec'});
  expect(await elegirMatricero({...opciones(a),hora:'08:00'})).toBe('b@test.ec');
});

describe("citas antiguas con la asignación escrita a mano", () => {
  it("un nombre libre en «asignada a» sigue ocupando a un matricero", async () => {
    const a = crearAlmacenMemoria({ personal: [persona("a@test.ec")] });
    await a.crearSolicitudCita({ fecha, hora: "09:00", asignadaA: "Lucía" });   // texto libre de antes de esta función
    expect(await horasLibres(opciones(a))).not.toContain("09:00");
    expect(await horasLibres(opciones(a))).not.toContain("10:00");
    expect(await horasLibres(opciones(a))).toContain("10:30");
  });
});
