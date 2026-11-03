"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import {
  WissenFehler,
  entscheidungHinzufuegen,
  seiteLoeschen,
  seiteSchreiben,
  seiteWiederherstellen,
} from "@/lib/wissen/dienst";
import { istWissenArt, slugify } from "@/lib/wissen/text";

// TOF-0839 Projekt-Wissen — Server Actions der Oberfläche. Regeln (Rechte, Geheimnis-Wächter,
// Versionen) stecken im Dienst; hier nur Formular ↔ Dienst. Mandant aus der Sitzung.

export type WissenStand = { ok?: boolean; fehler?: string; unveraendert?: boolean };

function fehlerText(e: unknown): string {
  if (e instanceof WissenFehler) return e.message;
  console.error("[wissen] action failed:", e);
  return "Speichern fehlgeschlagen.";
}

export async function speichereWissenSeiteAction(_v: WissenStand, form: FormData): Promise<WissenStand> {
  const { user, tenant } = await requireTenant();
  const projectId = String(form.get("projectId") ?? "");
  const neu = form.get("neu") === "1";
  const titel = String(form.get("titel") ?? "").trim();
  const slugRoh = String(form.get("slug") ?? "").trim();
  const slug = neu ? slugify(slugRoh || titel) : slugRoh;
  const art = String(form.get("art") ?? "");
  let ziel: string | null = null;
  try {
    const r = await seiteSchreiben(user, tenant.id, {
      projectId,
      slug,
      titel: titel || undefined,
      art: istWissenArt(art) ? art : undefined,
      angepinnt: form.get("angepinnt") === "on",
      inhalt: String(form.get("inhalt") ?? ""),
    });
    revalidatePath(`/projects/${projectId}/wissen`);
    if (neu) ziel = `/projects/${projectId}/wissen/${r.seite.slug}`;
    else return { ok: true, unveraendert: r.unveraendert };
  } catch (e) {
    return { fehler: fehlerText(e) };
  }
  redirect(ziel);
}

export async function wiederherstellenAction(form: FormData): Promise<void> {
  const { user, tenant } = await requireTenant();
  const projectId = String(form.get("projectId") ?? "");
  const slug = String(form.get("slug") ?? "");
  await seiteWiederherstellen(user, tenant.id, projectId, slug, String(form.get("versionId") ?? ""));
  revalidatePath(`/projects/${projectId}/wissen`);
  redirect(`/projects/${projectId}/wissen/${slug}`);
}

export async function loescheWissenSeiteAction(form: FormData): Promise<void> {
  const { user, tenant } = await requireTenant();
  const projectId = String(form.get("projectId") ?? "");
  await seiteLoeschen(user, tenant.id, projectId, String(form.get("slug") ?? ""));
  revalidatePath(`/projects/${projectId}/wissen`);
  redirect(`/projects/${projectId}/wissen`);
}

export async function entscheidungAction(_v: WissenStand, form: FormData): Promise<WissenStand> {
  const { user, tenant } = await requireTenant();
  const projectId = String(form.get("projectId") ?? "");
  const datum = String(form.get("datum") ?? "");
  try {
    await entscheidungHinzufuegen(user, tenant.id, {
      projectId,
      was: String(form.get("was") ?? ""),
      warum: String(form.get("warum") ?? ""),
      wer: String(form.get("wer") ?? "").trim() || undefined,
      datum: /^\d{4}-\d{2}-\d{2}$/.test(datum) ? new Date(`${datum}T12:00:00Z`) : undefined,
      aufgaben: String(form.get("aufgaben") ?? "").split(/[\s,;]+/).filter(Boolean),
      korrigiertId: String(form.get("korrigiertId") ?? "").trim() || undefined,
    });
  } catch (e) {
    return { fehler: fehlerText(e) };
  }
  revalidatePath(`/projects/${projectId}/wissen`);
  return { ok: true };
}
