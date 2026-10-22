-- Línea base: esquema public equivalente a las migraciones 001–004 (001_init, 002_reports_update,
-- 003_reports_delete, 004_inline_equipment), reconstruido desde un pg_dump del proyecto anterior
-- (kxorkuyanodixzkzfwge), que ya no existe. Incluye roles/permisos, buckets y políticas de Storage.
-- Aplicar en una base vacía y luego 005 y 006.
set check_function_bodies = false;

CREATE FUNCTION public.can_edit_service(p_service uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from services s where s.id = p_service and (
      has_perm('servicios.editar_otros') or (has_perm('servicios.editar_propios') and is_service_member(s))
    )
  );
$$;
CREATE FUNCTION public.can_edit_service_equipment(p_se uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select can_edit_service((select service_id from service_equipment where id = p_se));
$$;
CREATE FUNCTION public.can_view_service(p_service uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from services s where s.id = p_service and (
      has_perm('servicios.consultar_todos') or is_service_member(s)
    )
  );
$$;
CREATE FUNCTION public.can_view_service_equipment(p_se uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select can_view_service((select service_id from service_equipment where id = p_se));
$$;
CREATE FUNCTION public.dashboard_stats() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'en_curso',         (select count(*) from services where status <> 'Informe generado'),
    'sin_fotos',        (select count(*) from services where status = 'Fotos pendientes'),
    'informes_mes',     (select count(*) from reports where date_trunc('month', generated_at) = date_trunc('month', now())),
    'informes_mes_ant', (select count(*) from reports where date_trunc('month', generated_at) = date_trunc('month', now() - interval '1 month')),
    'equipos_mes',      (select count(*) from service_equipment se join services s on s.id = se.service_id
                          where date_trunc('month', s.execution_date) = date_trunc('month', now())),
    'servicios_mes',    (select count(*) from services where date_trunc('month', execution_date) = date_trunc('month', now())),
    'usuarios_activos', (select count(*) from profiles where active)
  ) where public.is_active_user();
$$;
CREATE FUNCTION public.has_perm(p text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from profiles pr
    join role_permissions rp on rp.role_id = pr.role_id
    where pr.id = auth.uid() and pr.active and rp.permission_id = p
  );
$$;
CREATE FUNCTION public.is_active_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;
CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text,
    work_order text,
    service_type text NOT NULL,
    client_id uuid NOT NULL,
    site_id uuid NOT NULL,
    specialty text DEFAULT 'Aire acondicionado'::text NOT NULL,
    execution_date date DEFAULT CURRENT_DATE NOT NULL,
    lead_tech_id uuid,
    support_tech_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    site_contact text,
    cover_title text,
    description text,
    prev_details jsonb DEFAULT '[]'::jsonb NOT NULL,
    report_template_id uuid,
    status text DEFAULT 'En registro'::text NOT NULL,
    conclusions text,
    recommendations text,
    version integer DEFAULT 1 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT services_status_check CHECK ((status = ANY (ARRAY['En registro'::text, 'Fotos pendientes'::text, 'Informe generado'::text])))
);
CREATE FUNCTION public.is_service_member(s public.services) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select s.created_by = auth.uid() or s.lead_tech_id = auth.uid() or auth.uid() = any(s.support_tech_ids);
$$;
CREATE FUNCTION public.next_counter(p_key text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int;
begin
  insert into counters(key, value) values (p_key, 1)
  on conflict (key) do update set value = counters.value + 1
  returning value into v;
  return v;
end $$;
CREATE FUNCTION public.peek_service_code() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select 'SRV-' || to_char(current_date,'YYYY') || '-' ||
         lpad((coalesce((select value from counters where key = 'SRV-' || to_char(current_date,'YYYY')), 0) + 1)::text, 4, '0');
$$;
CREATE FUNCTION public.tg_report_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare y text := to_char(current_date, 'YYYY');
begin
  if new.number is null then
    new.number := 'INF-' || y || '-' || lpad(next_counter('INF-' || y)::text, 4, '0');
  end if;
  return new;
end $$;
CREATE FUNCTION public.tg_service_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare y text := to_char(coalesce(new.execution_date, current_date), 'YYYY');
begin
  if new.code is null then
    new.code := 'SRV-' || y || '-' || lpad(next_counter('SRV-' || y)::text, 4, '0');
  end if;
  return new;
end $$;
CREATE FUNCTION public.tg_service_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
CREATE FUNCTION public.touch_last_seen() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update profiles set last_seen_at = now() where id = auth.uid();
$$;
CREATE TABLE public.activity_log (
    id bigint NOT NULL,
    service_id uuid,
    user_id uuid DEFAULT auth.uid(),
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.activity_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.activity_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.checklist_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_equipment_id uuid NOT NULL,
    template_item_id uuid NOT NULL,
    result text,
    value text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT checklist_results_result_check CHECK ((result = ANY (ARRAY['C'::text, 'NC'::text, 'NA'::text])))
);
CREATE TABLE public.checklist_template_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    "position" integer NOT NULL,
    category text NOT NULL,
    activity text NOT NULL,
    response_type text DEFAULT 'cn'::text NOT NULL,
    value_unit text,
    required boolean DEFAULT true NOT NULL,
    CONSTRAINT checklist_template_items_response_type_check CHECK ((response_type = ANY (ARRAY['cn'::text, 'cn_value'::text])))
);
CREATE TABLE public.checklist_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    equipment_type_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.counters (
    key text NOT NULL,
    value integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.equipment_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    default_unit text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.findings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    service_equipment_id uuid NOT NULL,
    template_item_id uuid,
    catalog_id uuid,
    finding text NOT NULL,
    probable_cause text,
    action_taken text,
    recommendation text,
    priority text DEFAULT 'Media'::text NOT NULL,
    photo_id uuid,
    "position" integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT findings_priority_check CHECK ((priority = ANY (ARRAY['Alta'::text, 'Media'::text, 'Baja'::text])))
);
CREATE TABLE public.findings_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    finding text NOT NULL,
    category text,
    equipment_type_id uuid,
    probable_cause text,
    suggested_action text,
    recommendation text,
    priority text DEFAULT 'Media'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT findings_catalog_priority_check CHECK ((priority = ANY (ARRAY['Alta'::text, 'Media'::text, 'Baja'::text])))
);
CREATE TABLE public.permissions (
    id text NOT NULL,
    module text NOT NULL,
    action text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_equipment_id uuid NOT NULL,
    stage text NOT NULL,
    "position" integer NOT NULL,
    storage_path text NOT NULL,
    caption text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT photos_position_check CHECK ((("position" >= 1) AND ("position" <= 3))),
    CONSTRAINT photos_stage_check CHECK ((stage = ANY (ARRAY['antes'::text, 'durante'::text, 'despues'::text])))
);
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    cargo text,
    role_id text DEFAULT 'tecnico'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    deactivated_reason text,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.report_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    service_type text,
    version integer DEFAULT 1 NOT NULL,
    issued_at date,
    status text DEFAULT 'Activa'::text NOT NULL,
    sections jsonb DEFAULT '["portada", "memoria", "detalles", "equipos", "checklist", "fotos", "hallazgos", "conclusiones"]'::jsonb NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_templates_status_check CHECK ((status = ANY (ARRAY['Activa'::text, 'Borrador'::text, 'Inactiva'::text])))
);
CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number text,
    service_id uuid NOT NULL,
    template_id uuid,
    version integer DEFAULT 1 NOT NULL,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    docx_path text,
    pdf_path text,
    docx_size bigint,
    pdf_size bigint,
    file_base_name text,
    generated_by uuid DEFAULT auth.uid(),
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.role_permissions (
    role_id text NOT NULL,
    permission_id text NOT NULL
);
CREATE TABLE public.roles (
    id text NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.schema_migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.service_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    checklist_template_id uuid,
    "position" integer DEFAULT 1 NOT NULL,
    final_status text DEFAULT 'Pendiente'::text NOT NULL,
    observation text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    equipment_type_id uuid,
    capacity text,
    unit text,
    brand text,
    model text,
    serial text,
    CONSTRAINT service_equipment_final_status_check CHECK ((final_status = ANY (ARRAY['Pendiente'::text, 'Conforme'::text, 'No conforme'::text])))
);
CREATE TABLE public.sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    short_name text,
    address text,
    equipment_prefix text,
    contact_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.checklist_results
    ADD CONSTRAINT checklist_results_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.checklist_results
    ADD CONSTRAINT checklist_results_service_equipment_id_template_item_id_key UNIQUE (service_equipment_id, template_item_id);
