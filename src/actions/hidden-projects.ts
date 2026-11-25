"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { SESSION_COOKIE } from "@/lib/auth";
import { cookieSecure } from "@/lib/cookie-security";
import { setProjectHidden } from "@/lib/hidden-projects/service";
import { revealHiddenProjects } from "@/lib/hidden-projects/scope";
import {
  REVEAL_COOKIE,
  REVEAL_MAX_MS,
  createRevealToken,
  revealTokenExpiry,
} from "@/lib/hidden-projects/reveal-token";

/**
 * TOF-0966 — Admin-Verwaltung verborgener Projekte.
 * Nicht-Admins bekommen FORBIDDEN, ohne dass etwas geändert wird.
 */

export type HiddenActionResult = { ok: true } | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "NO_SECRET" };

export async function setProjectHiddenAction(projectId: string, hidden: boolean): Promise<HiddenActionResult> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { ok: false, error: "FORBIDDEN" };
  const ok = await setProjectHidden(tenant.id, projectId, hidden, user.id);
  if (!ok) return { ok: false, error: "NOT_FOUND" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Schaltet „Verborgene anzeigen“ für DIESE Sitzung ein (max. 30 Min.) oder aus. */
export async function setRevealHiddenAction(on: boolean): Promise<HiddenActionResult> {
  const { user } = await requireTenant();
  const jar = cookies();
  if (!on) {
    // Ausschalten darf jeder — es nimmt nur Sichtbarkeit weg.
    jar.delete(REVEAL_COOKIE);
    revalidatePath("/", "layout");
    return { ok: true };
  }
  if (!isAdminRole(user.role)) return { ok: false, error: "FORBIDDEN" };
  const secret = process.env.SESSION_SECRET;
  const session = jar.get(SESSION_COOKIE)?.value;
  if (!secret || !session) return { ok: false, error: "NO_SECRET" };
  jar.set(REVEAL_COOKIE, createRevealToken(secret, session), {
    httpOnly: true,
    secure: cookieSecure(), // TOF-0794: wie das Sitzungs-Cookie
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(REVEAL_MAX_MS / 1000),
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Für Banner + Einstellungen: ist der Modus gerade aktiv, und bis wann? */
export async function getRevealState(): Promise<{ active: boolean; expiresAt: number | null }> {
  const active = await revealHiddenProjects();
  return { active, expiresAt: active ? revealTokenExpiry(cookies().get(REVEAL_COOKIE)?.value) : null };
}
