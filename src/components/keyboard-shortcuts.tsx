"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteTaskAction, findRunningTimerTaskAction } from "@/actions/tasks";
import { useT } from "@/components/i18n-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** How long a leading "G" stays armed for G+K / G+S / G+T sequences. */
const SEQUENCE_TIMEOUT_MS = 1500;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 bg-secondary px-1.5 font-mono text-[11px] font-semibold text-foreground">
      {children}
    </kbd>
  );
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Extract a task id from a link href / pathname like "/tasks/abc123". */
function taskIdFrom(path: string | null): string | null {
  if (!path) return null;
  const m = path.match(/^\/tasks\/([^/?#]+)$/);
  return m && m[1] !== "new" ? m[1] : null;
}

function visibleTaskLinks(): HTMLAnchorElement[] {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href^="/tasks/"]')
  ).filter(
    (a) => taskIdFrom(a.getAttribute("href")) !== null && a.offsetParent !== null
  );
}

/** The task j/k landed on, or the task whose detail page is open. */
function currentTaskId(pathname: string): string | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const link = active.closest("a");
    const id = link ? taskIdFrom(link.getAttribute("href")) : null;
    if (id) return id;
  }
  return taskIdFrom(pathname);
}

function selectLink(el: HTMLAnchorElement) {
  document
    .querySelectorAll("[data-kbd-selected]")
    .forEach((n) => n.removeAttribute("data-kbd-selected"));
  el.setAttribute("data-kbd-selected", "true");
  el.addEventListener(
    "blur",
    () => el.removeAttribute("data-kbd-selected"),
    { once: true }
  );
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest" });
}

function moveSelection(dir: 1 | -1) {
  const links = visibleTaskLinks();
  if (links.length === 0) return;
  const active =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.closest("a")
      : null;
  const idx = active ? links.indexOf(active as HTMLAnchorElement) : -1;
  const next =
    idx === -1
      ? dir === 1
        ? 0
        : links.length - 1
      : Math.min(Math.max(idx + dir, 0), links.length - 1);
  selectLink(links[next]);
}

function focusSearch(): boolean {
  const el = document.querySelector<HTMLInputElement>(
    'input[data-shortcut="search"]'
  );
  if (!el) return false;
  el.focus();
  el.select();
  return true;
}

