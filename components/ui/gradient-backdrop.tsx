/** Ambient, slowly-drifting coral/amber blobs behind page content — pure decoration, no interaction. */
export function GradientBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        className="animate-drift absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full opacity-[0.14] blur-[60px]"
        style={{ background: "radial-gradient(circle, var(--color-primary) 0%, transparent 70%)" }}
      />
      <div
        className="animate-drift absolute top-1/3 -right-32 h-[26rem] w-[26rem] rounded-full opacity-[0.12] blur-[60px] [animation-delay:-8s]"
        style={{ background: "radial-gradient(circle, var(--color-chart-3) 0%, transparent 70%)" }}
      />
    </div>
  );
}
