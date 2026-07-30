"use client";

import { useEffect } from "react";
import { markCommentsReadAction } from "@/actions/tasks";

// #12 — marks the task's comment thread read for the current user on open.
export function MarkCommentsRead({ taskId }: { taskId: string }) {
  useEffect(() => {
    markCommentsReadAction(taskId).catch(() => {});
  }, [taskId]);
  return null;
}
