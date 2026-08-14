"use client";

import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";

export type GalleryImage = { id: string; fileName: string };

// Bildergalerie der Aufgabe: die Bilder stehen groß in der Aufgabe (nicht nur
// als Dateiname), ein Klick öffnet sie formatfüllend, Pfeiltasten blättern.
// Tarek 14.08.2026: "die Bilder zeigen" — deshalb Vorschau IN der Aufgabe,
// nicht ein Link, der einen neuen Tab aufmacht.
export function AttachmentGallery({ images }: { images: GalleryImage[] }) {
  const [open, setOpen] = useState<number | null>(null);

  const step = useCallback(
    (delta: number) =>
      setOpen((i) => (i === null ? null : (i + delta + images.length) % images.length)),
    [images.length]
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    // Kein Mitscrollen der Seite hinter dem Overlay.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, step]);

  if (images.length === 0) return null;
  const current = open === null ? null : images[open];

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpen(i)}
            title={img.fileName}
            className="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-secondary/30 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/download/attachment/${img.id}?thumb=1`}
              alt={img.fileName}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-start text-[11px] text-white">
              {img.fileName}
            </span>
          </button>
        ))}
      </div>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.fileName}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpen(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/download/attachment/${current.id}?inline=1`}
            alt={current.fileName}
            className="max-h-full max-w-full rounded object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <div className="absolute end-3 top-3 flex items-center gap-2">
            <a
              href={`/download/attachment/${current.id}`}
              download={current.fileName}
              onClick={(e) => e.stopPropagation()}
              className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
              aria-label="Download"
            >
              <Download className="h-5 w-5" />
            </a>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
              aria-label="Schließen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute start-3 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
                aria-label="Vorheriges Bild"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute end-3 top-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
                aria-label="Nächstes Bild"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <span className="absolute bottom-4 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                {open! + 1} / {images.length}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}
