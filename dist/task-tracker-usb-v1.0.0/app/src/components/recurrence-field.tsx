"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n-provider";
import { WEEKDAYS } from "@/lib/recurrence";
import { COMMON_TIMEZONES, DEFAULT_RECUR_TZ } from "@/lib/recurring-config";
import type { TKey } from "@/lib/i18n";
import type { TaskDefaults } from "@/components/task-form";

const PRESETS = ["none", "daily", "weekly", "monthly", "custom"] as const;
const END_TYPES = ["never", "count", "until"] as const;

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Full recurrence editor: preset/custom-cron, interval, weekday picker, end
 * condition, and timezone. Self-contained client state drives which sub-inputs
 * are visible; hidden inputs aren't rendered, so the server action just sees the
 * relevant fields. Named the same as the legacy single-select ("recurrence"),
 * plus recurInterval / recurWeekday / recurCron / recurTz / recurEnd*.
 */
export function RecurrenceField({ d }: { d: TaskDefaults }) {
  const { t } = useT();
  const [mode, setMode] = useState<string>(d.recurrence ?? "none");
  const [endType, setEndType] = useState<string>(d.recurEndType ?? "never");

  const isPreset = mode === "daily" || mode === "weekly" || mode === "monthly";
  const recurs = mode !== "none";

  return (
    <div className="space-y-3 rounded-lg border p-3 sm:col-span-2">
      <div className="space-y-2">
        <Label htmlFor="recurrence">{t("task.recurrence")}</Label>
        <select
          id="recurrence"
          name="recurrence"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className={selectClass}
        >
          {PRESETS.map((r) => (
            <option key={r} value={r}>
              {t(`recurrence.${r}` as TKey)}
            </option>
          ))}
        </select>
      </div>

      {isPreset && (
        <div className="flex items-end gap-2">
          <div className="w-28 space-y-1">
            <Label htmlFor="recurInterval" className="text-xs">
              {t("recurrence.interval")}
            </Label>
            <Input
              id="recurInterval"
              name="recurInterval"
              type="number"
              min={1}
              defaultValue={d.recurInterval ?? "1"}
            />
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            {t("recurrence.every")} N · {t(`recurrence.${mode}` as TKey)}
          </p>
        </div>
      )}

      {mode === "weekly" && (
        <div className="space-y-1">
          <Label className="text-xs">{t("recurrence.weekdays")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((code) => (
              <label
                key={code}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 dark:has-[:checked]:bg-indigo-500/20"
              >
                <input
                  type="checkbox"
                  name="recurWeekday"
                  value={code}
                  defaultChecked={d.recurWeekdays?.includes(code) ?? false}
                  className="h-3 w-3"
                />
                {t(`recurrence.wd.${code}` as TKey)}
              </label>
            ))}
          </div>
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-1">
          <Label htmlFor="recurCron" className="text-xs">
            {t("recurrence.cronExpr")}
          </Label>
          <Input
            id="recurCron"
            name="recurCron"
            defaultValue={d.recurCron ?? ""}
            placeholder="0 9 * * 1-5"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">{t("recurrence.cronHint")}</p>
        </div>
      )}

      {recurs && (
        <>
          <div className="space-y-1">
            <Label htmlFor="recurTz" className="text-xs">
              {t("recurrence.timezone")}
            </Label>
            <select
              id="recurTz"
              name="recurTz"
              defaultValue={d.recurTz ?? DEFAULT_RECUR_TZ}
              className={selectClass}
            >
              {COMMON_TIMEZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("recurrence.end")}</Label>
            <div className="flex flex-wrap gap-3">
              {END_TYPES.map((et) => (
                <label key={et} className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="recurEndType"
                    value={et}
                    checked={endType === et}
                    onChange={() => setEndType(et)}
                    className="h-4 w-4"
                  />
                  {t(`recurrence.end.${et}` as TKey)}
                </label>
              ))}
            </div>
            {endType === "count" && (
              <div className="flex items-center gap-2 pt-1">
                <Input
                  name="recurEndCount"
                  type="number"
                  min={1}
                  defaultValue={d.recurEndCount ?? "10"}
                  className="w-28"
                />
                <span className="text-xs text-muted-foreground">
                  {t("recurrence.end.occurrences")}
                </span>
              </div>
            )}
            {endType === "until" && (
              <div className="pt-1">
                <Input
                  name="recurUntil"
                  type="date"
                  defaultValue={d.recurUntil ?? ""}
                  className="w-48"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
