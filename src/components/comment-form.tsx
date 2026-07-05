"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { addCommentAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/rich-text-editor";
import { useT } from "@/components/i18n-provider";

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || disabled}>
      <Send className="me-1 h-4 w-4" />
      {label}
    </Button>
  );
}

export function CommentForm({ taskId }: { taskId: string }) {
  const { t } = useT();
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [empty, setEmpty] = useState(true);
  const action = addCommentAction.bind(null, taskId);
  const [, formAction] = useFormState(action, {});

  return (
    <form
      action={async (fd) => {
        await formAction(fd);
        editorRef.current?.clear();
      }}
      className="space-y-2"
    >
      <RichTextEditor
        ref={editorRef}
        name="content"
        placeholder={t("task.addComment")}
        onEmptyChange={setEmpty}
        contentMinHeight="3.5rem"
      />
      <div className="flex justify-end">
        <Submit label={t("task.send")} disabled={empty} />
      </div>
    </form>
  );
}
