-- Eliminar clientes y sedes: si ya tienen servicios se desactivan (siguen apareciendo en esos servicios e informes,
-- pero no en las listas); si no, se borran de verdad. Crear uno con el mismo nombre que uno desactivado lo reactiva.

alter table public.clients add column if not exists active boolean not null default true;
alter table public.sites add column if not exists active boolean not null default true;

-- Devuelve 'deleted' o 'disabled'
create or replace function public.delete_site(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('catalogos.admin') then
    raise exception 'No tienes permiso para eliminar sedes' using errcode = '42501';
  end if;
  if exists (select 1 from services where site_id = p_id) then
    update sites set active = false where id = p_id;
    return 'disabled';
  end if;
  delete from sites where id = p_id; -- su inventario (site_equipment) se borra en cascada
  return 'deleted';
end $$;

create or replace function public.delete_client(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('catalogos.admin') then
    raise exception 'No tienes permiso para eliminar clientes' using errcode = '42501';
  end if;
  -- Sedes: se borran las que no tienen servicios y se desactivan las demás
  delete from sites s where s.client_id = p_id and not exists (select 1 from services v where v.site_id = s.id);
  update sites set active = false where client_id = p_id;
  if exists (select 1 from services where client_id = p_id) or exists (select 1 from sites where client_id = p_id) then
    update clients set active = false where id = p_id;
    return 'disabled';
  end if;
  delete from clients where id = p_id;
  return 'deleted';
end $$;

revoke all on function public.delete_site(uuid), public.delete_client(uuid) from public, anon;
grant execute on function public.delete_site(uuid), public.delete_client(uuid) to authenticated;

insert into public.schema_migrations (name) values ('013_clients_sites_active.sql') on conflict do nothing;
