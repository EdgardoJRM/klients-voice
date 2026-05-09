export type MaterialType = "pdf" | "epub" | "image_book" | "video" | "link" | "file";

export type MaterialAccessRule = "registered" | "confirmed" | "scanned" | "manual";

export type MaterialViewerType = "secure_pdf" | "secure_epub" | "image_viewer" | "external_link";

export type MaterialStatus = "active" | "archived" | "draft";

export type MaterialRecord = {
  material_id: string;
  tenant_id: string;
  event_id: string;
  title: string;
  description?: string;
  material_type: MaterialType;
  s3_key?: string;
  external_url?: string;
  access_rule: MaterialAccessRule;
  viewer_type: MaterialViewerType;
  allow_download: boolean;
  watermark_enabled: boolean;
  status: MaterialStatus;
  created_at: string;
  updated_at: string;
};

export type MaterialAccessStatus = "locked" | "unlocked" | "revoked";

export type MaterialAccessRecord = {
  access_id: string;
  tenant_id: string;
  event_id: string;
  participant_id: string;
  material_id: string;
  access_status: MaterialAccessStatus;
  unlocked_at?: string;
  expires_at?: string;
  last_accessed_at?: string;
  created_at: string;
  updated_at: string;
};
