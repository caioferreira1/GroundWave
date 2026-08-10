/**
 * Wordmark for GroundWave Hub. The glyph is a transmitter with arcs that
 * curve down to hug the baseline — a "ground wave" (a radio signal that
 * follows the earth's surface to reach further) rather than a generic
 * signal/wifi icon.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <line x1="4" y1="24" x2="28" y2="24" stroke="var(--border)" strokeWidth="1.5" />
        <circle cx="7" cy="24" r="2.25" fill="var(--accent)" />
        <path
          d="M11 24C13.5 24 14.5 19 17 19C19.5 19 20.5 24 23 24"
          stroke="var(--accent)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M11 24C15 24 16 13.5 21 13.5C26 13.5 24 24 23 24"
          stroke="var(--accent)"
          strokeOpacity="0.45"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-semibold tracking-tight text-ink">
        GroundWave <span className="text-ink-muted font-normal">Hub</span>
      </span>
    </span>
  );
}
