import { it, expect, vi } from 'vitest';
import { reglasCitas, horasLibres, diasDisponibles } from '../api/_lib/citas.js';
const C = { notaria: { citas: { porHora: 2, feriados: ['2026-10-13'] }, horario: { dias: [1,2,3,4,5], abre: '08:00', cierra: '11:00' } } };
const ahora = new Date('2026-10-12T13:15:00Z');
it('respeta cupo editable, bloqueos, feriados, pasado y horario', async () => {
 const almacen = { agenda: async () => [{id: 'a', hora:'09:30', estado:'pendiente'}] };
 const ajustes = {'citas.porHora':'1', 'citas.bloqueos': JSON.stringify([{fecha:'2026-10-12',hora:'10:00'}])};
 expect(reglasCitas(C, ajustes).porHora).toBe(1);
 expect(await horasLibres({almacen,C,ajustes,fecha:'2026-10-12',ahora})).toEqual(['08:30']);
 expect(await horasLibres({almacen,C,ajustes,fecha:'2026-10-13',ahora})).toEqual([]);
 expect(await horasLibres({almacen,C,ajustes,fecha:'2026-10-11',ahora})).toEqual([]);
 expect(await horasLibres({almacen,C,ajustes,fecha:'2026-10-17',ahora})).toEqual([]);
 expect(await horasLibres({almacen,C,ajustes:{'citas.bloqueos':'[{"fecha":"2026-10-12","hora":null}]'},fecha:'2026-10-12',ahora})).toEqual([]);
 expect(await horasLibres({almacen,C,ajustes,fecha:'2026-10-12',ahora,excluirIds:['a']})).toContain('09:30');
});
it('consulta el rango una sola vez', async () => {
 const almacen = { citasEntre: vi.fn(async () => []) };
 const dias = await diasDisponibles({almacen,C,ajustes:{},desde:'2026-10-12',dias:3,ahora});
 expect(dias.map(d=>d.fecha)).toEqual(['2026-10-12','2026-10-14']);
 expect(almacen.citasEntre).toHaveBeenCalledExactlyOnceWith('2026-10-12','2026-10-14');
});
