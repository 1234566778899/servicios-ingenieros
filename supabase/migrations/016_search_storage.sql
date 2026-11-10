-- 1) Búsqueda de servicios por texto: campo calculado `search_text` (PostgREST lo filtra como una columna más).
--    Reúne código, orden de trabajo, cliente, razón social y código y nombre de la sede, en minúsculas y sin tildes.
--    Antes la app enviaba los ids de todas las sedes cuyo nombre coincidía: con un texto corto la consulta era
--    demasiado larga («Bad Request») y no se podía buscar por el código de la sede.
-- 2) Archivos (Storage): solo se pueden leer los de los servicios que el usuario puede ver. Antes cualquier usuario
--    activo podía leer o listar todas las fotos e informes aunque no viera el servicio (p. ej. un técnico).
-- 3) Archivos de informes: se pueden borrar al eliminar el servicio (antes quedaban huérfanos en el bucket).
-- Se puede volver a ejecutar.

create or replace function public.search_text(s public.services) returns text
language sql stable set search_path = public as $$
  select translate(
    lower(concat_ws(' ', s.code, s.work_order, c.name, c.business_name, st.code, replace(st.code, ' ', ''), st.name)),
    'áéíóúàèìòùäëïöüâêîôûñç', 'aeiouaeiouaeiouaeiounc')
  from (select 1) one
  left join clients c on c.id = s.client_id
  left join sites st on st.id = s.site_id;
$$;
revoke all on function public.search_text(public.services) from public, anon;
grant execute on function public.search_text(public.services) to authenticated;

-- Las rutas empiezan por el id del servicio: «<servicio>/…» y, las miniaturas, «thumbs/<servicio>/…».
-- Los archivos de un servicio que ya no existe (se acaba de eliminar) los ve quien tiene el permiso `p_cleanup`,
-- para poder borrarlos: Storage solo deja borrar lo que se puede leer.
create or replace function public.can_view_file(p_name text, p_cleanup text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when x.seg ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' then
      public.can_view_service(x.seg::uuid)
      or (public.has_perm(p_cleanup) and not exists (select 1 from services where id = x.seg::uuid))
    else false
  end
  from (
    select case when split_part(p_name, '/', 1) = 'thumbs' then split_part(p_name, '/', 2) else split_part(p_name, '/', 1) end as seg
  ) x;
$$;
revoke all on function public.can_view_file(text, text) from public, anon;
grant execute on function public.can_view_file(text, text) to authenticated;

drop policy if exists app_read_files on storage.objects;
create policy app_read_files on storage.objects for select to authenticated
  using (
    public.is_active_user() and (
      (bucket_id = 'photos' and public.can_view_file(name, 'fotos.gestionar'))
      -- Igual que la tabla reports: quien ve todo el historial o quien puede ver el servicio
      or (bucket_id = 'reports' and (public.has_perm('historial.ver_todos') or public.can_view_file(name, 'servicios.editar_otros')))
    )
  );

drop policy if exists app_delete_files on storage.objects;
create policy app_delete_files on storage.objects for delete to authenticated
  using (
    (bucket_id = 'photos' and public.has_perm('fotos.gestionar'))
    or (bucket_id = 'reports' and public.has_perm('servicios.editar_otros'))
  );

notify pgrst, 'reload schema';

insert into public.schema_migrations (name) values ('016_search_storage.sql') on conflict do nothing;
