-- Datos de facturación del cliente y ubicación/código de cada sede (importación "BASE DE DATOS - CLIENTES"
-- y "CUADRO DE CLIENTES FM3"). El cliente es la marca (UPN, BBVA, BATA…); la razón social es quien contrata.

alter table public.clients add column if not exists business_name text;
alter table public.clients add column if not exists ruc text;
alter table public.clients drop constraint if exists clients_ruc_check;
alter table public.clients add constraint clients_ruc_check check (ruc ~ '^[0-9]{11}$');

-- code: código de tienda/agencia del cliente (p. ej. Adidas PE106, Delosi BK076)
alter table public.sites add column if not exists code text;
alter table public.sites add column if not exists district text;
alter table public.sites add column if not exists province text;

insert into public.schema_migrations (name) values ('012_clients_ruc.sql') on conflict do nothing;
