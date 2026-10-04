import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { chaveDaRequisicao, comIdempotencia, type DesfechoIdempotente } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireMobileConversation } from "@/lib/auth/mobile-conversation";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { sendMessageSchema, type SendMessageInput } from "@/lib/schemas";
import type { Message } from "@/lib/types/messaging";

import { sendMessageHandler } from "../../../../messages/_handler";

export const dynamic = "force-dynamic";
const ENDPOINT = "POST /api/v1/mobile/conversations/[id]/messages";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id: conversationId } = await params;
  const authz = await requireMobileConversation(request, conversationId, requestId, "messages");
  if (!authz.ok) return authz.response;

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  }
  const parsed = sendMessageSchema.safeParse({ ...raw, conversation_id: conversationId });
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const key = chaveDaRequisicao(request);
  if (key !== null && !z.string().uuid().safeParse(key).success) {
    return fail("validation_error", "Idempotency-Key deve ser UUID", 400, { requestId });
  }

  try {
    const deliver = () => sendMessageHandler(
      authz.supabase,
      {
        organization_id: authz.organizationId,
        actor: { type: "user", id: authz.userId, role: authz.role },
        requestId,
      },
      parsed.data as SendMessageInput,
    );
    const outcome: DesfechoIdempotente<Message> = key === null
      ? { tipo: "executou", resposta: await deliver(), status: 201 }
      : await comIdempotencia({
          db: authz.supabase,
          organizationId: authz.organizationId,
          endpoint: ENDPOINT,
          chave: key,
          corpo: parsed.data,
          executar: async () => ({ resposta: await deliver(), status: 201 }),
        });
    if (outcome.tipo === "conflito") {
      return fail("idempotency_conflict", "Esta chave de idempotência já foi usada com outro conteúdo.", 409, { requestId });
    }
    if (outcome.tipo === "em_curso") {
      return fail("idempotency_in_progress", "A mesma requisição ainda está em curso. Tente de novo em instantes.", 409, { requestId });
    }
    return ok(outcome.resposta, { status: 201, requestId });
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.code, error.message, error.status, {
        requestId,
        ...(error.details !== undefined ? { details: error.details as Record<string, unknown> } : {}),
      });
    }
    throw error;
  }
}
