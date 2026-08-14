-- Server-side preview image for image attachments. Written at upload time
-- (UI action and MCP alike); stays NULL for non-images and for everything
-- uploaded before this migration — the UI falls back to the full file then.
ALTER TABLE "TaskAttachment" ADD COLUMN "thumbPath" TEXT;
