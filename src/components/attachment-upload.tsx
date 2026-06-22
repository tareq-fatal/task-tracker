"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { uploadAttachmentAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

const ERRORS: Record<string, string> = {
  NO_FILE: "Keine Datei ausgewählt · No file selected",
  TOO_LARGE: "Datei zu groß (max 5 MB) · File too large (max 5 MB)",
  BAD_TYPE: "Nur Bilder & PDF · Images & PDF only",
};

export function AttachmentUpload({ taskId }: { taskId: string }) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadAttachmentAction(taskId, fd);
      if (res.error) setError(ERRORS[res.error] ?? res.error);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
        className="hidden"
        onChange={onChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? (
          <Loader2 className="me-1 h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="me-1 h-4 w-4" />
        )}
        {t("task.upload")}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
