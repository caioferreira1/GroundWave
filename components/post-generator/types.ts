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
  post_type: "generic" | "contribuites" | "target" | null;
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
  /** Set only on the generic-mode picker, appended to the option label (an account can be linked to more than one company) — the account choice is what attributes a generic post to a company. Absent on the company post-generator route, where every option already belongs to the current company. */
  company_names?: string[];
};

/** Present on both post-generator routes now — company mode scopes accounts to the current company, generic mode offers every company's accounts grouped by company. */
export type PostGenerationActions = {
  isStaff: boolean;
  staffMembers: StaffMember[];
  currentUserId: string | null;
  accounts: RedditAccountOption[];
  markPostedAction: (id: string, formData: FormData) => Promise<void>;
  unmarkPostedAction: (id: string) => Promise<void>;
  setViewsAction: (id: string, formData: FormData) => Promise<void>;
};
