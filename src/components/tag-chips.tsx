import { cn } from "@/lib/utils";

export type TagLite = { name: string; color: string };

/** Small colored label chips shown on cards/rows. */
export function TagChips({ tags, className }: { tags: TagLite[]; className?: string }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {tags.map((tag) => (
        <span
          key={tag.name}
          className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none"
          style={{
            color: tag.color,
            borderColor: `${tag.color}55`,
            backgroundColor: `${tag.color}14`,
          }}
        >
          {tag.name}
        </span>
      ))}
    </div>
  );
}

/** Normalize the Prisma `tags: { tag: {...} }[]` shape into flat TagLite[]. */
export function flattenTags(
  tags?: { tag: { name: string; color: string } }[] | null
): TagLite[] {
  return (tags ?? []).map((t) => t.tag);
}
