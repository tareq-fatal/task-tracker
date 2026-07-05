"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { uploadAttachmentAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { ErrorText } from "@/components/error-text";

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
      if (res.error) setError(res.error);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
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
      <ErrorText code={error} className="mt-1 text-xs text-destructive" />
    </div>
  );
}
