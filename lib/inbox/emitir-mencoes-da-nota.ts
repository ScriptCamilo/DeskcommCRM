import { mencaoAtingeUsuario, tokensDeMencao } from "@/lib/notifications/mentions";
import { createAdminClient } from "@/lib/supabase/admin";

/** Emite os avisos de menção depois da persistência de uma nota interna. */
export async function emitirMencoesDaNota(input: {
  organizationId: string;
  conversationId: string;
  body: string;
  fromUserId: string;
}): Promise<void> {
  if (tokensDeMencao(input.body).length === 0) return;
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", input.organizationId)
    .is("revoked_at", null);
  const ids = ((members ?? []) as Array<{ user_id: string }>)
    .map((member) => member.user_id)
    .filter((id) => id !== input.fromUserId);
  const preview = input.body.trim().slice(0, 140);

  await Promise.all(ids.map(async (userId) => {
    const { data } = await admin.auth.admin.getUserById(userId);
    const user = data.user;
    if (!user?.email) return;
    const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
    if (!mencaoAtingeUsuario(input.body, { id: userId, email: user.email, full_name: fullName })) return;
    await admin.rpc("emit_event", {
      p_event_type: "user.mentioned",
      p_entity_kind: "conversation_note",
      p_entity_id: input.conversationId,
      p_payload: {
        conversation_id: input.conversationId,
        to_user_id: userId,
        from_user_id: input.fromUserId,
        body_preview: preview,
      },
      p_metadata: {},
      p_organization_id: input.organizationId,
    });
  }));
}
