export type PostGenerationRow = {
  id: string;
  subreddit: string;
  theme: string;
  title: string;
  body: string;
  created_at: string;
  posted_at: string | null;
  posted_by_display_name: string | null;
  reddit_account_name: string | null;
  post_type: "generic" | "company_mention" | null;
  views_count: number | null;
};

export type StaffMember = {
  id: string;
  display_name: string | null;
  email: string;
};

export type RedditAccountOption = {
  id: string;
  account_name: string;
};

/** Only present on the company post-generator route — generic mode has no per-company metrics to feed. */
export type PostGenerationActions = {
  isStaff: boolean;
  staffMembers: StaffMember[];
  currentUserId: string | null;
  accounts: RedditAccountOption[];
  markPostedAction: (id: string, formData: FormData) => Promise<void>;
  unmarkPostedAction: (id: string) => Promise<void>;
  setViewsAction: (id: string, formData: FormData) => Promise<void>;
};
