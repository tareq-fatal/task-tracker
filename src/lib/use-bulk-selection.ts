"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Multi-select state shared by the Kanban board and the list view.
 * Supports plain checkbox toggles and Shift+Click range selection (the range is
 * resolved against the caller-supplied `orderedIds`, which reflects the current
 * sort/filter). The last-touched id is the anchor for the next shift-select.
 */
export function useBulkSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback(
    (id: string, opts?: { shiftKey?: boolean; orderedIds?: string[] }) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const ids = opts?.orderedIds;
        if (opts?.shiftKey && anchorRef.current && ids) {
          const a = ids.indexOf(anchorRef.current);
          const b = ids.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(ids[i]);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchorRef.current = id;
    },
    []
  );

  /** Select exactly `ids` (on=true) or clear (on=false). */
  const setAll = useCallback((ids: string[], on: boolean) => {
    setSelected(on ? new Set(ids) : new Set());
    anchorRef.current = null;
  }, []);

  return {
    selected,
    ids: [...selected],
    count: selected.size,
    isSelected,
    toggle,
    clear,
    setAll,
  };
}

export type BulkSelection = ReturnType<typeof useBulkSelection>;
