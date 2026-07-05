"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, X } from "lucide-react";
import { useT } from "@/components/i18n-provider";

const COLORS = ["#1f2937", "#6366f1", "#ec4899", "#10b981", "#f59e0b"];
const SIZES = [2, 4, 8];

/** Lightweight local freehand layer over the board (Miro-style doodle).
 *  Not persisted/collaborative — that lands with realtime (PR-AD). */
export function FreehandCanvas({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(SIZES[1]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const parent = c.parentElement!;
    c.width = parent.clientWidth;
    c.height = parent.clientHeight;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pt(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const p = pt(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pt(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  function up() { drawing.current = false; }
  function clear() {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  }

  return (
    <>
      <canvas
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="absolute inset-0 z-30 cursor-crosshair touch-none"
      />
      <div className="glass absolute start-1/2 top-2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 shadow-lg rtl:translate-x-1/2">
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} className="h-5 w-5 rounded-full ring-2 ring-offset-1" style={{ background: c, boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }} aria-label={t("draw.color")} />
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {SIZES.map((s) => (
          <button key={s} onClick={() => setSize(s)} className={`grid h-6 w-6 place-items-center rounded ${size === s ? "bg-indigo-100" : ""}`} aria-label={t("draw.size")}>
            <span className="rounded-full bg-foreground" style={{ width: s + 2, height: s + 2 }} />
          </button>
        ))}
        <button onClick={clear} className="ms-1 rounded-md p-1 hover:bg-muted" aria-label={t("draw.clear")}><Eraser className="h-4 w-4" /></button>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-muted" aria-label={t("draw.close")}><X className="h-4 w-4" /></button>
      </div>
    </>
  );
}
