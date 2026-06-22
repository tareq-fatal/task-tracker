import { z } from "zod";
import {
  ROLES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  LOCALES,
} from "./enums";

const optionalId = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  status: z.enum(TASK_STATUSES).default("Todo"),
  priority: z.enum(TASK_PRIORITIES).default("Medium"),
  assignedToUserId: optionalId,
  projectId: optionalId,
  dueDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null)),
});

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).optional().default(""),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color")
    .default("#6366f1"),
});

export const userSchema = z.object({
  name: z.string().trim().min(1).max(120),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Only letters, numbers, . _ -"),
  email: z.string().trim().email(),
  password: z.string().min(6, "At least 6 characters"),
  role: z.enum(ROLES).default("User"),
});

export const commentSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

export const settingsSchema = z.object({
  locale: z.enum(LOCALES),
  newPassword: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || v.length >= 6, {
      message: "At least 6 characters",
    }),
});

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
];
