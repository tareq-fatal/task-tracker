"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { addCommentAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n-provider";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Send className="mr-1 h-4 w-4" />
      {label}
    </Button>
  );
}

export function CommentForm({ taskId }: { taskId: string }) {
  const { t } = useT();
  const ref = useRef<HTMLFormElement>(null);
  const action = addCommentAction.bind(null, taskId);
  const [, formAction] = useFormState(action, {});

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await formAction(fd);
        ref.current?.reset();
      }}
      className="space-y-2"
    >
      <Textarea
        name="content"
        required
        rows={2}
        placeholder={t("task.addComment")}
      />
      <div className="flex justify-end">
        <Submit label={t("task.send")} />
      </div>
    </form>
  );
}
