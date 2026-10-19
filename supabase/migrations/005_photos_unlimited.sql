-- Permite N fotografías por etapa (antes: posición 1..3 fija)
alter table public.photos drop constraint if exists photos_position_check;
alter table public.photos add constraint photos_position_check check (position >= 1);
create index if not exists idx_photos_se_stage on public.photos (service_equipment_id, stage, position);
insert into public.schema_migrations (name) values ('005_photos_unlimited.sql') on conflict do nothing;
