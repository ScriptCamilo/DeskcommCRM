import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireMobileConversation } from "@/lib/auth/mobile-conversation";
import { createAdminClient } from "@/lib/supabase/admin";

type DestinoDaMidia = "message" | "note";

const uuid = z.string().uuid();
const VALIDADE_SEGUNDOS = 300;

/**
 * Assina uma mídia privada depois de provar o acesso à conversa. O aplicativo
 * nunca fala com Storage para isso: `whatsapp-media` e `internal-media` não
 * têm policy de leitura direta justamente para o caminho não virar permissão.
 */
export async function urlDeMidiaDaConversaParaMobile(
  request: NextRequest,
  conversationId: string,
  mediaId: string,
  requestId: string,
  destino: DestinoDaMidia,
): Promise<Response> {
  if (!uuid.safeParse(conversationId).success || !uuid.safeParse(mediaId).success) {
    return fail("validation_failed", "Identificador inválido.", 422, { requestId });
  }

  const authz = await requireMobileConversation(
    request,
    conversationId,
    requestId,
    destino === "note" ? "conversation_notes" : "conversation_media",
  );
  if (!authz.ok) return authz.response;

  const tabela = destino === "note" ? "conversation_notes" : "messages";
  const bucket = destino === "note" ? "internal-media" : "whatsapp-media";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(tabela)
    .select("id, media_storage_path")
    .eq("id", mediaId)
    .eq("conversation_id", conversationId)
    .eq("organization_id", authz.organizationId)
    .maybeSingle();
  if (error) return fail("internal_error", "Não foi possível abrir o arquivo.", 500, { requestId });
  if (!data?.media_storage_path) return fail("not_found", "Arquivo não encontrado.", 404, { requestId });

  const { data: signed, error: signedError } = await admin.storage
    .from(bucket)
    .createSignedUrl(data.media_storage_path, VALIDADE_SEGUNDOS);
  if (signedError || !signed?.signedUrl) {
    return fail("internal_error", "Não foi possível abrir o arquivo.", 500, { requestId });
  }

  return ok(
    {
      url: signed.signedUrl,
      expires_at: new Date(Date.now() + VALIDADE_SEGUNDOS * 1000).toISOString(),
    },
    { requestId },
  );
}
