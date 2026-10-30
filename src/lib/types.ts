import type { Annotation } from './annotations';

export type Stage = 'antes' | 'durante' | 'despues';
export type ServiceStatus = 'En registro' | 'Fotos pendientes' | 'Informe generado';
export type Priority = 'Alta' | 'Media' | 'Baja';

export interface Profile {
  id: string;
  full_name: string;
  dni: string | null;
  /** Correo real: solo para restablecer la contraseña (el ingreso es con DNI) */
  email: string | null;
  cargo: string | null;
  role_id: string;
  active: boolean;
  deactivated_reason: string | null;
  last_seen_at: string | null;
  must_change_password: boolean;
}

/** Cliente = marca (UPN, BBVA…); la razón social y el RUC son de quien contrata el servicio. */
export interface Client { id: string; name: string; business_name: string | null; ruc: string | null; active: boolean }
export interface Site {
  id: string; client_id: string; name: string; short_name: string | null;
  address: string | null; equipment_prefix: string | null; contact_name: string | null;
  code: string | null; district: string | null; province: string | null; active: boolean;
}
export interface EquipmentType { id: string; name: string; default_unit: string | null }
/** Opción de catálogo simple: tipos de servicio y especialidades */
export interface CatalogOption { id: string; name: string; active: boolean; position: number; has_equipment?: boolean }

/** Equipo del inventario de una sede; al agregarlo a un servicio se copia en service_equipment. */
export interface SiteEquipment {
  id: string; site_id: string; code: string; equipment_type_id: string | null; system: string | null;
  capacity: string | null; unit: string | null; brand: string | null; model: string | null; serial: string | null;
  location: string | null; active: boolean; position: number; updated_at: string;
}

export interface Service {
  id: string; code: string; work_order: string | null; service_type: string;
  client_id: string; site_id: string; specialty: string; execution_date: string;
  lead_tech_id: string | null; support_tech_ids: string[]; site_contact: string | null;
  cover_title: string | null; description: string | null; prev_details: string[]; work_items: string[];
  report_template_id: string | null; status: ServiceStatus;
  conclusions: string | null; observations: string | null; recommendations: string | null; version: number;
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
}

export interface ServiceEquipment {
  id: string; service_id: string; site_equipment_id: string | null; checklist_template_id: string | null; position: number;
  final_status: 'Pendiente' | 'Conforme' | 'No conforme'; observation: string | null;
  code: string | null; equipment_type_id: string | null; capacity: string | null; unit: string | null;
  brand: string | null; model: string | null; serial: string | null;
}

export interface TemplateItem {
  id: string; template_id: string; position: number; category: string; activity: string;
  response_type: 'cn' | 'cn_value'; value_unit: string | null; required: boolean;
}
export interface ChecklistTemplate {
  id: string; equipment_type_id: string; version: number; is_current: boolean; created_at: string;
}
export interface ChecklistResult {
  id?: string; service_equipment_id: string; template_item_id: string;
  result: 'C' | 'NC' | 'NA' | null; value: string | null;
}
/** Foto de un equipo (con etapa) o de una sección del servicio (servicios sin equipos). */
export interface Photo {
  id: string; service_id: string; service_equipment_id: string | null; group_id: string | null;
  stage: Stage | null; position: number; storage_path: string;
  /** Comentario que aparece debajo de la foto en el informe */
  caption: string | null;
  annotations: Annotation[];
}
export interface PhotoGroup { id: string; service_id: string; position: number; title: string; description: string | null }

export type ConceptKind = 'detalle' | 'trabajo' | 'foto' | 'conclusion' | 'observacion' | 'recomendacion';
export interface Concept {
  id: string; kind: ConceptKind; specialty: string; text: string; uses: number; last_used_at: string | null; created_by: string | null;
}
export interface Finding {
  id: string; service_id: string; service_equipment_id: string; template_item_id: string | null;
  catalog_id: string | null; finding: string; probable_cause: string | null; action_taken: string | null;
  recommendation: string | null; priority: Priority; photo_id: string | null; position: number;
}
export interface CatalogFinding {
  id: string; code: string; finding: string; category: string | null; equipment_type_id: string | null;
  probable_cause: string | null; suggested_action: string | null; recommendation: string | null; priority: Priority;
}
export interface ReportTemplate {
  id: string; code: string; name: string; service_type: string | null; version: number;
  issued_at: string | null; status: 'Activa' | 'Borrador' | 'Inactiva'; sections: string[]; notes: string | null;
}
export interface Report {
  id: string; number: string; service_id: string; template_id: string | null; version: number;
  issue_date: string; docx_path: string | null; pdf_path: string | null; docx_size: number | null;
  pdf_size: number | null; file_base_name: string | null; generated_by: string | null; generated_at: string;
}

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'antes', label: 'Antes' },
  { id: 'durante', label: 'Durante' },
  { id: 'despues', label: 'Después' },
];
