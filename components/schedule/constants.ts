/** Deliberately a plain array, not a DB enum — adding a collaborator should never need a migration. Edit this array to add one. */
export const COLLABORATORS = ["Caio", "Matheus"] as const;

export const POST_KIND_LABEL: Record<"target" | "generic", string> = {
  target: "Target",
  generic: "Generic",
};

/**
 * Color carries exactly two meanings on this page: post kind and posted
 * status — nothing else (no per-account or per-company color-coding, which
 * turned out to read as arbitrary/unexplained). Target posts get the
 * "warning" (amber) treatment — the same signal color the original
 * planning doc used for its Target tags, since those carry a disclosed
 * brand mention. Generic/community posts stay neutral.
 */
export const POST_KIND_BADGE_VARIANT: Record<"target" | "generic", "warning" | "neutral"> = {
  target: "warning",
  generic: "neutral",
};
