// Lazy confetti burst (client-only). Used to celebrate task completion.
// Dynamically imported so it never touches the SSR bundle.
export async function celebrate(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const confetti = (await import("canvas-confetti")).default;
    const colors = ["#6366f1", "#a855f7", "#ec4899", "#10b981"];
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors, scalar: 0.9 });
    setTimeout(
      () => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors }),
      120
    );
    setTimeout(
      () => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors }),
      240
    );
  } catch {
    /* confetti is purely cosmetic — ignore load failures */
  }
}
