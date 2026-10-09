import { test, expect } from './fixtures.js';
const dias=[{fecha:'2026-10-12',horas:['09:00','09:30']},{fecha:'2026-10-14',horas:['10:00']}];
const resumen={codigo:'4321',estado:'confirmada',fecha:'2026-10-12',fechaTexto:'lunes 12 de octubre',hora:'09:00',nombre:'Ana Pérez',tramite:{id:'poder-natural',nombre:'Poder especial'},direccion:'Tumbaco, Quito',requisitos:['Cédula original'],subirDocumentos:false};
async function abrir(page,responder=()=>({status:201,json:{resumen}}),ruta='/cita.html'){
 await page.clock.install({time:new Date('2026-10-12T12:00:00Z')});
 const pedidos=[];
 await page.route('**/api/cita',async route=>{
 if(route.request().method()==='GET')return route.fulfill({json:{dias,horario:'Lunes a viernes, de 08:00 a 17:00',tramites:[{id:'poder-natural',nombre:'Poder especial',cat:'poderes'}]}});
 pedidos.push(route.request().postDataJSON());const r=await responder(pedidos.at(-1));return route.fulfill(r);
 });
 await page.goto(ruta);await expect(page.locator('#paso-1')).toBeVisible();return pedidos;
}
async function elegirHora(page){
 await page.getByRole('button',{name:'Elegir día y hora',exact:true}).click();
 await page.getByRole('button',{name:'lunes 12 de octubre, 2 horas libres',exact:true}).click();
 await page.getByRole('radio',{name:'09:00',exact:true}).check();
 await page.getByRole('button',{name:'Continuar con mis datos',exact:true}).click();
}
async function datos(page){await page.getByLabel('Nombre completo',{exact:true}).fill('Ana Pérez');await page.getByLabel('Celular de Ecuador',{exact:true}).fill('0991234567');await page.locator('#aceptaAviso').check();}
test('flujo completo entrega ticket y calendario',async({page})=>{
 const pedidos=await abrir(page);await page.getByLabel('Trámite',{exact:true}).selectOption('poder-natural');await elegirHora(page);await datos(page);
 await page.getByRole('button',{name:'Confirmar mi cita',exact:true}).click();
 await expect(page.getByText('Ticket 4321',{exact:true})).toBeVisible();await expect(page.getByText('Cédula original',{exact:true})).toBeVisible();
 expect(pedidos[0]).toMatchObject({tramiteId:'poder-natural',fecha:'2026-10-12',hora:'09:00',aceptaAviso:true,sitio:''});
 const descarga=page.waitForEvent('download');await page.getByRole('button',{name:'Agregar a mi calendario',exact:true}).click();expect((await descarga).suggestedFilename()).toBe('cita-4321.ics');
});
test('preselecciona trámite por URL y deshabilita días sin horas',async({page})=>{
 await abrir(page,undefined,'/cita.html?tramite=poder-natural');await expect(page.locator('#tramite')).toHaveValue('poder-natural');
 await page.getByRole('button',{name:'Elegir día y hora',exact:true}).click();await expect(page.getByRole('button',{name:'martes 13 de octubre, 0 horas libres',exact:true})).toBeDisabled();
});
test('409 vuelve a día y hora con disponibilidad nueva',async({page})=>{
 await abrir(page,()=>({status:409,json:{error:'Esa hora acaba de ocuparse. Elige otra.',dias:[{fecha:'2026-10-12',horas:['10:00']}]}}));await elegirHora(page);await datos(page);await page.locator('#confirmar').click();
 await expect(page.locator('#paso-2')).toBeVisible();await expect(page.locator('#estado')).toHaveText('Esa hora acaba de ocuparse. Elige otra.');await expect(page.getByRole('radio',{name:'10:00',exact:true})).toBeVisible();await expect(page.getByRole('radio',{name:'09:00',exact:true})).toHaveCount(0);await expect(page.locator('#a-datos')).toBeDisabled();
});
test('muestra errores junto a los campos',async({page})=>{
 await abrir(page);await elegirHora(page);await page.locator('#confirmar').click();await expect(page.locator('#error-nombre')).toContainText('Escribe tu nombre');await expect(page.locator('#error-celular')).toContainText('0991234567');await expect(page.locator('#error-aceptaAviso')).toContainText('Acepta');await expect(page.locator('#nombre')).toBeFocused();
});
test('agenda solo con teclado',async({page})=>{
 await abrir(page);await page.locator('#a-fecha').focus();await page.keyboard.press('Enter');
 // Todos los controles son nativos y el calendario permite moverse con flechas.
 await page.keyboard.press('Tab');await expect(page.locator('#siguiente')).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('[data-fecha="2026-10-12"]')).toBeFocused();
 await page.keyboard.press('ArrowRight');await expect(page.locator('[data-fecha="2026-10-14"]')).toBeFocused();await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');
 await page.keyboard.press('Tab');await page.keyboard.press('Tab');await expect(page.getByRole('radio',{name:'09:00',exact:true})).toBeFocused();await page.keyboard.press('Space');await page.keyboard.press('Tab');await page.keyboard.press('Enter');
 await page.keyboard.press('Tab');await page.keyboard.type('Ana Pérez');await page.keyboard.press('Tab');await page.keyboard.type('0991234567');await page.keyboard.press('Tab');await page.keyboard.press('Tab');await page.keyboard.press('Space');await page.keyboard.press('Tab');await page.keyboard.press('Tab');await page.keyboard.press('Enter');
 await expect(page.getByText('Ticket 4321',{exact:true})).toBeVisible();
});
test('390 px sin scroll horizontal',async({page})=>{
 await page.setViewportSize({width:390,height:844});await abrir(page);await elegirHora(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('sin disponibilidad o red muestra alternativas',async({page})=>{
 await page.route('**/api/cita',route=>route.abort('internetdisconnected'));await page.goto('/cita.html');await expect(page.locator('#alternativas')).toBeVisible();await expect(page.getByRole('link',{name:'Escríbenos por WhatsApp',exact:true})).toBeVisible();
});
test('sin horas disponibles ofrece WhatsApp y teléfono',async({page})=>{
 await page.route('**/api/cita',route=>route.fulfill({json:{dias:[],horario:'Lunes a viernes',tramites:[]}}));
 await page.goto('/cita.html');await expect(page.locator('#estado')).toContainText('No quedan horas libres');await expect(page.locator('#a-fecha')).toBeDisabled();await expect(page.getByRole('link',{name:'Escríbenos por WhatsApp',exact:true})).toBeVisible();await expect(page.locator('#alternativas a[href^="tel:"]').first()).toBeVisible();
});
