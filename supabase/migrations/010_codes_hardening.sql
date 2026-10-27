-- Códigos SRV-YYYY-NNNN e INF-YYYY-NNNN: solo los asigna el servidor y no se pueden cambiar.

-- El contador solo se toca desde los triggers (antes cualquiera podía llamar next_counter o vaciar la tabla)
revoke all on table public.counters from anon, authenticated;
revoke all on function public.next_counter(text) from public, anon, authenticated;

-- Servicio: el código lo pone siempre el servidor, aunque el cliente envíe uno
create or replace function public.tg_service_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare y text := to_char(coalesce(new.execution_date, current_date), 'YYYY');
begin
  new.code := 'SRV-' || y || '-' || lpad(next_counter('SRV-' || y)::text, 4, '0');
  return new;
end $$;

-- Informe: regenerar conserva el número del mismo servicio; cualquier otro número se ignora y se asigna uno nuevo
create or replace function public.tg_report_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare y text := to_char(current_date, 'YYYY');
begin
  if new.number is null
     or not exists (select 1 from reports r where r.service_id = new.service_id and r.number = new.number) then
    new.number := 'INF-' || y || '-' || lpad(next_counter('INF-' || y)::text, 4, '0');
  end if;
  return new;
end $$;

-- Una vez creados, el código del servicio y el número del informe no cambian
create or replace function public.tg_keep_code() returns trigger
language plpgsql as $$
begin
  -- IF anidados: plpgsql no corta el AND y fallaría al leer una columna que la otra tabla no tiene
  if tg_table_name = 'services' then
    if new.code is distinct from old.code then
      raise exception 'El código del servicio no se puede modificar';
    end if;
  elsif new.number is distinct from old.number then
    raise exception 'El número del informe no se puede modificar';
  end if;
  return new;
end $$;

drop trigger if exists trg_service_keep_code on public.services;
create trigger trg_service_keep_code before update of code on public.services
  for each row execute function public.tg_keep_code();
drop trigger if exists trg_report_keep_number on public.reports;
create trigger trg_report_keep_number before update of number on public.reports
  for each row execute function public.tg_keep_code();

-- Cada versión de un informe es única
alter table public.reports add constraint reports_number_version_key unique (number, version);

-- Vista previa del código con el año de la fecha de ejecución (igual que el trigger)
drop function if exists public.peek_service_code();
create function public.peek_service_code(p_date date default current_date) returns text
language sql stable security definer set search_path = public as $$
  select 'SRV-' || to_char(coalesce(p_date, current_date), 'YYYY') || '-' ||
         lpad((coalesce((select value from counters where key = 'SRV-' || to_char(coalesce(p_date, current_date), 'YYYY')), 0) + 1)::text, 4, '0');
$$;
revoke all on function public.peek_service_code(date) from public, anon;
grant execute on function public.peek_service_code(date) to authenticated;

insert into public.schema_migrations (name) values ('010_codes_hardening.sql') on conflict do nothing;