ALTER TABLE ONLY public.checklist_template_items
    ADD CONSTRAINT checklist_template_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_equipment_type_id_version_key UNIQUE (equipment_type_id, version);
ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_name_key UNIQUE (name);
ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.counters
    ADD CONSTRAINT counters_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.equipment_types
    ADD CONSTRAINT equipment_types_name_key UNIQUE (name);
ALTER TABLE ONLY public.equipment_types
    ADD CONSTRAINT equipment_types_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.findings_catalog
    ADD CONSTRAINT findings_catalog_code_key UNIQUE (code);
ALTER TABLE ONLY public.findings_catalog
    ADD CONSTRAINT findings_catalog_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);
ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);
ALTER TABLE ONLY public.service_equipment
    ADD CONSTRAINT service_equipment_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_code_key UNIQUE (code);
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_client_id_name_key UNIQUE (client_id, name);
ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);
CREATE INDEX idx_activity_service ON public.activity_log USING btree (service_id, created_at DESC);
CREATE INDEX idx_findings_service ON public.findings USING btree (service_id);
CREATE INDEX idx_photos_se ON public.photos USING btree (service_equipment_id);
CREATE INDEX idx_reports_service ON public.reports USING btree (service_id);
CREATE INDEX idx_se_code ON public.service_equipment USING btree (code);
CREATE INDEX idx_se_service ON public.service_equipment USING btree (service_id);
CREATE INDEX idx_services_date ON public.services USING btree (execution_date DESC);
CREATE INDEX idx_services_site ON public.services USING btree (site_id);
CREATE TRIGGER trg_report_number BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.tg_report_number();
CREATE TRIGGER trg_service_code BEFORE INSERT ON public.services FOR EACH ROW EXECUTE FUNCTION public.tg_service_code();
CREATE TRIGGER trg_service_touch BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.tg_service_touch();
ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.checklist_results
    ADD CONSTRAINT checklist_results_service_equipment_id_fkey FOREIGN KEY (service_equipment_id) REFERENCES public.service_equipment(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checklist_results
    ADD CONSTRAINT checklist_results_template_item_id_fkey FOREIGN KEY (template_item_id) REFERENCES public.checklist_template_items(id);
ALTER TABLE ONLY public.checklist_template_items
    ADD CONSTRAINT checklist_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.checklist_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_equipment_type_id_fkey FOREIGN KEY (equipment_type_id) REFERENCES public.equipment_types(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.findings_catalog
    ADD CONSTRAINT findings_catalog_equipment_type_id_fkey FOREIGN KEY (equipment_type_id) REFERENCES public.equipment_types(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.findings_catalog(id);
ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.photos(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_service_equipment_id_fkey FOREIGN KEY (service_equipment_id) REFERENCES public.service_equipment(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_template_item_id_fkey FOREIGN KEY (template_item_id) REFERENCES public.checklist_template_items(id);
ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_service_equipment_id_fkey FOREIGN KEY (service_equipment_id) REFERENCES public.service_equipment(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);
ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.report_templates(id);
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.service_equipment
    ADD CONSTRAINT service_equipment_checklist_template_id_fkey FOREIGN KEY (checklist_template_id) REFERENCES public.checklist_templates(id);
ALTER TABLE ONLY public.service_equipment
    ADD CONSTRAINT service_equipment_equipment_type_id_fkey FOREIGN KEY (equipment_type_id) REFERENCES public.equipment_types(id);
ALTER TABLE ONLY public.service_equipment
    ADD CONSTRAINT service_equipment_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_lead_tech_id_fkey FOREIGN KEY (lead_tech_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_report_template_id_fkey FOREIGN KEY (report_template_id) REFERENCES public.report_templates(id);
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY del_reports ON public.reports FOR DELETE TO authenticated USING (((generated_by = auth.uid()) AND (docx_path IS NULL) AND (pdf_path IS NULL)));
CREATE POLICY del_services ON public.services FOR DELETE TO authenticated USING ((public.has_perm('servicios.editar_otros'::text) OR ((created_by = auth.uid()) AND (status = 'En registro'::text))));
ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY ins_activity ON public.activity_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY ins_reports ON public.reports FOR INSERT TO authenticated WITH CHECK ((public.can_view_service(service_id) AND (public.has_perm('informes.word'::text) OR public.has_perm('informes.pdf'::text))));
CREATE POLICY ins_services ON public.services FOR INSERT TO authenticated WITH CHECK (public.has_perm('servicios.crear'::text));
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_checklist_template_items ON public.checklist_template_items FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_checklist_templates ON public.checklist_templates FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_clients ON public.clients FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_equipment_types ON public.equipment_types FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_findings_catalog ON public.findings_catalog FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_permissions ON public.permissions FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_profiles ON public.profiles FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_report_templates ON public.report_templates FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_role_permissions ON public.role_permissions FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_roles ON public.roles FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_sites ON public.sites FOR SELECT TO authenticated USING (public.is_active_user());
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY sel_activity ON public.activity_log FOR SELECT TO authenticated USING ((public.is_active_user() AND ((service_id IS NULL) OR public.can_view_service(service_id))));
CREATE POLICY sel_cr ON public.checklist_results FOR SELECT TO authenticated USING (public.can_view_service_equipment(service_equipment_id));
CREATE POLICY sel_findings ON public.findings FOR SELECT TO authenticated USING (public.can_view_service(service_id));
CREATE POLICY sel_photos ON public.photos FOR SELECT TO authenticated USING (public.can_view_service_equipment(service_equipment_id));
CREATE POLICY sel_reports ON public.reports FOR SELECT TO authenticated USING ((public.is_active_user() AND (public.has_perm('historial.ver_todos'::text) OR public.can_view_service(service_id))));
CREATE POLICY sel_se ON public.service_equipment FOR SELECT TO authenticated USING (public.can_view_service(service_id));
CREATE POLICY sel_services ON public.services FOR SELECT TO authenticated USING ((public.is_active_user() AND (public.has_perm('servicios.consultar_todos'::text) OR public.is_service_member(services.*))));
ALTER TABLE public.service_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY upd_reports ON public.reports FOR UPDATE TO authenticated USING ((generated_by = auth.uid()));
CREATE POLICY upd_services ON public.services FOR UPDATE TO authenticated USING ((public.has_perm('servicios.editar_otros'::text) OR (public.has_perm('servicios.editar_propios'::text) AND public.is_service_member(services.*))));
CREATE POLICY wr_cr ON public.checklist_results TO authenticated USING ((public.can_edit_service_equipment(service_equipment_id) AND public.has_perm('checklist.registrar'::text))) WITH CHECK ((public.can_edit_service_equipment(service_equipment_id) AND public.has_perm('checklist.registrar'::text)));
CREATE POLICY wr_findings ON public.findings TO authenticated USING ((public.can_edit_service(service_id) AND public.has_perm('hallazgos.gestionar'::text))) WITH CHECK ((public.can_edit_service(service_id) AND public.has_perm('hallazgos.gestionar'::text)));
CREATE POLICY wr_photos ON public.photos TO authenticated USING ((public.can_edit_service_equipment(service_equipment_id) AND public.has_perm('fotos.gestionar'::text))) WITH CHECK ((public.can_edit_service_equipment(service_equipment_id) AND public.has_perm('fotos.gestionar'::text)));
CREATE POLICY wr_se ON public.service_equipment TO authenticated USING (public.can_edit_service(service_id)) WITH CHECK (public.can_edit_service(service_id));
CREATE POLICY write_checklist_template_items ON public.checklist_template_items TO authenticated USING (public.has_perm('catalogos.admin'::text)) WITH CHECK (public.has_perm('catalogos.admin'::text));
CREATE POLICY write_checklist_templates ON public.checklist_templates TO authenticated USING (public.has_perm('catalogos.admin'::text)) WITH CHECK (public.has_perm('catalogos.admin'::text));
CREATE POLICY write_clients ON public.clients TO authenticated USING (public.has_perm('catalogos.admin'::text)) WITH CHECK (public.has_perm('catalogos.admin'::text));
CREATE POLICY write_equipment_types ON public.equipment_types TO authenticated USING (public.has_perm('catalogos.admin'::text)) WITH CHECK (public.has_perm('catalogos.admin'::text));
CREATE POLICY write_findings_catalog ON public.findings_catalog TO authenticated USING (public.has_perm('catalogos.admin'::text)) WITH CHECK (public.has_perm('catalogos.admin'::text));
CREATE POLICY write_profiles ON public.profiles FOR UPDATE TO authenticated USING (public.has_perm('usuarios.admin'::text)) WITH CHECK (public.has_perm('usuarios.admin'::text));
CREATE POLICY write_report_templates ON public.report_templates TO authenticated USING (public.has_perm('plantillas.admin'::text)) WITH CHECK (public.has_perm('plantillas.admin'::text));
CREATE POLICY write_role_permissions ON public.role_permissions TO authenticated USING (public.has_perm('usuarios.admin'::text)) WITH CHECK (public.has_perm('usuarios.admin'::text));
CREATE POLICY write_roles ON public.roles TO authenticated USING (public.has_perm('usuarios.admin'::text)) WITH CHECK (public.has_perm('usuarios.admin'::text));
CREATE POLICY write_sites ON public.sites TO authenticated USING (public.has_perm('catalogos.admin'::text)) WITH CHECK (public.has_perm('catalogos.admin'::text));

-- Permisos de la Data API (los proyectos nuevos no siempre los otorgan por defecto)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- Roles y permisos
insert into public.roles (id, name, position) values
  ('admin', 'Administrador', 0), ('supervisor', 'Supervisor', 1), ('tecnico', 'Técnico', 2)
on conflict (id) do nothing;

insert into public.permissions (id, module, action, position) values
  ('servicios.crear',           'Servicios',                           'Crear',                    0),
  ('servicios.editar_propios',  'Servicios',                           'Editar propios',           1),
  ('servicios.editar_otros',    'Servicios',                           'Editar de otros usuarios', 2),
  ('servicios.consultar_todos', 'Servicios',                           'Consultar todos',          3),
  ('fotos.gestionar',           'Fotografías',                         'Adjuntar / eliminar',      5),
  ('checklist.registrar',       'Checklist',                           'Registrar resultados',     6),
  ('hallazgos.gestionar',       'Hallazgos',                           'Registrar / editar',       7),
  ('informes.word',             'Informes',                            'Generar Word',             8),
  ('informes.pdf',              'Informes',                            'Generar PDF final',        9),
  ('historial.ver_todos',       'Historial',                           'Ver informes de todos',   10),
  ('historial.descargar',       'Historial',                           'Descargar',               11),
  ('plantillas.admin',          'Plantillas',                          'Administrar',             12),
  ('catalogos.admin',           'Catálogos y plantillas de checklist', 'Administrar',             13),
  ('usuarios.admin',            'Usuarios y roles',                    'Administrar',             14)
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select 'admin', id from public.permissions
union all
select 'supervisor', unnest(array['checklist.registrar','fotos.gestionar','hallazgos.gestionar','historial.descargar',
  'historial.ver_todos','informes.pdf','informes.word','servicios.consultar_todos','servicios.crear',
  'servicios.editar_otros','servicios.editar_propios'])
union all
select 'tecnico', unnest(array['checklist.registrar','fotos.gestionar','hallazgos.gestionar','historial.descargar',
  'informes.word','servicios.consultar_todos','servicios.crear','servicios.editar_propios'])
on conflict do nothing;

-- Storage: buckets privados y políticas
insert into storage.buckets (id, name, public) values ('photos', 'photos', false), ('reports', 'reports', false)
on conflict (id) do nothing;

drop policy if exists app_read_files on storage.objects;
create policy app_read_files on storage.objects for select to authenticated
  using (bucket_id = any (array['photos', 'reports']) and public.is_active_user());
drop policy if exists app_insert_files on storage.objects;
create policy app_insert_files on storage.objects for insert to authenticated
  with check (bucket_id = any (array['photos', 'reports']) and public.is_active_user());
drop policy if exists app_update_files on storage.objects;
create policy app_update_files on storage.objects for update to authenticated
  using (bucket_id = any (array['photos', 'reports']) and public.is_active_user());
drop policy if exists app_delete_files on storage.objects;
create policy app_delete_files on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.has_perm('fotos.gestionar'));

insert into public.schema_migrations (name) values
  ('001_init.sql'), ('002_reports_update.sql'), ('003_reports_delete.sql'), ('004_inline_equipment.sql')
on conflict do nothing;
