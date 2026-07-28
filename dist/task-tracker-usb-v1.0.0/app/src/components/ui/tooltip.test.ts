import { describe, it, expect } from "vitest";
import { computeTooltipPosition, type TooltipRect } from "./tooltip";

// Viewport used across the cases.
const VW = 1000;
const VH = 800;

/** Build a rect from x/y/w/h. */
function rect(x: number, y: number, w: number, h: number): TooltipRect {
  return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
}

const SIZE = { w: 100, h: 40 };
const GAP = 8;

describe("computeTooltipPosition", () => {
  it("places the bubble above and horizontally centered on the trigger (side=top)", () => {
    const r = rect(400, 400, 60, 20); // center x = 430
    const p = computeTooltipPosition(r, SIZE, "top", VW, VH);
    expect(p.side).toBe("top");
    expect(p.top).toBe(400 - SIZE.h - GAP); // above
    expect(p.left).toBe(430 - SIZE.w / 2); // centered
  });

  it("flips top -> bottom when there is no room above", () => {
    const r = rect(400, 4, 60, 20); // only 4px above -> can't fit 40+8
    const p = computeTooltipPosition(r, SIZE, "top", VW, VH);
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(24 + GAP); // below the trigger (bottom = 4+20)
  });

  it("flips bottom -> top when there is no room below", () => {
    const r = rect(400, VH - 24, 60, 20); // near the bottom edge
    const p = computeTooltipPosition(r, SIZE, "bottom", VW, VH);
    expect(p.side).toBe("top");
  });

  it("flips right -> left when there is no room to the right", () => {
    const r = rect(VW - 30, 400, 20, 20);
    const p = computeTooltipPosition(r, SIZE, "right", VW, VH);
    expect(p.side).toBe("left");
  });

  it("clamps a centered bubble back onto the screen at the left edge", () => {
    const r = rect(2, 400, 20, 20); // center x = 12, half width = 50 -> would go negative
    const p = computeTooltipPosition(r, SIZE, "top", VW, VH);
    expect(p.left).toBeGreaterThanOrEqual(GAP);
  });

  it("clamps against the right edge too", () => {
    const r = rect(VW - 22, 400, 20, 20);
    const p = computeTooltipPosition(r, SIZE, "top", VW, VH);
    expect(p.left).toBeLessThanOrEqual(VW - SIZE.w - GAP);
  });
});
