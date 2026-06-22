"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/components/i18n-provider";

export function ProjectFilter({
  projects,
  current,
  basePath,
}: {
  projects: { id: string; name: string }[];
  current: string;
  basePath: string;
}) {
  const router = useRouter();
  const { t } = useT();

  return (
    <Select
      value={current}
      onValueChange={(v) =>
        router.push(v === "all" ? basePath : `${basePath}?project=${v}`)
      }
    >
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("board.allProjects")}</SelectItem>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
