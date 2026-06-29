"use client";

import { useState } from "react";
import { Download, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

/** Capture a DOM node (by id) as PNG or PDF. Libs are dynamically imported. */
export function ExportButtons({
  targetId,
  filename,
}: {
  targetId: string;
  filename: string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  async function capture() {
    const el = document.getElementById(targetId);
    if (!el) return null;
    const html2canvas = (await import("html2canvas")).default;
    return html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  }

  async function png() {
    setBusy(true);
    try {
      const canvas = await capture();
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${filename}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  async function pdf() {
    setBusy(true);
    try {
      const canvas = await capture();
      if (!canvas) return;
      const { default: JsPDF } = await import("jspdf");
      const doc = new JsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height] });
      doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
      doc.save(`${filename}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={png} disabled={busy}>
        <FileImage className="me-1 h-4 w-4" />
        {t("infographic.png")}
      </Button>
      <Button size="sm" variant="outline" onClick={pdf} disabled={busy}>
        <Download className="me-1 h-4 w-4" />
        {t("infographic.pdf")}
      </Button>
    </div>
  );
}
