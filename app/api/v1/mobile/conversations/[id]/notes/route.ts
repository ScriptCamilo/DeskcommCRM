import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireMobileConversation } from "@/lib/auth/mobile-conversation";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { emitirMencoesDaNota } from "@/lib/inbox/emitir-mencoes-da-nota";
import { isMediaPathOwnedBy } from "@/lib/messaging/media/upload-validation";
import { assertOrgOperante, OrgNaoOperanteError } from "@/lib/organizacao/operante";
import { createNoteSchema } from "@/lib/schemas/notes";

export const dynamic = "force-dynamic";
const COLS = "id, conversation_id, body, created_by_user_id, created_by_name, created_at, media_storage_path, media_mime, media_size_bytes";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id: conversationId } = await params;
  const authz = await requireMobileConversation(request, conversationId, requestId, "conversation_notes");
  if (!authz.ok) return authz.response;

  try {
    await assertOrgOperante(authz.supabase, authz.organizationId);
  } catch (error) {
    if (error instanceof OrgNaoOperanteError) {
      return fail(error.code, error.message, error.status, { requestId });
    }
    return fail("internal_error", "Não foi possível validar a empresa.", 500, { requestId });
  }

  const raw = await request.json().catch(() => null);
  const parsed = createNoteSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  if (parsed.data.anexo && !isMediaPathOwnedBy(parsed.data.anexo.storage_path, authz.organizationId, conversationId)) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: { anexo: ["anexo fora desta conversa."] },
    });
  }

  const { data, error } = await authz.supabase
    .from("conversation_notes")
    .insert({
      organization_id: authz.organizationId,
      conversation_id: conversationId,
      body: parsed.data.body,
      created_by_user_id: authz.userId,
      created_by_name: authz.fullName,
      ...(parsed.data.anexo ? {
        media_storage_path: parsed.data.anexo.storage_path,
        media_mime: parsed.data.anexo.media_mime,
        media_size_bytes: parsed.data.anexo.media_size_bytes,
      } : {}),
    })
    .select(COLS)
    .single();
  if (error || !data) return fail("internal_error", "Erro ao criar nota.", 500, { requestId });

  void audit({
    action: "conversation.note_added",
    actorUserId: authz.userId,
    organizationId: authz.organizationId,
    resourceType: "conversation_note",
    resourceId: data.id,
    requestId,
    metadata: { conversation_id: conversationId, auth_surface: "mobile" },
  });
  void emitirMencoesDaNota({
    organizationId: authz.organizationId,
    conversationId,
    body: parsed.data.body,
    fromUserId: authz.userId,
  });
  return ok(data, { requestId, status: 201 });
}
