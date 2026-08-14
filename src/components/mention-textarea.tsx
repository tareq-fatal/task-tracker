"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n-provider";
import { mentionCandidatesAction } from "@/actions/mentions";
import { activeMentionQuery, applyMention } from "@/lib/mentions-core";
import type { MentionCandidate } from "@/lib/mentions";

const MAX_VISIBLE = 6;

type Props = {
  taskId: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  rows?: number;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

/**
 * Textarea with an @-mention picker. Typing "@" loads everyone who may see the
 * task (once, then filtered client-side) and inserts the USERNAME on pick —
 * that is what the server resolves mentions by.
 */
export function MentionTextarea({
  taskId,
  value,
  onChange,
  name,
  rows = 2,
  required,
  placeholder,
  className,
}: Props) {
  const { t } = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [people, setPeople] = useState<MentionCandidate[] | null>(null);
  const [token, setToken] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  // Caret to restore after an insertion — applied once the value has rendered.
  const caretAfterInsert = useRef<number | null>(null);

  // Load the candidate list on the first "@" and keep it for this mount.
  useEffect(() => {
    if (!token || people !== null) return;
    let cancelled = false;
    mentionCandidatesAction(taskId)
      .then((list) => !cancelled && setPeople(list))
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, [token, people, taskId]);

  useEffect(() => {
    if (caretAfterInsert.current === null) return;
    const pos = caretAfterInsert.current;
    caretAfterInsert.current = null;
    ref.current?.focus();
    ref.current?.setSelectionRange(pos, pos);
  }, [value]);

  const matches = useMemo(() => {
    if (!token || !people) return [];
    const q = token.query;
    return people
      .filter(
        (p) =>
          !q ||
          p.username.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q)
      )
      .slice(0, MAX_VISIBLE);
  }, [token, people]);

  const open = token !== null && (people === null || matches.length > 0);

  function sync(el: HTMLTextAreaElement) {
    const next = activeMentionQuery(el.value, el.selectionStart ?? 0);
    setToken(next);
    setActive(0);
  }

  function pick(person: MentionCandidate) {
    if (!token) return;
    const next = applyMention(value, token, person.username);
    onChange(next.text);
    caretAfterInsert.current = next.caret;
    setToken(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      // Enter picks the highlighted person instead of submitting the form.
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setToken(null);
    }
  }

  return (
    <div className="relative">
      {open && (
        <ul
          role="listbox"
          aria-label={t("mention.listLabel")}
          className="absolute bottom-full start-0 z-50 mb-1 w-72 max-w-full overflow-hidden rounded-md border bg-popover p-1 shadow-md"
          data-testid="mention-picker"
        >
          {people === null ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              {t("common.loading")}
            </li>
          ) : (
            matches.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  // mousedown, not click: the textarea must not blur first
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(p);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm",
                    i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  )}
                  data-testid="mention-option"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                    {p.avatar && !p.avatar.startsWith("http")
                      ? p.avatar
                      : p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    @{p.username}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <Textarea
        ref={ref}
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          sync(e.target);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => sync(e.currentTarget)}
        onBlur={() => setToken(null)}
      />
    </div>
  );
}
