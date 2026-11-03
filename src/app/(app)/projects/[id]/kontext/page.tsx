import { redirect } from "next/navigation";

// „Kontext für Claude“ (15.10.2026) ist seit TOF-0839 Teil des Projekt-Wissens: der Inhalt wurde
// als angepinnte Seite „stand“ übernommen (alle Fassungen als Versionen). Alte Links leiten weiter;
// ?v=<ProjectContext-Id> zeigt dieselbe Fassung als Version (Id-Schema der Migration: wv_<id>).
export const dynamic = "force-dynamic";

export default function KontextPage({ params, searchParams }: { params: { id: string }; searchParams: { v?: string } }) {
  if (searchParams.v) redirect(`/projects/${params.id}/wissen/stand?v=wv_${encodeURIComponent(searchParams.v)}`);
  redirect(`/projects/${params.id}/wissen`);
}
