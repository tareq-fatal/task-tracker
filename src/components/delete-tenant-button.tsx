"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n-provider";
import { SkeletonScreen, Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { formatNumber } from "@/lib/format";
import type { TenantDeletionPreview } from "@/lib/tenant-deletion";
import type { TKey } from "@/lib/i18n";

type Props = {
  tenantId: string;
  tenantName: string;
  /** the acting BackendAdmin's own tenant — the delete button is locked for it */
  ownTenantId: string;
};

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function DeleteTenantButton({ tenantId, tenantName, ownTenantId }: Props) {
  const { t, locale } = useT();
  const { toast } = useToast();
  const router = useRouter();

  const isSelf = tenantId === ownTenantId;

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<TenantDeletionPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [wordInput, setWordInput] = useState("");
  const [pending, start] = useTransition();

  // stage-2 gate: the operator must retype the exact Mandant name AND the
  // fixed confirm word (locale-specific, e.g. LÖSCHEN / DELETE / حذف).
  const confirmWord = t("mandant.delete.confirmWord");
  const nameOk = nameInput.trim() === tenantName;
  const wordOk = wordInput.trim().toUpperCase() === confirmWord.toUpperCase();
  const canDelete = nameOk && wordOk && !pending;

  function openModal() {
    setOpen(true);
    setNameInput("");
    setWordInput("");
    setPreview(null);
    setLoadingPreview(true);
    fetch(`/api/admin/mandanten/${tenantId}`)
      .then((r) => r.json())
      .then((d) => setPreview(d.preview ?? null))
      .catch(() => setPreview(null))
      .finally(() => setLoadingPreview(false));
  }

  function submit() {
    start(async () => {
      const res = await fetch(`/api/admin/mandanten/${tenantId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: nameInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOpen(false);
        toast(t("mandant.delete.success", { name: tenantName }), "success");
        // back to a fresh Mandanten list — the deleted row is gone
        router.push("/admin/mandanten");
        router.refresh();
      } else {
        const key = `mandant.delete.err.${data.error}` as TKey;
        const msg = data.error ? t(key) : t("mandant.delete.err.GENERIC");
        toast(msg, "error");
      }
    });
  }

  if (isSelf) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled
        title={t("mandant.delete.selfHint")}
        className="text-muted-foreground"
        data-testid="delete-tenant-disabled"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={openModal}
        title={t("mandant.delete.button")}
        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10"
        data-testid="delete-tenant"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              {t("mandant.delete.title")}
            </DialogTitle>
            <DialogDescription>
              {t("mandant.delete.desc", { name: tenantName })}
            </DialogDescription>
          </DialogHeader>

          {/* Preview statistics */}
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="mb-2 font-semibold text-rose-700 dark:text-rose-300">
              {t("mandant.delete.willRemove")}
            </p>
            {loadingPreview || !preview ? (
              // TOF-0789 (Tarek 29.10.2026): Vorschau lädt → 6 Kennzahl-Zeilen als Skeleton
              <SkeletonScreen label={t("common.loading")} className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} aria-hidden="true" className="flex h-5 items-center justify-between gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                ))}
              </SkeletonScreen>
            ) : (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-rose-900 dark:text-rose-100">
                <Stat label={t("tenants.users")} value={formatNumber(preview.users, locale, 0)} />
                <Stat label={t("tenants.projects")} value={formatNumber(preview.projects, locale, 0)} />
                <Stat label={t("tenants.tasks")} value={formatNumber(preview.tasks, locale, 0)} />
                <Stat label={t("mandant.delete.teams")} value={formatNumber(preview.teams, locale, 0)} />
                <Stat label={t("mandant.delete.comments")} value={formatNumber(preview.comments, locale, 0)} />
                <Stat
                  label={t("mandant.delete.files")}
                  value={`${formatNumber(preview.attachments, locale, 0)} · ${mb(preview.fileBytes)} MB`}
                />
              </ul>
            )}
          </div>

          {/* Stage-2 double confirm */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="dt-name">
                {t("mandant.delete.typeName", { name: tenantName })}
              </Label>
              <Input
                id="dt-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                autoComplete="off"
                data-testid="delete-tenant-name"
                className={nameOk ? "border-emerald-400" : undefined}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dt-word">
                {t("mandant.delete.typeWord", { word: confirmWord })}
              </Label>
              <Input
                id="dt-word"
                value={wordInput}
                onChange={(e) => setWordInput(e.target.value)}
                autoComplete="off"
                data-testid="delete-tenant-word"
                placeholder={confirmWord}
                className={wordOk ? "border-emerald-400" : undefined}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={submit}
              disabled={!canDelete}
              data-testid="delete-tenant-confirm"
            >
              {pending ? (
                <Loader2 className="me-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="me-1 h-4 w-4" />
              )}
              {t("mandant.delete.button")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </li>
  );
}
