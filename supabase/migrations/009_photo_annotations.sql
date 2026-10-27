-- Anotaciones sobre cada foto (flechas, rectángulos, círculos y textos) en coordenadas relativas 0–1.
-- La foto original no se modifica: las anotaciones se dibujan al mostrarla y al generar el informe.
alter table public.photos add column if not exists annotations jsonb not null default '[]'::jsonb;

-- El pie de foto ahora es un comentario del usuario: se quitan los nombres de archivo que se copiaban al subir.
update public.photos set caption = null
where caption ~* '^(IMG|DSC|PXL|VID|WhatsApp Image|Captura de pantalla|Screenshot|Screen Shot|Photo|image)[ _-]?\d';

insert into public.schema_migrations (name) values ('009_photo_annotations.sql') on conflict do nothing;
