/** "Caio Ferreira Morgado" -> "Caio F." — used wherever chrome space is tight (sidebar, avatars). */
export function abbreviateName(fullName: string | null | undefined, fallback: string): string {
  const name = (fullName ?? "").trim();
  if (!name) return fallback;

  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];

  const lastInitial = parts[parts.length - 1][0]?.toUpperCase();
  return lastInitial ? `${parts[0]} ${lastInitial}.` : parts[0];
}
