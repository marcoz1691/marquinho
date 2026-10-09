-- Esquema del asistente de WhatsApp de la Notaría 41.
-- Ejecutar en el editor SQL de Supabase. Solo el servidor (clave service_role) accede a estas tablas:
-- RLS activado y sin políticas = nadie más puede leer ni escribir (ni con la clave anon).

create table if not exists conversaciones (
  id uuid primary key default gen_random_uuid(),
  telefono text not null unique,
  nombre text not null default '',
  consentimiento boolean not null default false,
  consentimiento_en timestamptz,
  derivada boolean not null default false,
  cliente_en_ms bigint not null default 0,          -- último mensaje escrito por el cliente (ventana de 24 h)
  turno_hasta_ms bigint not null default 0,         -- turno de respuesta tomado hasta este momento (0 = libre)
  ultimo_texto text not null default '',            -- para la lista del panel
  ultima_actividad_ms bigint not null default 0,
  creada timestamptz not null default now()
);

create table if not exists sesiones (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  sistema text not null,                             -- prompt de sistema congelado para toda la sesión
  ultima_ms bigint not null,
  creada timestamptz not null default now()
);
create index if not exists sesiones_conversacion on sesiones(conversacion_id, creada);

create table if not exists mensajes (
  id bigserial primary key,
  sesion_id uuid not null references sesiones(id) on delete cascade,
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant', 'system')),
  contenido jsonb not null,                          -- mensaje tal como lo recibe/devuelve la API de Claude (sin editar)
  creado timestamptz not null default now()
);
create index if not exists mensajes_sesion on mensajes(sesion_id, id);

create table if not exists procesados (
  wa_id text primary key,                            -- id de mensaje de WhatsApp: evita atenderlo dos veces
  creado timestamptz not null default now()
);

-- Mensajes del cliente que esperan su turno (se agrupan burbujas seguidas en un solo turno).
create table if not exists pendientes (
  id bigserial primary key,
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  mensaje jsonb not null,
  creado timestamptz not null default now()
);
create index if not exists pendientes_conversacion on pendientes(conversacion_id, id);

create table if not exists archivos (
  id text not null,                                  -- media_id de WhatsApp
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  mime text not null default '',
  nombre text not null default '',
  creado timestamptz not null default now(),
  primary key (conversacion_id, id)
);

create table if not exists documentos (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  media_id text not null,
  nombre text not null default '',
  mime text not null default '',
  ruta text not null,                                -- ruta en el bucket privado "documentos"
  descripcion text not null default '',
  tramite_id text,
  estado text not null default 'recibido' check (estado in ('recibido', 'aprobado', 'observado')),  -- pre-revisión del personal
  nota text not null default '',
  creado timestamptz not null default now()
);
create index if not exists documentos_conversacion on documentos(conversacion_id);

create table if not exists solicitudes_cita (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  tramite_id text,
  fecha date not null,
  hora text not null,
  nombre text not null,
  nota text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'rechazada', 'atendida')),
  motivo text not null default '',
  recordada boolean not null default false,
  creada timestamptz not null default now()
);
alter table solicitudes_cita add column if not exists asignada_a text not null default '';
create index if not exists citas_conversacion on solicitudes_cita(conversacion_id);
create index if not exists citas_fecha on solicitudes_cita(fecha, estado);
create index if not exists mensajes_conversacion on mensajes(conversacion_id, id);
create index if not exists conversaciones_actividad on conversaciones(ultima_actividad_ms desc);

-- Personas autorizadas a entrar al panel (por correo de su cuenta de Supabase Auth).
create table if not exists personal (
  email text primary key,
  nombre text not null default ''
);

alter table conversaciones enable row level security;
alter table sesiones enable row level security;
alter table mensajes enable row level security;
alter table procesados enable row level security;
alter table pendientes enable row level security;
alter table archivos enable row level security;
alter table documentos enable row level security;
alter table solicitudes_cita enable row level security;
alter table personal enable row level security;

-- Bucket privado para los documentos de los clientes.
insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Chat web: celular de contacto en las citas y contador de uso para limitar costos.
alter table solicitudes_cita add column if not exists contacto text;

create table if not exists uso (
  clave text not null,
  ventana bigint not null,
  cuenta int not null default 0,
  primary key (clave, ventana)
);
alter table uso enable row level security;

create or replace function incrementar_uso(p_clave text, p_ventana bigint) returns int
language sql as $$
  insert into uso (clave, ventana, cuenta) values (p_clave, p_ventana, 1)
  on conflict (clave, ventana) do update set cuenta = uso.cuenta + 1
  returning cuenta;
$$;
revoke execute on function incrementar_uso(text, bigint) from public, anon, authenticated;

-- Seguridad (oct. 2026) ------------------------------------------------------------------------------------------

-- Evidencia del consentimiento (Reglamento LOPDP, art. 5): lo que escribió el cliente y la versión del aviso aceptado.
alter table conversaciones add column if not exists consentimiento_texto text not null default '';
alter table conversaciones add column if not exists consentimiento_aviso text not null default '';

-- Borrado recuperable de documentos: el panel los marca y la purga diaria elimina el archivo días después.
alter table documentos add column if not exists borrado_en timestamptz;
alter table documentos add column if not exists borrado_por text not null default '';
create index if not exists documentos_borrados on documentos(borrado_en) where borrado_en is not null;

-- Auditoría del panel: quién vio o cambió qué. Solo se agrega; no se puede editar ni borrar.
create table if not exists auditoria (
  id bigserial primary key,
  creado timestamptz not null default now(),
  email text not null default '',
  accion text not null,
  objetivo text not null default '',
  ok boolean not null default true
);
create index if not exists auditoria_creado on auditoria(creado desc);
alter table auditoria enable row level security;

create or replace function auditoria_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'La auditoría no se puede modificar ni borrar';
end $$;
drop trigger if exists auditoria_inmutable on auditoria;
create trigger auditoria_inmutable before update or delete on auditoria for each row execute function auditoria_inmutable();

-- La purga busca conversaciones inactivas.
create index if not exists conversaciones_creada on conversaciones(creada);

-- Primera vez que cada persona del personal entra con la verificación en dos pasos (para avisar al administrador).
alter table personal add column if not exists mfa_en timestamptz;

-- Los contadores de uso guardan celulares y huellas de IP: se purgan a los 7 días.
alter table uso add column if not exists creado timestamptz not null default now();
create index if not exists uso_creado on uso(creado);

-- 2026-10-07: ticket de cuatro dígitos, único por día; las citas anteriores conservan null.
alter table solicitudes_cita add column if not exists codigo text check (codigo ~ '^[1-9][0-9]{3}$');
create unique index if not exists solicitudes_cita_fecha_codigo on solicitudes_cita(fecha, codigo);
