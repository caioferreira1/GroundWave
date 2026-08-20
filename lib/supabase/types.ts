// Hand-authored to match supabase/migrations/*.sql until a real Supabase
// project exists to generate this from — once it does, regenerate with:
//   npx supabase gen types typescript --project-id <id> > lib/supabase/types.ts
// and diff against this file before trusting it blindly.
//
// `Relationships: []` on every table is required by postgrest-js's
// GenericTable constraint even though we don't model FK relationships here —
// omitting it silently makes every query resolve to `never`.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          job_title: string | null;
          avatar_path: string | null;
          status: "pending" | "approved" | "denied";
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: "admin" | "coworker" | "client";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["user_roles"]["Row"]> & {
          user_id: string;
          role: "admin" | "coworker" | "client";
        };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Row"]>;
        Relationships: [];
      };
      client_companies: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["client_companies"]["Row"]> & {
          user_id: string;
          company_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_companies"]["Row"]>;
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          website_url: string | null;
          profile: string | null;
          guardrails_md: string | null;
          favicon_url: string | null;
          suggested_subreddits: string[];
          search_keywords: string[];
          posts_min_upvotes: number;
          posts_fetch_frequency_hours: number;
          posts_fetch_hour_utc: number;
          posts_sort: "new" | "top" | "hot" | "relevance" | "comments";
          posts_max_per_run: number;
          posts_time_window: "hour" | "day" | "week" | "month" | "year" | "all";
          posts_fetch_enabled: boolean;
          posts_last_fetched_at: string | null;
          posts_last_scheduled_run_at: string | null;
          posts_last_error: string | null;
          posts_last_error_at: string | null;
          posts_retry_pending: boolean;
          inbound_webhook_token: string;
          activity_generic_comments_per_week: number;
          activity_target_comments_per_week: number;
          activity_generic_post_interval_days: number;
          activity_company_post_per_week: number;
          activity_generic_posts_before_target: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["companies"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["companies"]["Row"]>;
        Relationships: [];
      };
      reddit_accounts: {
        Row: {
          id: string;
          company_id: string;
          account_name: string;
          karma: number;
          owner_user_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["reddit_accounts"]["Row"]> & {
          company_id: string;
          account_name: string;
          owner_user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["reddit_accounts"]["Row"]>;
        Relationships: [];
      };
      apify_runs: {
        Row: {
          id: string;
          company_id: string | null;
          run_id: string;
          dataset_id: string | null;
          status: "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT" | "TIMEOUT_CLIENT";
          cost_usd: number;
          compute_units: number;
          item_count: number;
          run_time_secs: number;
          scheduled: boolean;
          error: string | null;
          started_at: string;
          finished_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["apify_runs"]["Row"]> & {
          run_id: string;
          status: "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT" | "TIMEOUT_CLIENT";
          started_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["apify_runs"]["Row"]>;
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          company_id: string | null;
          author: string | null;
          url: string;
          content: string | null;
          posted_at: string | null;
          upvotes: number | null;
          subreddit: string | null;
          received_at: string;
          ai_status: "pending" | "processed" | "failed";
          is_relevant: boolean | null;
          relevance_score: number | null;
          ai_reasoning: string | null;
          ai_error: string | null;
          human_verdict: "relevant" | "irrelevant" | null;
          human_verdict_by: string | null;
          human_verdict_at: string | null;
          generated_comment: string | null;
          comment_generated_at: string | null;
          comment_posted_at: string | null;
          comment_posted_by: string | null;
          comment_views_count: number | null;
          is_manual: boolean;
          reddit_account_id: string | null;
          comment_type: "generic" | "target" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["posts"]["Row"]> & {
          url: string;
        };
        Update: Partial<Database["public"]["Tables"]["posts"]["Row"]>;
        Relationships: [];
      };
      classifier_examples: {
        Row: {
          id: string;
          company_id: string;
          post_id: string | null;
          content: string;
          correct_is_relevant: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["classifier_examples"]["Row"]> & {
          company_id: string;
          content: string;
          correct_is_relevant: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["classifier_examples"]["Row"]>;
        Relationships: [];
      };
      post_generations: {
        Row: {
          id: string;
          company_id: string | null;
          mode: "company" | "generic";
          subreddit: string;
          theme: string;
          title: string;
          body: string;
          created_by: string | null;
          posted_at: string | null;
          posted_by: string | null;
          views_count: number | null;
          reddit_account_id: string | null;
          post_type: "generic" | "company_mention" | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["post_generations"]["Row"]> & {
          mode: "company" | "generic";
          subreddit: string;
          theme: string;
          title: string;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["post_generations"]["Row"]>;
        Relationships: [];
      };
      daily_task_completions: {
        Row: {
          id: string;
          company_id: string;
          reddit_account_id: string;
          task_key: "generic_post" | "company_mention_post" | "generic_comments" | "target_comments";
          task_date: string;
          count: number;
          completed_by: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["daily_task_completions"]["Row"]> & {
          company_id: string;
          reddit_account_id: string;
          task_key: "generic_post" | "company_mention_post" | "generic_comments" | "target_comments";
          task_date: string;
          completed_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["daily_task_completions"]["Row"]>;
        Relationships: [];
      };
      generic_post_generator_settings: {
        Row: {
          id: number;
          subreddits: string[];
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["generic_post_generator_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["generic_post_generator_settings"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      account_status: "pending" | "approved" | "denied";
      app_role: "admin" | "coworker" | "client";
    };
    CompositeTypes: Record<string, never>;
  };
};
