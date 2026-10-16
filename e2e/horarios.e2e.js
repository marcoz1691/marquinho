import { test, expect } from './fixtures.js';
async function preparar(page, { rol = 'admin', modoHorarios = 'cupoFijo' } = {}) {
  const pedidos = [];
  const miembros = [{ email:'yo@test.ec',nombre:'Yo',rol,atiendeCitas:true,horario:null,ausencias:[],dosPasos:true },{email:'ana@test.ec',nombre:'Ana',rol:'personal',atiendeCitas:true,horario:null,ausencias:[],dosPasos:true}];
  const config = { porHora:2,porHoraOficial:2,bloqueos:[],duracionMin:90,modoHorarios,esAdmin:rol !== 'personal' };
  const citas = [{ id:'c1',fecha:'2099-01-05',hora:'09:00',nombre:'Cliente',estado:'confirmada',tramite:'Poder',asignadaA:'',asignadaNombre:'',canal:'formulario',conversacionId:'v1' }];
  await page.route('**/vendor/supabase-js-*.js', r => r.fulfill({ contentType:'text/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"test"}}})}})};' }));
  await page.route('**/api/panel-config', r => r.fulfill({ json:{supabaseUrl:'https://ejemplo.supabase.co',supabaseAnonKey:'publica',mfa:false} }));
  await page.route(/\/api\/cita(?:\?|$)/, r => r.fulfill({ json:{dias:[{fecha:'2099-01-05',horas:['08:00']}],tramites:[],categorias:[],horario:'Lunes a viernes'} }));
  await page.route(/\/api\/panel(?:\?|$)/, r => {
    const req = r.request(), b = req.method() === 'POST' ? req.postDataJSON() : null, q = new URL(req.url()).searchParams;
    const accion = b?.accion || q.get('accion');
    if (b) pedidos.push(b);
    let json = [];
    if (accion === 'yo') json = {email:'yo@test.ec',nombre:'Yo',rol};
    if (accion === 'guardarHorario') { Object.assign(miembros.find(p => p.email === b.email),{atiendeCitas:b.atiendeCitas,horario:b.horario}); config.modoHorarios = 'matriceros'; }
    if (accion === 'equipo' || accion === 'guardarHorario') json = {ok:true,miembros,yo:'yo@test.ec',rol};
    if (accion === 'misAusencias') { const p = miembros.find(p => p.email === (q.get('email') || 'yo@test.ec')); json = {email:p.email,nombre:p.nombre,ausencias:p.ausencias,puedeEditar:true}; }
    if (accion === 'guardarAusencias') { miembros.find(p => p.email === b.email).ausencias = b.ausencias; json = {ok:true,ausencias:b.ausencias}; }
    if (accion === 'guardarDuracionCita') { config.duracionMin = b.minutos; json = {ok:true,...config}; }
    if (accion === 'citasConfig') json = config;
    if (accion === 'agenda') json = {fecha:q.get('fecha') || '2099-01-05',personal:miembros,citas};
    if (accion === 'asignarCita') { citas[0].asignadaA=b.persona;citas[0].asignadaNombre='Ana';json={ok:true,aviso:'Ana ya tiene una cita a esa hora'}; }
    return r.fulfill({json});
  });
  await page.goto('/panel/'); await expect(page.locator('#tabs')).toBeVisible();
  return pedidos;
}
test('editor agrega tramo, copia lunes y guarda el horario completo', async ({page}) => {
  const pedidos = await preparar(page);
  await page.locator('[data-tab="equipoV"]').click();
  await page.locator('[data-horario="ana@test.ec"]').click();
  const dialogo = page.locator('#horarioDialogo'), lunes = dialogo.locator('[data-dia-horario="1"]');
  await lunes.getByRole('checkbox',{name:'Trabaja',exact:true}).check();
  await lunes.locator('[data-hasta]').fill('13:00');
  await lunes.getByRole('button',{name:'+ Agregar otro tramo',exact:true}).click();
  await expect(lunes.locator('.horario-tramo')).toHaveCount(2);
  await dialogo.getByRole('button',{name:'Copiar el lunes a toda la semana',exact:true}).click();
  await expect(dialogo.locator('.horario-tramo')).toHaveCount(14);
  await dialogo.getByRole('button',{name:'Guardar horario',exact:true}).click();
  await expect(page.locator('#horarioMensaje')).toHaveText('Horario guardado');
  expect(pedidos.at(-1)).toEqual({accion:'guardarHorario',email:'ana@test.ec',atiendeCitas:true,horario:Object.fromEntries(Array.from({length:7},(_,d)=>[d,[['08:00','13:00'],['14:00','17:00']]]))});
  await dialogo.getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(page.locator('[data-horario="ana@test.ec"]')).toBeFocused();
});
for (const rol of ['admin','personal']) test(`${rol} agrega y quita ausencias`, async ({page}) => {
  const pedidos = await preparar(page,{rol}); await page.locator('[data-tab="agendaV"]').click();
  await page.locator('#misAusencias > summary').click();
  if (rol === 'admin') await page.locator('#ausenciasPersona').selectOption('ana@test.ec');
  else await expect(page.locator('#ausenciasPersonaCampo')).toBeHidden();
  await page.locator('#ausenciaDesde').fill('2099-01-05'); await page.locator('#ausenciaHasta').fill('2099-01-06'); await page.locator('#ausenciaMotivo').fill('Vacaciones');
  await page.locator('#ausenciasForm').getByRole('button',{name:'Agregar',exact:true}).click();
  await expect(page.locator('#ausenciasLista')).toContainText('Vacaciones');
  expect(pedidos.at(-1)).toEqual({accion:'guardarAusencias',email:rol === 'admin' ? 'ana@test.ec' : 'yo@test.ec',ausencias:[{desde:'2099-01-05',hasta:'2099-01-06',motivo:'Vacaciones'}]});
  await page.locator('[data-quitar-ausencia="0"]').click(); await expect(page.locator('[data-quitar-ausencia]')).toHaveCount(0);
  expect(pedidos.at(-1).ausencias).toEqual([]);
});
for (const modoHorarios of ['matriceros','cupoFijo']) test(`configuración explica ${modoHorarios} y guarda duración`, async ({page}) => {
  const pedidos = await preparar(page,{modoHorarios}); await page.locator('[data-tab="agendaV"]').click(); await page.locator('#agConfig > summary').click();
  await expect(page.locator('#agConfigContenido')).toContainText(modoHorarios === 'matriceros' ? 'el cupo por hora ya no se usa' : 'Todavía no hay horarios cargados');
  await page.locator('#agDuracion input').fill('120'); await page.locator('#agDuracion').getByRole('button',{name:'Guardar duración',exact:true}).click();
  await expect(page.locator('#agConfigMensaje')).toHaveText('Guardado.'); expect(pedidos.at(-1)).toEqual({accion:'guardarDuracionCita',minutos:120});
});
test('reasignación muestra aviso y nombre', async ({page}) => {
  await preparar(page); await page.locator('[data-tab="agendaV"]').click();
  await page.locator('[data-asignar="c1"]').selectOption('ana@test.ec');
  await expect(page.locator('#agAsignacionMensaje')).toHaveText('Ana ya tiene una cita a esa hora');
  await expect(page.locator('#agLista')).toContainText('Matricero: Ana');
});
for (const width of [390,1366]) test(`horarios y ausencias no desbordan a ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:844}); await preparar(page); await page.locator('[data-tab="equipoV"]').click(); await page.locator('[data-horario="ana@test.ec"]').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('#horarioDialogo').evaluate(el=>el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('#horarioCerrar').click(); await page.locator('[data-tab="agendaV"]').click(); await page.locator('#misAusencias > summary').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
