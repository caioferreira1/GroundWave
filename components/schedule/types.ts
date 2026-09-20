import type { Database } from "@/lib/supabase/types";

export type ScheduledPost = Pick<
  Database["public"]["Tables"]["scheduled_posts"]["Row"],
  | "id"
  | "company_id"
  | "reddit_account_id"
  | "collaborator"
  | "post_kind"
  | "iso_year"
  | "iso_week"
  | "planned_date"
  | "title"
  | "body_copy"
  | "format_tag_id"
  | "objective_note"
  | "post_url"
  | "is_posted"
  | "posted_at"
>;

export type CompanyOption = { id: string; name: string };
export type AccountOption = { id: string; account_name: string };
export type FormatTagOption = { id: string; label: string };
