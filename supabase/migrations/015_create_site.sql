-- Agregar una tienda/sede desde el registro de un servicio cuando no está en la lista.
-- Permiso propio 'sedes.agregar' (administrador y coordinador; el técnico no): solo crea, editar o eliminar sedes
-- sigue requiriendo 'catalogos.admin'. Si ya existe una con ese nombre en el cliente se devuelve esa (y si estaba
-- desactivada se reactiva), así no se duplican.

-- Junto a los demás permisos de Servicios (solo la primera vez: la migración se puede volver a ejecutar)
do $$
begin
  if not exists (select 1 from public.permissions where id = 'sedes.agregar') then
    update public.permissions set position = position + 1 where position >= 4;
    insert into public.permissions (id, module, action, position) values ('sedes.agregar', 'Servicios', 'Agregar tiendas', 4);
  end if;
end $$;
insert into public.role_permissions (role_id, permission_id)
values ('admin', 'sedes.agregar'), ('supervisor', 'sedes.agregar')
on conflict do nothing;

create or replace function public.create_site(
  p_client uuid, p_name text, p_code text default null, p_address text default null,
  p_district text default null, p_province text default null
) returns public.sites
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_site public.sites;
begin
  if not (public.has_perm('sedes.agregar') or public.has_perm('catalogos.admin')) then
    raise exception 'No tienes permiso para agregar tiendas' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Escribe el nombre de la tienda' using errcode = '22023';
  end if;
  if not exists (select 1 from clients where id = p_client and active) then
    raise exception 'El cliente no existe o está desactivado' using errcode = '22023';
  end if;

  select * into v_site from sites where client_id = p_client and lower(name) = lower(v_name);
  if found then
    if not v_site.active then
      update sites set active = true where id = v_site.id returning * into v_site;
    end if;
    return v_site;
  end if;

  if v_code is not null and exists (select 1 from sites where client_id = p_client and upper(btrim(code)) = v_code and active) then
    raise exception 'Ya existe una tienda con el código % en este cliente: búscala por su código', v_code using errcode = '23505';
  end if;

  insert into sites (client_id, name, code, address, district, province)
  values (p_client, v_name, v_code, nullif(btrim(coalesce(p_address, '')), ''),
          nullif(upper(btrim(coalesce(p_district, ''))), ''), nullif(upper(btrim(coalesce(p_province, ''))), ''))
  returning * into v_site;
  return v_site;
end $$;

revoke all on function public.create_site(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_site(uuid, text, text, text, text, text) to authenticated;

insert into public.schema_migrations (name) values ('015_create_site.sql') on conflict do nothing;
