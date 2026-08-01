import { readFile } from "fs/promises";
import path from "path";
import { resolveUploadPath } from "@/lib/upload-paths";
import { prisma } from "@/lib/prisma";

/**
 * Optional Whisper transcription for voice notes — OFF by default, opt-in via ENV:
 *
 *   VOICE_TRANSCRIPTION=true
 *   WHISPER_API_KEY=sk-...            (required)
 *   WHISPER_API_URL=https://api.openai.com/v1   (default; any OpenAI-compatible
 *                                      endpoint works, e.g. a local faster-whisper)
 *   WHISPER_MODEL=whisper-1           (default)
 *
 * Runs fire-and-forget after upload; the transcript lands on VoiceNote.transcript
 * on success and is simply absent otherwise.
 */
export function transcriptionEnabled(): boolean {
  return (
    process.env.VOICE_TRANSCRIPTION === "true" &&
    Boolean(process.env.WHISPER_API_KEY)
  );
}

export async function transcribeVoiceNote(voiceNoteId: string): Promise<void> {
  if (!transcriptionEnabled()) return;
  const note = await prisma.voiceNote.findUnique({ where: { id: voiceNoteId } });
  if (!note || note.transcript) return;

  const abs = resolveUploadPath(note.filePath);
  if (!abs) return;
  const bytes = await readFile(abs);

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: note.mimeType }),
    `voice${path.extname(abs) || ".webm"}`
  );
  form.append("model", process.env.WHISPER_MODEL ?? "whisper-1");
  form.append("response_format", "text");

  const base = (process.env.WHISPER_API_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHISPER_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Whisper transcription failed: ${res.status} ${await res.text()}`);
  }
  const transcript = (await res.text()).trim();
  if (!transcript) return;
  await prisma.voiceNote.update({
    where: { id: voiceNoteId },
    data: { transcript },
  });
}
