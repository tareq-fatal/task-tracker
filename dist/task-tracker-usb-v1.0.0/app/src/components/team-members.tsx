"use client";

import { useRef, useTransition } from "react";
import { useFormState } from "react-dom";
import { UserMinus, UserPlus } from "lucide-react";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
} from "@/actions/teams";
import { initials } from "@/lib/tasks";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

type Member = { userId: string; name: string; role: string };
type Candidate = { id: string; name: string };

const selectClass =
  "h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function MemberRow({ teamId, member }: { teamId: string; member: Member }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar className="h-9 w-9">
        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-pink-500 text-xs text-white">
          {initials(member.name)}
        </AvatarFallback>
      </Avatar>
      <span className="flex-1 truncate text-sm font-medium">{member.name}</span>
      <Badge variant="secondary">{member.role}</Badge>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={pending}
        aria-label="remove"
        onClick={() =>
          startTransition(async () => {
            await removeTeamMemberAction(teamId, member.userId);
          })
        }
      >
        <UserMinus className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export function TeamMembers({
  teamId,
  members,
  candidates,
}: {
  teamId: string;
  members: Member[];
  candidates: Candidate[];
}) {
  const { t } = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const action = addTeamMemberAction.bind(null, teamId);
  const [, formAction] = useFormState(
    async (_p: { error?: string }, fd: FormData) => action(fd),
    {}
  );

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("teams.members")} ({members.length})
      </h2>

      <div className="divide-y">
        {members.map((m) => (
          <MemberRow key={m.userId} teamId={teamId} member={m} />
        ))}
        {members.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">—</p>
        )}
      </div>

      {candidates.length > 0 && (
        <form
          ref={formRef}
          action={async (fd) => {
            await formAction(fd);
            formRef.current?.reset();
          }}
          className="flex items-center gap-2 pt-1"
        >
          <select name="userId" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              {t("teams.addMember")}…
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            <UserPlus className="me-1 h-4 w-4" />
            {t("teams.addMember")}
          </Button>
        </form>
      )}
    </div>
  );
}
