"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Plus, X } from "lucide-react";
import { saveViewAction, deleteSavedViewAction, type SavedViewLite } from "@/actions/saved-views";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SavedViews({
  saved, view, entityId,
}: { saved: SavedViewLite[]; view: string; entityId: string | null }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const href = (v: SavedViewLite) => `/tasks?view=${v.view}${v.entityId ? `&id=${v.entityId}` : ""}`;

  function save() {
    if (!name.trim()) return;
    start(async () => {
      await saveViewAction(name, view, entityId);
      setName(""); setAdding(false); router.refresh();
    });
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <Bookmark className="h-3.5 w-3.5" /> {t("saved.title")}
      </span>
      {saved.map((v) => (
        <span key={v.id} className="group inline-flex items-center gap-1 rounded-full border bg-card py-1 pe-1 ps-3 text-sm" data-testid="saved-view">
          <Link href={href(v)} className="font-medium hover:underline">{v.name}</Link>
          <button
            title={t("saved.delete")} disabled={pending}
            onClick={() => start(async () => { await deleteSavedViewAction(v.id); router.refresh(); })}
            className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-1">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder={t("saved.name")} className="h-8 w-40" />
          <Button size="sm" onClick={save} disabled={pending || !name.trim()}>{t("saved.save")}</Button>
        </span>
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" /> {t("saved.save")}
        </button>
      )}
    </div>
  );
}
