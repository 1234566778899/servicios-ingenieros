-- Tipos de servicio y especialidades configurables desde Catálogos (antes fijos en el código).
-- services.service_type / specialty siguen guardando el nombre como texto: renombrar o desactivar
-- una opción no altera los servicios ni informes ya registrados.
create table if not exists public.service_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.service_types (name, position) values
  ('Mantenimiento preventivo', 1), ('Mantenimiento correctivo', 2),
  ('Instalación de equipos', 3), ('Inspección técnica', 4)
on conflict (name) do nothing;

insert into public.specialties (name, position) values
  ('Aire acondicionado', 1), ('Ventilación mecánica', 2), ('Refrigeración', 3), ('Electricidad', 4)
on conflict (name) do nothing;

alter table public.service_types enable row level security;
alter table public.specialties enable row level security;

drop policy if exists read_service_types on public.service_types;
create policy read_service_types on public.service_types for select to authenticated using (is_active_user());
drop policy if exists write_service_types on public.service_types;
create policy write_service_types on public.service_types for all to authenticated
  using (has_perm('catalogos.admin')) with check (has_perm('catalogos.admin'));

drop policy if exists read_specialties on public.specialties;
create policy read_specialties on public.specialties for select to authenticated using (is_active_user());
drop policy if exists write_specialties on public.specialties;
create policy write_specialties on public.specialties for all to authenticated
  using (has_perm('catalogos.admin')) with check (has_perm('catalogos.admin'));

grant select, insert, update, delete on public.service_types, public.specialties to authenticated;

-- Las plantillas de informe se eligen por el nombre del tipo de servicio: al renombrarlo, se arrastra
create or replace function public.rename_service_type_in_templates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.report_templates set service_type = new.name where service_type = old.name;
  end if;
  return new;
end $$;

drop trigger if exists trg_service_types_rename on public.service_types;
create trigger trg_service_types_rename after update of name on public.service_types
  for each row execute function public.rename_service_type_in_templates();

insert into public.schema_migrations (name) values ('006_service_catalogs.sql') on conflict do nothing;
