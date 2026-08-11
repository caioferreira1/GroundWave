export type PostGenerationRow = {
  id: string;
  subreddit: string;
  theme: string;
  title: string;
  body: string;
  created_at: string;
  persona_display_name: string | null;
  posted_at: string | null;
  posted_by_display_name: string | null;
  views_count: number | null;
};

export type StaffMember = {
  id: string;
  display_name: string | null;
  email: string;
};

/** Only present on the company post-generator route — generic mode has no per-company metrics to feed. */
export type PostGenerationActions = {
  isStaff: boolean;
  staffMembers: StaffMember[];
  currentUserId: string | null;
  markPostedAction: (id: string, formData: FormData) => Promise<void>;
  unmarkPostedAction: (id: string) => Promise<void>;
  setViewsAction: (id: string, formData: FormData) => Promise<void>;
};
