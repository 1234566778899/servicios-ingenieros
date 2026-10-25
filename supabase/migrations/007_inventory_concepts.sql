-- Reunión con el cliente (23/10/2026):
--  * Solo las especialidades "con equipos" (hoy aire acondicionado) llevan lista de equipos, checklist y
--    hallazgos. El resto (pintura, SCI, gasfitería…) se informa con trabajos realizados, fotos por
--    sección y conclusiones / observaciones / recomendaciones.
--  * Cada sede tiene su inventario de equipos: al crear el servicio se precargan solos.
--  * "Conceptos": textos que se repiten entre informes y se sugieren al escribir.

/* ───────────── 1. Especialidades con o sin equipos ───────────── */
alter table public.specialties add column if not exists has_equipment boolean not null default false;
update public.specialties set has_equipment = true where name = 'Aire acondicionado';

insert into public.specialties (name, position) values
  ('Pintura', 5), ('Sistema contra incendios', 6), ('Gasfitería', 7), ('Albañilería', 8),
  ('Trabajos en vidrio', 9), ('Pozos a tierra', 10), ('Control de acceso', 11), ('Servicios generales', 12)
on conflict (name) do nothing;

insert into public.service_types (name, position) values ('Reparación', 5), ('Implementación', 6)
on conflict (name) do nothing;

/* ───────────── 2. Inventario de equipos por sede ───────────── */
create table if not exists public.site_equipment (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  code text not null,
  equipment_type_id uuid references public.equipment_types(id),
  system text,
  capacity text,
  unit text,
  brand text,
  model text,
  serial text,
  location text,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) default auth.uid(),
  unique (site_id, code)
);
create index if not exists idx_site_equipment_site on public.site_equipment (site_id, position);

create or replace function public.tg_touch_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists trg_site_equipment_touch on public.site_equipment;
create trigger trg_site_equipment_touch before update on public.site_equipment
  for each row execute function public.tg_touch_updated();

insert into public.permissions (id, module, action, position) values
  ('equipos.gestionar', 'Equipos', 'Inventario por sede', 4)
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'equipos.gestionar'), ('supervisor', 'equipos.gestionar')
on conflict do nothing;

alter table public.site_equipment enable row level security;
drop policy if exists read_site_equipment on public.site_equipment;
create policy read_site_equipment on public.site_equipment for select to authenticated using (is_active_user());
drop policy if exists write_site_equipment on public.site_equipment;
create policy write_site_equipment on public.site_equipment for all to authenticated
  using (has_perm('equipos.gestionar')) with check (has_perm('equipos.gestionar'));
grant select, insert, update, delete on public.site_equipment to authenticated;

-- El equipo del servicio sigue siendo una copia (el informe no cambia si luego se edita el inventario)
alter table public.service_equipment
  add column if not exists site_equipment_id uuid references public.site_equipment(id) on delete set null;
create index if not exists idx_se_site_equipment on public.service_equipment (site_equipment_id);

/* ───────────── 3. Fotos por sección (servicios sin equipos) ───────────── */
create table if not exists public.service_photo_groups (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  position int not null default 1,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_photo_groups_service on public.service_photo_groups (service_id, position);

alter table public.service_photo_groups enable row level security;
drop policy if exists sel_photo_groups on public.service_photo_groups;
create policy sel_photo_groups on public.service_photo_groups for select to authenticated using (can_view_service(service_id));
drop policy if exists wr_photo_groups on public.service_photo_groups;
create policy wr_photo_groups on public.service_photo_groups for all to authenticated
  using (can_edit_service(service_id) and has_perm('fotos.gestionar'))
  with check (can_edit_service(service_id) and has_perm('fotos.gestionar'));
grant select, insert, update, delete on public.service_photo_groups to authenticated;

-- Una foto pertenece a un equipo (con etapa) o a una sección del servicio (sin etapa)
alter table public.photos add column if not exists service_id uuid references public.services(id) on delete cascade;
alter table public.photos add column if not exists group_id uuid references public.service_photo_groups(id) on delete cascade;
update public.photos p set service_id = se.service_id
  from public.service_equipment se where se.id = p.service_equipment_id and p.service_id is null;
alter table public.photos alter column service_id set not null;
alter table public.photos alter column service_equipment_id drop not null;
alter table public.photos alter column stage drop not null;
alter table public.photos drop constraint if exists photos_owner_check;
alter table public.photos add constraint photos_owner_check check (
  (service_equipment_id is not null and group_id is null and stage is not null)
  or (group_id is not null and service_equipment_id is null)
);
create index if not exists idx_photos_service on public.photos (service_id);
create index if not exists idx_photos_group on public.photos (group_id, position);

-- service_id siempre coincide con el del equipo o la sección
create or replace function public.tg_photo_service() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.service_equipment_id is not null then
    select service_id into new.service_id from service_equipment where id = new.service_equipment_id;
  elsif new.group_id is not null then
    select service_id into new.service_id from service_photo_groups where id = new.group_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_photo_service on public.photos;
create trigger trg_photo_service before insert or update of service_equipment_id, group_id on public.photos
  for each row execute function public.tg_photo_service();

drop policy if exists sel_photos on public.photos;
create policy sel_photos on public.photos for select to authenticated using (can_view_service(service_id));
drop policy if exists wr_photos on public.photos;
create policy wr_photos on public.photos for all to authenticated
  using (can_edit_service(service_id) and has_perm('fotos.gestionar'))
  with check (can_edit_service(service_id) and has_perm('fotos.gestionar'));

/* ───────────── 4. Trabajos realizados y observaciones ───────────── */
alter table public.services add column if not exists work_items jsonb not null default '[]'::jsonb;
alter table public.services add column if not exists observations text;

/* ───────────── 5. Conceptos reutilizables ───────────── */
create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('detalle', 'trabajo', 'foto', 'conclusion', 'observacion', 'recomendacion')),
  specialty text not null default '',
  text text not null check (length(btrim(text)) > 0),
  uses int not null default 0,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists concepts_unique on public.concepts (kind, specialty, lower(text));

alter table public.concepts enable row level security;
drop policy if exists read_concepts on public.concepts;
create policy read_concepts on public.concepts for select to authenticated using (is_active_user());
drop policy if exists ins_concepts on public.concepts;
create policy ins_concepts on public.concepts for insert to authenticated with check (is_active_user());
drop policy if exists upd_concepts on public.concepts;
create policy upd_concepts on public.concepts for update to authenticated
  using (has_perm('catalogos.admin') or created_by = auth.uid())
  with check (has_perm('catalogos.admin') or created_by = auth.uid());
drop policy if exists del_concepts on public.concepts;
create policy del_concepts on public.concepts for delete to authenticated
  using (has_perm('catalogos.admin') or created_by = auth.uid());
grant select, insert, update, delete on public.concepts to authenticated;

-- Guarda los textos usados en un informe: los nuevos se agregan y los existentes suman un uso
create or replace function public.remember_concepts(p_kind text, p_specialty text, p_texts text[]) returns void
language sql security definer set search_path = public as $$
  insert into concepts (kind, specialty, text, uses, last_used_at)
  select distinct on (lower(btrim(t))) p_kind, coalesce(p_specialty, ''), btrim(t), 1, now()
  from unnest(p_texts) t
  where is_active_user() and length(btrim(t)) > 0
  on conflict (kind, specialty, lower(text)) do update set uses = concepts.uses + 1, last_used_at = now();
$$;
grant execute on function public.remember_concepts(text, text, text[]) to authenticated;

insert into public.schema_migrations (name) values ('007_inventory_concepts.sql') on conflict do nothing;
