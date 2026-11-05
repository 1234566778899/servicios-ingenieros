-- Tamaño de cada foto en el informe, relativo al que calcula la app (1 = automático).
-- Se ajusta arrastrando la esquina de la foto en la vista previa del paso «Generar informe».
alter table public.photos add column if not exists scale numeric(4,2) not null default 1
  check (scale between 0.3 and 2.5);

insert into public.schema_migrations (name) values ('014_photo_scale.sql') on conflict do nothing;
