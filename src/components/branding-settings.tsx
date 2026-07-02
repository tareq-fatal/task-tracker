"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Check } from "lucide-react";
import { updateBrandingAction, uploadLogoAction, removeLogoAction, type BrandingData } from "@/actions/branding";
import { THEMES } from "@/lib/branding";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BrandingSettings({ initial, tenantName }: { initial: BrandingData; tenantName: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [theme, setTheme] = useState(initial.themeName);
  const [primary, setPrimary] = useState(initial.primaryColor);
  const [secondary, setSecondary] = useState(initial.secondaryColor);
  const [accent, setAccent] = useState(initial.accentColor);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isCustom = theme === "custom";
  const preset = THEMES.find((x) => x.name === theme) ?? THEMES[0];
  // effective colours: custom uses the pickers, presets use their palette
  const cols = isCustom ? { primary, secondary, accent } : { primary: preset.primary, secondary: preset.secondary, accent: preset.accent };

  function save() {
    setSaved(false);
    start(async () => {
      await updateBrandingAction({ themeName: theme, primaryColor: primary, secondaryColor: secondary, accentColor: accent });
      setSaved(true);
      router.refresh();
    });
  }
  function upload(file: File) {
    const fd = new FormData();
    fd.set("logo", file);
    start(async () => { await uploadLogoAction({}, fd); router.refresh(); });
  }

  const swatch = (label: string, value: string, set: (v: string) => void) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={value} onChange={(e) => set(e.target.value)} disabled={!isCustom} className="h-9 w-10 cursor-pointer rounded border bg-transparent p-0.5 disabled:opacity-40" />
        <Input aria-label={`${label} (hex)`} value={value} onChange={(e) => set(e.target.value)} disabled={!isCustom} className="w-28 font-mono text-xs" />
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Controls */}
      <div className="space-y-5">
        <div className="space-y-1">
          <Label>{t("brand.theme")}</Label>
          <select aria-label={t("brand.theme")} value={theme} onChange={(e) => setTheme(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
            {THEMES.map((th) => <option key={th.name} value={th.name}>{th.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {swatch(t("brand.primary"), primary, setPrimary)}
          {swatch(t("brand.secondary"), secondary, setSecondary)}
          {swatch(t("brand.accent"), accent, setAccent)}
        </div>

        <div className="space-y-1">
          <Label>{t("brand.logo")}</Label>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
              <Upload className="me-1 h-4 w-4" /> {t("brand.upload")}
            </Button>
            {initial.logo && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await removeLogoAction(); router.refresh(); })}>
                <Trash2 className="me-1 h-4 w-4" /> {t("brand.remove")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("brand.logoHint")}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}><Check className="me-1 h-4 w-4" /> {t("brand.save")}</Button>
          {saved && <span className="text-sm font-medium text-emerald-600">{t("brand.saved")}</span>}
        </div>
      </div>

      {/* Live preview */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("brand.preview")}</p>
        <div className="overflow-hidden rounded-xl border shadow-sm" data-testid="brand-preview">
          <div className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${cols.primary}, ${cols.secondary}, ${cols.accent})` }} />
          <div className="flex items-center gap-2 border-b p-4">
            {initial.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={initial.logo} alt={tenantName} className="h-7 max-w-[160px] object-contain" />
            ) : (
              <span className="text-lg font-bold" style={{ color: cols.primary }}>{tenantName}</span>
            )}
          </div>
          <div className="space-y-3 p-4">
            <button className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: cols.primary }}>Primary</button>
            <div className="flex gap-2">
              <span className="h-6 w-6 rounded-full" style={{ backgroundColor: cols.primary }} />
              <span className="h-6 w-6 rounded-full" style={{ backgroundColor: cols.secondary }} />
              <span className="h-6 w-6 rounded-full" style={{ backgroundColor: cols.accent }} />
            </div>
            <div className="h-2 w-3/4 rounded-full" style={{ backgroundColor: cols.secondary, opacity: 0.5 }} />
            <div className="h-2 w-1/2 rounded-full" style={{ backgroundColor: cols.accent, opacity: 0.5 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
