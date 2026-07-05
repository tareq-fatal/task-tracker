"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Paperclip, Loader2, Camera } from "lucide-react";
import { uploadAttachmentAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { isNativeApp, takePhoto } from "@/lib/native";

const ERRORS: Record<string, string> = {
  NO_FILE: "Keine Datei ausgewählt · No file selected",
  TOO_LARGE: "Datei zu groß (max 10 MB) · File too large (max 10 MB)",
  BAD_TYPE: "Bilder, PDF & Office · Images, PDF & Office",
  CAMERA: "Kamera nicht verfügbar · Camera unavailable",
};

export function AttachmentUpload({ taskId }: { taskId: string }) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Detected client-side only, so SSR/web markup never shows the camera button
  // and there is no hydration mismatch.
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);

  function upload(file: File) {
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadAttachmentAction(taskId, fd);
      if (res.error) setError(ERRORS[res.error] ?? res.error);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }

  function onCamera() {
    setError(null);
    startTransition(async () => {
      try {
        const dataUrl = await takePhoto();
        if (!dataUrl) return; // cancelled
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `photo-${Date.now()}.jpg`, {
          type: blob.type || "image/jpeg",
        });
        upload(file);
      } catch {
        setError(ERRORS.CAMERA);
      }
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
      <div className="flex items-center gap-2">
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
        {native && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onCamera}
          >
            <Camera className="me-1 h-4 w-4" />
            Kamera · Camera
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
