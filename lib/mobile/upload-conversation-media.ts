import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { type Role } from "@/lib/auth/types";
import { requireMobileConversation } from "@/lib/auth/mobile-conversation";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { transcodificarNotaDeVoz } from "@/lib/messaging/media/voice-transcode";
import { createAdminClient } from "@/lib/supabase/admin";

type UploadDestination = "message" | "note";

/** Upload autorizado pelo JWT nativo; a posse do path nasce do servidor. */
export async function uploadConversationMediaForMobile(
  request: NextRequest,
  conversationId: string,
  requestId: string,
  destination: UploadDestination,
): Promise<Response> {
  const authz = await requireMobileConversation(
    request,
    conversationId,
    requestId,
    destination === "note" ? "conversation_notes" : "conversation_media",
    "agent" as Role,
  );
  if (!authz.ok) return authz.response;

  // Rejeita antes de materializar um multipart grande. O tamanho do File é a
  // conferência autoritativa porque Content-Length pode mentir.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 1_048_576) {
    return fail("payload_too_large", "Arquivo acima de 50MB.", 413, { requestId });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", "Campo 'file' (multipart) obrigatório.", 422, { requestId });
  }

  const mime = file.type || "application/octet-stream";
  const verdict = validateOutboundMedia(mime, file.size);
  if (!verdict.ok) {
    const status = verdict.code === "payload_too_large" ? 413 : verdict.code === "unsupported_media_type" ? 415 : 422;
    return fail(verdict.code, verdict.message, status, { requestId });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  // A voz vai ao canal; para nota interna, preservar o arquivo original é o
  // comportamento correto e evita converter um formato que o renderer nativo
  // já suporta.
  const encoded = destination === "message" ? await transcodificarNotaDeVoz({ buffer: raw, mime }) : { buffer: raw, mime };
  const prefix = destination === "message" ? "out" : "note";
  const bucket = destination === "message" ? "whatsapp-media" : "internal-media";
  const storagePath = `${authz.organizationId}/${conversationId}/${prefix}-${randomUUID()}.${extFromMime(encoded.mime)}`;

  const { error } = await createAdminClient().storage
    .from(bucket)
    .upload(storagePath, encoded.buffer, { contentType: encoded.mime, upsert: false });
  if (error) {
    return fail("internal_error", "Erro ao subir o arquivo.", 500, { requestId });
  }

  return ok(
    {
      storage_path: storagePath,
      media_mime: encoded.mime,
      media_size_bytes: encoded.buffer.length,
      kind: verdict.kind,
    },
    { requestId },
  );
}
