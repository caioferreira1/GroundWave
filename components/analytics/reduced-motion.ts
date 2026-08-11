"use client";

import { useEffect, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The `prefers-reduced-motion` kill-switch in globals.css stops CSS
 * transitions/animations globally, but the SVG trend chart's draw-in and
 * flowing-line effects need to not even render when motion is reduced
 * (a static dasharray/opacity would still look like a rendering glitch).
 */
export function useIsAnimationEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setEnabled(!query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return enabled;
}
