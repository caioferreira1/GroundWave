// Seed list for generic-mode post generation (no company targeting) — used
// only to populate `generic_post_generator_settings` in the migration. The
// list actually used at generation time is configurable by staff and lives
// in that table (see lib/ai/post-generator.ts). Ported from the reference
// app's playbook "Post Creator" data table.

export const DEFAULT_POST_GENERATOR_SUBREDDITS = [
  "asktheworld",
  "askabrazilian",
  "askagerman",
  "motorcycles",
  "biohackers",
  "travel",
  "digitalnomad",
  "NoStupidQuestions",
  "askanamerican",
  "askrussian",
  "germany",
  "cooking",
];
