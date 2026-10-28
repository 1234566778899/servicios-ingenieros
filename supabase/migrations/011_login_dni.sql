-- Ingreso con DNI + contraseña. En Auth cada usuario tiene un correo interno <dni>@dni.nordicoingenieros.com;
-- profiles.email es el correo real (opcional) y solo sirve para restablecer la contraseña.

alter table public.profiles add column if not exists dni text;
alter table public.profiles add column if not exists must_change_password boolean not null default true;
alter table public.profiles add column if not exists reset_requested_at timestamptz;
alter table public.profiles alter column email drop not null;
alter table public.profiles drop constraint if exists profiles_email_key;
alter table public.profiles drop constraint if exists profiles_dni_check;
alter table public.profiles add constraint profiles_dni_check check (dni ~ '^[0-9]{8}$');
create unique index if not exists profiles_dni_key on public.profiles (dni);

-- Los usuarios existentes ya tienen su propia contraseña
update public.profiles set must_change_password = false where dni is null;

-- El perfil COORDINADOR de la empresa corresponde al rol "supervisor"
update public.roles set name = 'Coordinador' where id = 'supervisor';

-- El propio usuario marca que ya cambió su contraseña (no puede volver a activarlo)
create or replace function public.password_changed() returns void
language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid();
$$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

insert into public.schema_migrations (name) values ('011_login_dni.sql') on conflict do nothing;
