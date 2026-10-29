"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Fuse, { type FuseResultMatch } from "fuse.js";
import {
  CheckSquare,
  Clock,
  FolderKanban,
  Loader2,
  MessageSquare,
  Search,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import { SkeletonScreen, SkeletonRows } from "@/components/skeleton";
import { globalSearchAction } from "@/actions/search";
import {
  SEARCH_MIN_CHARS,
  type SearchItem,
  type SearchItemType,
} from "@/lib/search";
import type { TKey } from "@/lib/i18n";

const SECTION_ORDER: SearchItemType[] = ["task", "project", "user", "comment"];
const SECTION_LABEL: Record<SearchItemType, TKey> = {
  task: "search.tasks",
  project: "search.projects",
  user: "search.users",
  comment: "search.comments",
};
const SECTION_ICON: Record<SearchItemType, React.ElementType> = {
  task: CheckSquare,
  project: FolderKanban,
  user: UserIcon,
  comment: MessageSquare,
};
const MAX_PER_SECTION = 8;
const MAX_RECENTS = 7;

type Ranked = { item: SearchItem; matches?: readonly FuseResultMatch[] };

/** <mark>-wrap the fuzzy-match ranges fuse reported for this text. */
function Highlighted({
  text,
  ranges,
}: {
  text: string;
  ranges?: readonly [number, number][];
}) {
  const usable = (ranges ?? []).filter(([s, e]) => e - s + 1 >= 2);
  if (usable.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const [start, end] of usable) {
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <mark
        key={start}
        className="rounded-sm bg-indigo-500/20 px-0 text-inherit"
      >
        {text.slice(start, end + 1)}
      </mark>
    );
    last = end + 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function matchRanges(
  matches: readonly FuseResultMatch[] | undefined,
  key: string,
  value: string
) {
  return matches?.find((m) => m.key === key && m.value === value)?.indices;
}

export function GlobalSearch({
  userId,
  tenantSlug,
}: {
  userId: string;
  tenantSlug: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<SearchItem[]>([]);
  const [isMac, setIsMac] = useState(false);
  const seq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const recentKey = `tt.search.recent.${tenantSlug}.${userId}`;
  const trimmed = query.trim();
  const searching = trimmed.length >= SEARCH_MIN_CHARS;

  useEffect(() => {
    setIsMac(/Mac|iP(hone|ad|od)/.test(navigator.platform ?? ""));
  }, []);

  // Global Ctrl+K / Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load recents on open; reset state on close.
  useEffect(() => {
    if (open) {
      try {
        const raw = localStorage.getItem(recentKey);
        setRecents(raw ? (JSON.parse(raw) as SearchItem[]) : []);
      } catch {
        setRecents([]);
      }
    } else {
      setQuery("");
      setItems([]);
      setActive(0);
      setLoading(false);
    }
  }, [open, recentKey]);

  // Debounced server search (tenant + visibility scoped server-side).
  useEffect(() => {
    if (!open || !searching) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await globalSearchAction(trimmed);
        if (seq.current === id) {
          setItems(res);
          setActive(0);
        }
      } catch {
        if (seq.current === id) setItems([]);
      } finally {
        if (seq.current === id) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [open, searching, trimmed]);

  // Client-side fuzzy ranking + match highlighting over the scoped candidates.
  const ranked: Ranked[] = useMemo(() => {
    if (!searching || items.length === 0) return [];
    const fuse = new Fuse(items, {
      keys: [
        { name: "title", weight: 3 },
        { name: "subtitle", weight: 1.5 },
        { name: "haystack", weight: 1 },
      ],
      includeMatches: true,
      ignoreLocation: true,
      threshold: 0.38,
      minMatchCharLength: 2,
    });
    const res = fuse.search(trimmed);
    if (res.length > 0)
      return res.map((r) => ({ item: r.item, matches: r.matches }));
    // Fuzzy ranker found nothing — keep the strict DB substring hits anyway.
    return items.filter((i) => !i.pool).map((item) => ({ item }));
  }, [items, searching, trimmed]);

  const groups = useMemo(() => {
    return SECTION_ORDER.map((type) => ({
      type,
      rows: ranked
        .filter((r) => r.item.type === type)
        .slice(0, MAX_PER_SECTION),
    })).filter((g) => g.rows.length > 0);
  }, [ranked]);

  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const showRecents = !searching && recents.length > 0;
  const rowCount = searching ? flat.length : recents.length;

  // Keep the active row visible while arrowing through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function select(item: SearchItem) {
    const slim: SearchItem = {
      type: item.type,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      href: item.href,
      status: item.status,
      taskType: item.taskType,
    };
    const next = [
      slim,
      ...recents.filter((r) => !(r.type === item.type && r.id === item.id)),
    ].slice(0, MAX_RECENTS);
    setRecents(next);
    try {
      localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      /* storage full/blocked — recents are best-effort */
    }
    setOpen(false);
    router.push(item.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (rowCount === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % rowCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + rowCount) % rowCount);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = searching ? flat[active]?.item : recents[active];
      if (item) select(item);
    }
  }

  function row(
    item: SearchItem,
    index: number,
    matches?: readonly FuseResultMatch[]
  ) {
    const Icon = SECTION_ICON[item.type];
    return (
      <button
        key={`${item.type}:${item.id}`}
        type="button"
        data-index={index}
        onClick={() => select(item)}
        onMouseMove={() => setActive(index)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm transition-colors",
          index === active
            ? "bg-indigo-500/10 text-foreground"
            : "text-muted-foreground hover:bg-secondary/60"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            index === active ? "text-indigo-600" : "opacity-60"
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">
            <Highlighted
              text={item.title}
              ranges={matchRanges(matches, "title", item.title)}
            />
          </span>
          {item.subtitle && (
            <span className="block truncate text-xs text-muted-foreground">
              <Highlighted
                text={item.subtitle}
                ranges={matchRanges(matches, "subtitle", item.subtitle)}
              />
            </span>
          )}
        </span>
        {item.type === "task" && item.status && (
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
            {t(`status.${item.status}` as TKey)}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Desktop trigger — a search pill with the shortcut hint */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="global-search"
        className="hidden h-9 items-center gap-2 rounded-md border bg-secondary/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:inline-flex"
        aria-label={t("search.button")}
      >
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline">{t("search.button")}</span>
        <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] lg:inline">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      {/* Mobile trigger — icon only */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
        aria-label={t("search.button")}
      >
        <Search className="h-5 w-5" />
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="glass fixed left-[50%] top-[15%] z-50 w-[calc(100%-2rem)] max-w-xl translate-x-[-50%] overflow-hidden rounded-2xl border border-white/40 p-0 shadow-2xl shadow-indigo-900/10 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">
              {t("search.button")}
            </DialogPrimitive.Title>

            <div className="flex items-center gap-2 border-b px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={t("search.placeholder")}
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                role="combobox"
                aria-expanded={rowCount > 0}
                aria-controls="global-search-results"
              />
              {loading && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>

            <div
              id="global-search-results"
              ref={listRef}
              className="max-h-[min(24rem,60vh)] overflow-y-auto p-2"
            >
              {showRecents && (
                <>
                  <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <Clock className="h-3 w-3" />
                    {t("search.recent")}
                  </p>
                  {recents.map((item, i) => row(item, i))}
                </>
              )}

              {!searching && !showRecents && (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("search.typeToSearch")}
                </p>
              )}

              {/* TOF-0789 (Tarek 29.10.2026): erste Suche läuft → Ergebnis-Skeleton
                  statt leerer Fläche (der kleine Spinner im Eingabefeld bleibt). */}
              {searching && loading && flat.length === 0 && (
                <SkeletonScreen label={t("common.loading")}>
                  <SkeletonRows rows={4} avatar={false} rowClassName="flex items-center gap-3 rounded-lg px-3 py-2.5" />
                </SkeletonScreen>
              )}

              {searching && !loading && flat.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("search.noResults", { q: trimmed })}
                </p>
              )}

              {searching &&
                (() => {
                  let index = -1;
                  return groups.map((group) => (
                    <div key={group.type}>
                      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {t(SECTION_LABEL[group.type])}
                      </p>
                      {group.rows.map((r) => {
                        index += 1;
                        return row(r.item, index, r.matches);
                      })}
                    </div>
                  ));
                })()}
            </div>

            <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
              <span>
                <kbd className="rounded border bg-background px-1 font-mono">↑↓</kbd>{" "}
                {t("search.hintNavigate")}
              </span>
              <span>
                <kbd className="rounded border bg-background px-1 font-mono">↵</kbd>{" "}
                {t("search.hintOpen")}
              </span>
              <span>
                <kbd className="rounded border bg-background px-1 font-mono">esc</kbd>{" "}
                {t("search.hintClose")}
              </span>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
