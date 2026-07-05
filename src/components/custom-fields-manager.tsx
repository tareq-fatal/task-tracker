"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { KeyboardSensor } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  addFieldDefAction, deleteFieldDefAction, toggleRequiredAction, reorderFieldDefsAction, type FieldDefLite,
} from "@/actions/custom-fields";
import { FIELD_TYPES } from "@/lib/custom-fields";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Project = { id: string; name: string };

function Row({
  f, pending, onToggle, onDelete,
}: {
  f: FieldDefLite;
  pending: boolean;
  onToggle: (required: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <li
      ref={setNodeRef} style={style} data-testid="cf-def"
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
    >
      <button
        type="button" {...attributes} {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={t("cf.reorder")}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="font-medium">{f.name}</span>
      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">{t(`cf.type.${f.type}` as never)}</span>
      {f.type === "select" && <span className="text-xs text-muted-foreground">{f.options.join(" · ")}</span>}
      <label className="ms-auto flex items-center gap-1 text-xs">
        <input
          type="checkbox" checked={f.required} disabled={pending}
          onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 accent-indigo-600"
        />
        {t("cf.required")}
      </label>
      <button
        disabled={pending} title={t("cf.delete")} onClick={onDelete}
        className="rounded p-1.5 text-rose-500 hover:bg-rose-50 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

export function CustomFieldsManager({
  initial, projects, scope,
}: {
  initial: FieldDefLite[];
  projects: Project[];
  scope: string; // "" = tenant-wide, else projectId
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [defs, setDefs] = useState(initial);
  const [name, setName] = useState("");
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");
  const [err, setErr] = useState("");

  // Keep local order in sync when the server sends a new scope/list.
  useEffect(() => { setDefs(initial); }, [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) =>
    start(async () => { const r = await fn(); if (r.error) setErr(r.error); else setErr(""); router.refresh(); });

  function add() {
    if (!name.trim()) return;
    run(async () => {
      const r = await addFieldDefAction(name, type, options.split(",").map((o) => o.trim()).filter(Boolean), scope || null);
      if (r.ok) { setName(""); setOptions(""); }
      return r;
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = defs.findIndex((d) => d.id === active.id);
    const newIdx = defs.findIndex((d) => d.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(defs, oldIdx, newIdx);
    setDefs(next); // optimistic
    start(async () => {
      const r = await reorderFieldDefsAction(next.map((d) => d.id));
      if (r.error) { setErr(r.error); router.refresh(); }
    });
  }

  function changeScope(v: string) {
    const q = v ? `?project=${encodeURIComponent(v)}` : "";
    router.push(`/admin/custom-fields${q}`);
  }

  return (
    <div className="space-y-5">
      {/* Scope selector — tenant-wide vs. a specific project */}
      <label className="flex flex-col gap-1 text-xs">
        {t("cf.scope")}
        <select
          aria-label={t("cf.scope")} value={scope} onChange={(e) => changeScope(e.target.value)}
          className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm"
        >
          <option value="">{t("cf.scopeAll")}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      {defs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("cf.empty")}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={defs.map((d) => d.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {defs.map((f) => (
                <Row
                  key={f.id} f={f} pending={pending}
                  onToggle={(req) => run(() => toggleRequiredAction(f.id, req))}
                  onDelete={() => run(() => deleteFieldDefAction(f.id))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
        <label className="flex flex-col gap-1 text-xs">
          {t("cf.name")}
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cf.name")} className="w-48" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("cf.type")}
          <select aria-label={t("cf.type")} value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t(`cf.type.${ft}` as never)}</option>)}
          </select>
        </label>
        {type === "select" && (
          <label className="flex flex-col gap-1 text-xs">
            {t("cf.options")}
            <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="A, B, C" className="w-48" />
          </label>
        )}
        <Button onClick={add} disabled={pending || !name.trim()}><Plus className="me-1 h-4 w-4" /> {t("cf.add")}</Button>
        {err && <span className="text-xs font-medium text-destructive">{err}</span>}
      </div>
    </div>
  );
}
