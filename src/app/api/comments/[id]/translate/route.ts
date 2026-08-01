import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isStaffRole, isLocale } from "@/lib/enums";
import {
  translationConfigured,
  translateText,
  checkTranslateRateLimit,
  TranslateError,
} from "@/lib/translate";

// POST /api/comments/[id]/translate  { to: "ar" }
// → { text, sourceLanguage, targetLanguage, cached }
//
// Server-side on purpose (the DeepL key must not leak to the client).
// Results are cached per (comment, targetLang) — comments are immutable, so
// the cache can never go stale. Errors map to stable `error` codes the UI
// turns into a localized "translation unavailable" line.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let auth;
  try {
    auth = await requireTenant();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { user, tenant } = auth;

  if (!translationConfigured() || !tenant.translationEnabled) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const target = body?.to;
  if (!isLocale(target)) {
    return NextResponse.json({ error: "bad_target" }, { status: 400 });
  }

  const comment = await prisma.taskComment.findUnique({
    where: { id: params.id },
    include: {
      voiceNote: { select: { id: true } },
      task: {
        select: {
          tenantId: true,
          createdByUserId: true,
          assignees: { select: { userId: true } },
        },
      },
    },
  });
  if (!comment || comment.task.tenantId !== tenant.id || comment.deletedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Same visibility rule as the task detail page / comment actions.
  const canView =
    isStaffRole(user.role) ||
    comment.task.createdByUserId === user.id ||
    comment.task.assignees.some((a) => a.userId === user.id);
  if (!canView) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Only text comments — voice notes are played, not translated.
  if (comment.voiceNote || !comment.content.trim()) {
    return NextResponse.json({ error: "not_translatable" }, { status: 400 });
  }
  if (comment.language === target) {
    return NextResponse.json({
      text: comment.content,
      sourceLanguage: comment.language,
      targetLanguage: target,
      cached: true,
    });
  }

  const cached = await prisma.commentTranslation.findUnique({
    where: { commentId_targetLang: { commentId: comment.id, targetLang: target } },
  });
  if (cached) {
    return NextResponse.json({
      text: cached.text,
      sourceLanguage: cached.sourceLang,
      targetLanguage: target,
      cached: true,
    });
  }

  if (!checkTranslateRateLimit(user.id)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const result = await translateText(
      comment.content,
      target,
      isLocale(comment.language) ? comment.language : null
    );
    // Concurrent first-translations can race on the unique key — the loser
    // just reuses the winner's row.
    const row = await prisma.commentTranslation
      .create({
        data: {
          commentId: comment.id,
          targetLang: target,
          sourceLang: result.detectedSource || comment.language || "",
          text: result.text,
        },
      })
      .catch(() =>
        prisma.commentTranslation.findUnique({
          where: { commentId_targetLang: { commentId: comment.id, targetLang: target } },
        })
      );
    return NextResponse.json({
      text: row?.text ?? result.text,
      sourceLanguage: row?.sourceLang ?? result.detectedSource,
      targetLanguage: target,
      cached: false,
    });
  } catch (e) {
    const reason = e instanceof TranslateError ? e.reason : "upstream";
    return NextResponse.json(
      { error: reason },
      { status: reason === "rate_limited" ? 429 : 502 }
    );
  }
}
