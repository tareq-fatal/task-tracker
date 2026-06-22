/** Prisma `where` restricting visibility for non-admins to their own tasks. */
export function taskVisibility(user: { id: string; role: string }) {
  if (user.role === "Admin") return {};
  return {
    OR: [{ assignedToUserId: user.id }, { createdByUserId: user.id }],
  };
}
