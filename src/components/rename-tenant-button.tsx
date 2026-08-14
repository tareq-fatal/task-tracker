"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { renameTenantAction } from "@/actions/tenants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n-provider";
import { useToast } from "@/components/toast";
import type { TKey } from "@/lib/i18n";

type Props = {
  tenantId: string;
  tenantName: string;
  /** shown read-only — the slug is wired into cookies, URLs and upload paths */
  tenantSlug: string;
};

/** BackendAdmin-only rename on the Mandanten list. Changes the display name;
 *  the slug is deliberately read-only (see renameTenantAction). */
export function RenameTenantButton({ tenantId, tenantName, tenantSlug }: Props) {
  const { t } = useT();
  const { toast } = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(tenantName);
  const [pending, start] = useTransition();

  const trimmed = name.trim();
  const canSave = !!trimmed && trimmed !== tenantName && !pending;

  function submit() {
    start(async () => {
      const res = await renameTenantAction(tenantId, trimmed).catch(() => ({
        error: "GENERIC",
      }));
      if (res.error) {
        const key = `mandant.rename.err.${res.error}` as TKey;
        toast(t(key) || t("mandant.rename.err.GENERIC"), "error");
        return;
      }
      setOpen(false);
      toast(t("mandant.rename.success", { name: trimmed }), "success");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setName(tenantName);
          setOpen(true);
        }}
        title={t("mandant.rename.button")}
        data-testid="rename-tenant"
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mandant.rename.title")}</DialogTitle>
            <DialogDescription>
              {t("mandant.rename.desc", { slug: tenantSlug })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="rename-tenant-name">{t("tenants.name")} *</Label>
              <Input
                id="rename-tenant-name"
                value={name}
                maxLength={120}
                autoFocus
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave) submit();
                }}
                data-testid="rename-tenant-input"
              />
            </div>

            {/* The slug is identity, not decoration — visible but locked. */}
            <div className="space-y-1">
              <Label htmlFor="rename-tenant-slug">{t("tenants.slug")}</Label>
              <Input id="rename-tenant-slug" value={tenantSlug} disabled readOnly />
              <p className="text-xs text-muted-foreground">
                {t("mandant.rename.slugLocked")}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={!canSave}
                data-testid="rename-tenant-save"
              >
                {pending && <Loader2 className="me-1 h-4 w-4 animate-spin" />}
                {t("task.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