export function KeyboardShortcuts({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);
  const [, startTransition] = useTransition();
  const gArmedAt = useRef(0);

  // Refs so the single window listener never goes stale.
  const stateRef = useRef({ pathname, isAdmin, helpOpen });
  stateRef.current = { pathname, isAdmin, helpOpen };
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const { pathname, isAdmin, helpOpen } = stateRef.current;

      // Cmd/Ctrl+Enter submits the surrounding form — also while typing.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const form =
          e.target instanceof HTMLElement ? e.target.closest("form") : null;
        if (form) {
          e.preventDefault();
          form.requestSubmit();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // While typing: only Esc (blur the field; Radix handles dialogs itself).
      if (isEditableTarget(e.target)) {
        if (e.key === "Escape" && e.target instanceof HTMLElement) {
          e.target.blur();
        }
        gArmedAt.current = 0;
        return;
      }

      // While the cheatsheet is open, only "?" (toggle) — Esc closes via Radix.
      if (helpOpen && e.key !== "?") return;
      // Inside any other open dialog, leave keys to the dialog.
      if (
        !helpOpen &&
        e.target instanceof HTMLElement &&
        e.target.closest('[role="dialog"]')
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // G+K / G+S / G+T sequences
      if (gArmedAt.current && Date.now() - gArmedAt.current < SEQUENCE_TIMEOUT_MS) {
        gArmedAt.current = 0;
        if (key === "k") {
          e.preventDefault();
          router.push("/board");
          return;
        }
        if (key === "s" && isAdmin) {
          e.preventDefault();
          router.push("/sprints");
          return;
        }
        if (key === "t") {
          e.preventDefault();
          startTransition(async () => {
            const res = await findRunningTimerTaskAction();
            router.push(res ? `/tasks/${res.id}` : "/");
          });
          return;
        }
        // not a known sequence — fall through to single-key handling
      }
      if (key === "g" && !e.shiftKey && !e.repeat) {
        gArmedAt.current = Date.now();
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      if (e.key === "/") {
        if (focusSearch()) e.preventDefault();
        return;
      }
      if (e.shiftKey) return;

      switch (key) {
        case "n":
          e.preventDefault();
          router.push("/tasks/new");
          return;
        case "j":
          e.preventDefault();
          moveSelection(1);
          return;
        case "k":
          e.preventDefault();
          moveSelection(-1);
          return;
        case "e": {
          const id = currentTaskId(pathname);
          if (!id) return;
          e.preventDefault();
          router.push(`/tasks/${id}/edit`);
          return;
        }
        case "d": {
          // Deletion is admin-only (2026-08-02) — the shortcut must not offer
          // non-admins a delete path the UI hides everywhere else.
          if (!isAdmin) return;
          const id = currentTaskId(pathname);
          if (!id) return;
          e.preventDefault();
          if (!window.confirm(tRef.current("task.deleteConfirm"))) return;
          startTransition(() => deleteTaskAction(id));
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: {
    section: string;
    items: { keys: React.ReactNode; label: string }[];
  }[] = [
    {
      section: t("shortcuts.general"),
      items: [
        { keys: <Kbd>N</Kbd>, label: t("shortcuts.newTask") },
        { keys: <Kbd>/</Kbd>, label: t("shortcuts.search") },
        {
          keys: (
            <span className="flex items-center gap-1">
              <Kbd>⌘/Ctrl</Kbd>
              <span className="text-muted-foreground">+</span>
              <Kbd>Enter</Kbd>
            </span>
          ),
          label: t("shortcuts.submitForm"),
        },
        { keys: <Kbd>Esc</Kbd>, label: t("shortcuts.closeModal") },
        { keys: <Kbd>?</Kbd>, label: t("shortcuts.help") },
      ],
    },
    {
      section: t("shortcuts.navigation"),
      items: [
        {
          keys: (
            <span className="flex items-center gap-1">
              <Kbd>G</Kbd>
              <span className="text-muted-foreground">{t("shortcuts.then")}</span>
              <Kbd>K</Kbd>
            </span>
          ),
          label: t("shortcuts.gotoBoard"),
        },
        ...(isAdmin
          ? [
              {
                keys: (
                  <span className="flex items-center gap-1">
                    <Kbd>G</Kbd>
                    <span className="text-muted-foreground">{t("shortcuts.then")}</span>
                    <Kbd>S</Kbd>
                  </span>
                ),
                label: t("shortcuts.gotoSprints"),
              },
            ]
          : []),
        {
          keys: (
            <span className="flex items-center gap-1">
              <Kbd>G</Kbd>
              <span className="text-muted-foreground">{t("shortcuts.then")}</span>
              <Kbd>T</Kbd>
            </span>
          ),
          label: t("shortcuts.gotoTimer"),
        },
        {
          keys: (
            <span className="flex items-center gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd>
            </span>
          ),
          label: t("shortcuts.navigate"),
        },
        { keys: <Kbd>Enter</Kbd>, label: t("shortcuts.open") },
      ],
    },
    {
      section: t("shortcuts.selectedTask"),
      items: [
        { keys: <Kbd>E</Kbd>, label: t("shortcuts.edit") },
        ...(isAdmin ? [{ keys: <Kbd>D</Kbd>, label: t("shortcuts.delete") }] : []),
      ],
    },
  ];

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {rows.map((group) => (
            <div key={group.section}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.section}
              </p>
              <ul className="divide-y rounded-lg border">
                {group.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span>{item.label}</span>
                    {item.keys}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
