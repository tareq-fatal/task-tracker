"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, Users } from "lucide-react";
import {
  addProjectMemberAction,
  removeProjectMemberAction,
} from "@/actions/projects";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

type U = { id: string; name: string; username: string };

// Admin-only: grant/revoke project access. Members see ALL tasks in the project.
export function ProjectMembers({
  projectId,
  members,
  candidates,
}: {
  projectId: string;
  members: U[];
  candidates: U[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState("");

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("project.members")}</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t("project.membersHint")}</p>

      {members.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">{t("project.noMembers")}</p>
      ) : (
        <ul className="mb-3 flex flex-wrap gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-sm"
            >
              {m.name}
              <button
                aria-label={`${t("project.removeMember")}: ${m.name}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await removeProjectMemberAction(projectId, m.id);
                    router.refresh();
                  })
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            aria-label={t("project.addMember")}
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="h-9 flex-1 rounded-md border bg-background px-2 text-sm sm:max-w-xs"
          >
            <option value="">{t("project.addMember")}…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} (@{u.username})
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={pending || !sel}
            onClick={() =>
              start(async () => {
                await addProjectMemberAction(projectId, sel);
                setSel("");
                router.refresh();
              })
            }
          >
            <UserPlus className="me-1 h-4 w-4" />
            {t("project.add")}
          </Button>
        </div>
      )}
    </div>
  );
}
