"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { addCommentAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { TooltipHelp } from "@/components/ui/tooltip";
import { MentionTextarea } from "@/components/mention-textarea";
import { useT } from "@/components/i18n-provider";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <TooltipHelp textKey="tooltip.comment">
      <Button type="submit" size="sm" disabled={pending}>
        <Send className="me-1 h-4 w-4" />
        {label}
      </Button>
    </TooltipHelp>
  );
}

export function CommentForm({ taskId }: { taskId: string }) {
  const { t } = useT();
  const ref = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState("");
  const action = addCommentAction.bind(null, taskId);
  const [, formAction] = useFormState(action, {});

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await formAction(fd);
        ref.current?.reset();
        setValue("");
      }}
      className="space-y-2"
    >
      <MentionTextarea
        taskId={taskId}
        name="content"
        required
        rows={2}
        placeholder={t("task.addComment")}
        value={value}
        onChange={setValue}
      />
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">{t("mention.hint")}</span>
        <Submit label={t("task.send")} />
      </div>
    </form>
  );
}
