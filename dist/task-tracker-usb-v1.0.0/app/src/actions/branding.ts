"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { can } from "@/lib/roles";
import { THEMES } from "@/lib/branding";

export type BrandingState = { ok?: boolean; error?: string };
export type BrandingData = { themeName: string; primaryColor: string; secondaryColor: string; accentColor: string; logo: string | null };

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO = 2 * 1024 * 1024; // 2 MB
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/svg+xml": "svg", "image/jpeg": "jpg", "image/webp": "webp" };

async function requireBrandingAdmin() {
  const { user, tenant } = await requireTenant();
  if (!can(user.role, "editTenantSettings")) throw new Error("FORBIDDEN");
  return { user, tenant };
}

export async function getBranding(): Promise<BrandingData> {
  const { tenant } = await requireTenant();
  const t = await prisma.tenant.findUnique({ where: { id: tenant.id } });
  return {
    themeName: t?.themeName ?? "ocean-pro",
    primaryColor: t?.primaryColor ?? "#4f46e5",
    secondaryColor: t?.secondaryColor ?? "#c026d3",
    accentColor: t?.accentColor ?? "#ec4899",
    logo: t?.logo ?? null,
  };
}

export async function updateBrandingAction(input: {
  themeName: string; primaryColor: string; secondaryColor: string; accentColor: string;
}): Promise<BrandingState> {
  const { tenant } = await requireBrandingAdmin();
  if (!THEMES.some((x) => x.name === input.themeName)) return { error: "BAD_THEME" };
  for (const c of [input.primaryColor, input.secondaryColor, input.accentColor]) {
    if (c && !HEX.test(c)) return { error: "BAD_COLOR" };
  }
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      themeName: input.themeName,
      primaryColor: input.primaryColor || null,
      secondaryColor: input.secondaryColor || null,
      accentColor: input.accentColor || null,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function uploadLogoAction(_prev: BrandingState, formData: FormData): Promise<BrandingState> {
  const { tenant } = await requireBrandingAdmin();
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return { error: "NO_FILE" };
  if (file.size > MAX_LOGO) return { error: "TOO_LARGE" };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { error: "BAD_TYPE" };

  const dir = path.join(process.cwd(), "public", "uploads", "tenants", tenant.slug);
  await mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, `logo.${ext}`), bytes);
  const url = `/uploads/tenants/${tenant.slug}/logo.${ext}?v=${bytes.length}`; // cache-bust on change

  await prisma.tenant.update({ where: { id: tenant.id }, data: { logo: url } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeLogoAction(): Promise<BrandingState> {
  const { tenant } = await requireBrandingAdmin();
  await prisma.tenant.update({ where: { id: tenant.id }, data: { logo: null } });
  revalidatePath("/", "layout");
  return { ok: true };
}
