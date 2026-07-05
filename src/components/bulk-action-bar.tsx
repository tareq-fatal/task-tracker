"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Flag, UserRound, Layers, Tag, Trash2, X, Check } from "lucide-react";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { UndoToast } from "@/components/undo-toast";
import {
  bulkSetStatusAction,
  bulkSetPriorityAction,
  bulkAssignAction,
  bulkSetSprintAction,
  bulkAddTagAction,
  bulkDeleteAction,
  undoBulkAction,
  type BulkResult,
  type UndoToken,
} from "@/actions/bulk";

export type NamedOption = { id: string; name: string };
export type SprintOption = { id: string; name: string; project: string };

const UNSET = "__none__";

export function BulkActionBar({
  ids,
  onCleared,
  isAdmin,
  users,
  sprints,
  tagSuggestions,
}: {
  ids: string[];
  onCleared: () => void;
  isAdmin: boolean;
  users: NamedOption[];
  sprints: SprintOption[];
  tagSuggestions: string[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [undo, setUndo] = useState<{ token: UndoToken; message: string; nonce: number } | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const nonceRef = useRef(0);

  const showSprint = isAdmin && sprints.length > 0;
  const showAssign = users.length > 0;

  function run(message: (n: number) => string, fn: () => Promise<BulkResult>) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setUndo(
          res.undo ? { token: res.undo, message: message(res.count), nonce: ++nonceRef.current } : null
        );
        setTagOpen(false);
        setTagValue("");
        onCleared();
        router.refresh();
      }
    });
  }

  function doUndo() {
    if (!undo) return;
    const token = undo.token;
    start(async () => {
      await undoBulkAction(token);
      setUndo(null);
      router.refresh();
    });
  }

  function addTag() {
    const name = tagValue.trim();
    if (!name) return;
    run((n) => t("bulk.tagged", { n }), () => bulkAddTagAction(ids, name));
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-col items-center gap-2 px-3">
      {undo && (
        <UndoToast
          key={undo.nonce}
          message={undo.message}
          pending={pending}
          onUndo={doUndo}
          onDismiss={() => setUndo(null)}
        />
      )}

      {ids.length > 0 && (
        <div className="pointer-events-auto flex max-w-[96vw] flex-wrap items-center justify-center gap-2 rounded-2xl border bg-card/95 px-3 py-2 shadow-xl backdrop-blur">
          <span className="ps-1 text-sm font-semibold">
            {t("bulk.selected", { n: ids.length })}
          </span>

          {/* Move to column / status */}
          <BarSelect
            icon={<Columns3 className="h-4 w-4" />}
            label={t("bulk.move")}
            disabled={pending}
            onPick={(v) => run((n) => t("bulk.updated", { n }), () => bulkSetStatusAction(ids, v))}
            options={TASK_STATUSES.map((s) => ({ value: s, label: t(`status.${s}` as TKey) }))}
          />

          {/* Priority */}
          <BarSelect
            icon={<Flag className="h-4 w-4" />}
            label={t("bulk.priority")}
            disabled={pending}
            onPick={(v) => run((n) => t("bulk.updated", { n }), () => bulkSetPriorityAction(ids, v))}
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}` as TKey) }))}
          />

          {/* Assign */}
          {showAssign && (
            <BarSelect
              icon={<UserRound className="h-4 w-4" />}
              label={t("bulk.assign")}
              disabled={pending}
              onPick={(v) =>
                run((n) => t("bulk.updated", { n }), () =>
                  bulkAssignAction(ids, v === UNSET ? null : v)
                )
              }
              options={[
                { value: UNSET, label: t("bulk.unassign") },
                ...users.map((u) => ({ value: u.id, label: u.name })),
              ]}
            />
          )}

          {/* Sprint */}
          {showSprint && (
            <BarSelect
              icon={<Layers className="h-4 w-4" />}
              label={t("bulk.sprint")}
              disabled={pending}
              onPick={(v) =>
                run((n) => t("bulk.updated", { n }), () =>
                  bulkSetSprintAction(ids, v === UNSET ? null : v)
                )
              }
              options={[
                { value: UNSET, label: t("bulk.removeSprint") },
                ...sprints.map((s) => ({ value: s.id, label: `${s.project} · ${s.name}` })),
              ]}
            />
          )}

          {/* Tag */}
          {tagOpen ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                list="bulk-tag-suggestions"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTag();
                  if (e.key === "Escape") setTagOpen(false);
                }}
                placeholder={t("bulk.tagName")}
                maxLength={32}
                className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
              />
              <datalist id="bulk-tag-suggestions">
                {tagSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <Button size="sm" variant="outline" disabled={pending || !tagValue.trim()} onClick={addTag}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setTagOpen(true)}>
              <Tag className="me-1 h-4 w-4" />
              {t("bulk.tag")}
            </Button>
          )}

          {/* Delete */}
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (confirm(t("bulk.deleteConfirm", { n: ids.length }))) {
                run((n) => t("bulk.deleted", { n }), () => bulkDeleteAction(ids));
              }
            }}
          >
            <Trash2 className="me-1 h-4 w-4" />
            {t("bulk.delete")}
          </Button>

          {/* Clear */}
          <button
            type="button"
            aria-label={t("bulk.clear")}
            onClick={onCleared}
            className="rounded-full p-1.5 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** A compact select styled as a pill; resets to the placeholder after each pick. */
function BarSelect({
  icon,
  label,
  options,
  onPick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-md border bg-background ps-2 pe-1 text-sm has-[:disabled]:opacity-50">
      <span className="text-muted-foreground">{icon}</span>
      <select
        aria-label={label}
        value=""
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
        className="h-9 cursor-pointer bg-transparent pe-1 text-sm outline-none"
      >
        <option value="">{label}…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
