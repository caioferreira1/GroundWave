/** Wordmark for GroundWave Hub — a thin wave line with a coral tip. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={size}
        height={(size * 18) / 28}
        viewBox="0 0 28 18"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 12.8C4.4 12.8 5.7 6.6 8.9 6.6S13.4 12.4 16.3 12 20.5 5.6 23 5.6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground"
        />
        <circle cx="23" cy="5.6" r="2.5" fill="var(--primary)" />
      </svg>
      <span className="text-lg font-bold tracking-tight">
        <span className="text-foreground">Ground</span>
        <span className="text-primary">Wave</span>
      </span>
    </span>
  );
}
