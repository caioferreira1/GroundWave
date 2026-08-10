"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Records the staff verdict on a post's relevance and always logs it as a
 * classifier_example (few-shot ground truth for that company's next
 * classifications) — regardless of whether it agrees with the AI's verdict,
 * since a human call is ground truth either way.
 */
export async function setHumanVerdict(
  companyId: string,
  postId: string,
  verdict: "relevant" | "irrelevant",
) {
  const { user } = await requireStaff();

  const supabase = await createClient();
  const { data: post, error } = await supabase
    .from("posts")
    .update({
      human_verdict: verdict,
      human_verdict_by: user.id,
      human_verdict_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .select("company_id, content")
    .single();
  if (error) throw new Error(error.message);
  if (!post.company_id) return;

  const { error: exampleError } = await supabase.from("classifier_examples").insert({
    company_id: post.company_id,
    post_id: postId,
    content: post.content,
    correct_is_relevant: verdict === "relevant",
  });
  if (exampleError) throw new Error(exampleError.message);

  revalidatePath(`/companies/${companyId}/posts`);
}
