import { z } from "zod";

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((valor) => valor || null);

export const setupTokenSchema = z.object({
  token: z.string().min(1).max(512),
});

export const setupInicialSchema = z.object({
  admin_name: z.string().trim().min(2).max(120),
  admin_email: z.string().trim().toLowerCase().email().max(200),
  admin_password: z.string().min(12).max(128),
  organization_name: z.string().trim().min(2).max(120),
  organization_slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
  locale: z.enum(["pt-BR", "es"]),
  app_name: z.string().trim().min(2).max(120),
  support_email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((valor) => valor || null),
  logo_url: opcional(2048).pipe(z.string().url().nullable()),
  accent_hex: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/)
    .optional()
    .or(z.literal(""))
    .transform((valor) => valor || null),
});

export type SetupInicialInput = z.infer<typeof setupInicialSchema>;
