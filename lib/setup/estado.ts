import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoDoSetup = { concluido: boolean; completedAt: string | null };

export async function lerEstadoDoSetup(): Promise<EstadoDoSetup> {
  const admin = createAdminClient();
  const [{ data: settings, error: settingsError }, { data: admins, error: adminsError }] =
    await Promise.all([
      admin.from("platform_settings").select("setup_completed_at").eq("id", 1).maybeSingle(),
      admin.from("platform_admins").select("user_id").is("revoked_at", null).limit(1),
    ]);

  if (settingsError) throw new Error(`setup_state_settings: ${settingsError.message}`);
  if (adminsError) throw new Error(`setup_state_admins: ${adminsError.message}`);

  const completedAt =
    (settings as { setup_completed_at?: string | null } | null)?.setup_completed_at ?? null;
  return { concluido: completedAt !== null || (admins?.length ?? 0) > 0, completedAt };
}
