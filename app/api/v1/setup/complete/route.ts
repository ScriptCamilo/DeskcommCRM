import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { logger } from "@/lib/logger";
import { lerEstadoDoSetup } from "@/lib/setup/estado";
import { setupInicialSchema } from "@/lib/setup/schema";
import {
  SETUP_COOKIE_NAME,
  setupEstaConfigurado,
  verificarSessaoDoSetup,
} from "@/lib/setup/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SetupRpcResult = { organization_id: string; setup_completed_at: string };

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!setupEstaConfigurado()) return fail("not_found", "Not found.", 404, { requestId });

  const sessao = verificarSessaoDoSetup(request.cookies.get(SETUP_COOKIE_NAME)?.value);
  if (!sessao.valid) {
    return fail("setup_session_invalid", "A autorizacao do setup expirou.", 401, { requestId });
  }

  try {
    if ((await lerEstadoDoSetup()).concluido) {
      return fail("setup_already_completed", "A instalacao ja foi configurada.", 404, {
        requestId,
      });
    }
  } catch (error) {
    logger.error("setup: falha ao ler estado antes da conclusao", {
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("unavailable", "Nao foi possivel verificar a instalacao.", 503, { requestId });
  }

  const parsed = setupInicialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Confira os campos informados.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const admin = createAdminClient();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.admin_email,
    password: parsed.data.admin_password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.admin_name, locale: parsed.data.locale },
  });
  if (authError || !created.user) {
    return fail("state_conflict", "Nao foi possivel criar o administrador com este email.", 409, {
      requestId,
    });
  }

  const actorId = created.user.id;
  const { data, error } = await admin.rpc("fn_complete_initial_setup", {
    p_actor: actorId,
    p_org_name: parsed.data.organization_name,
    p_org_slug: parsed.data.organization_slug,
    p_locale: parsed.data.locale,
    p_app_name: parsed.data.app_name,
    p_support_email: parsed.data.support_email,
    p_logo_url: parsed.data.logo_url,
    p_accent_hex: parsed.data.accent_hex,
  } as never);

  if (error) {
    const { error: compensationError } = await admin.auth.admin.deleteUser(actorId);
    if (compensationError) {
      logger.error("setup: usuario Auth ficou orfao depois de falha transacional", {
        request_id: requestId,
        actor_id: actorId,
        error: compensationError.message,
      });
    }
    if (error.message.includes("setup_already_completed")) {
      return fail("setup_already_completed", "A instalacao ja foi configurada.", 409, {
        requestId,
      });
    }
    logger.error("setup: transacao inicial recusada", {
      request_id: requestId,
      error: error.message,
    });
    return fail("internal_error", "Nao foi possivel concluir a instalacao.", 500, { requestId });
  }

  const resultado = data as unknown as SetupRpcResult;
  await audit({
    action: "platform.setup_completed",
    actorUserId: actorId,
    organizationId: resultado.organization_id,
    resourceType: "organization",
    resourceId: resultado.organization_id,
    requestId,
    ip: ipDoCliente(request.headers),
    userAgent: request.headers.get("user-agent"),
    bypassedRls: true,
    actingAsPlatformAdmin: true,
    metadata: { locale: parsed.data.locale },
  });

  const response = ok(
    { completed: true, organization_id: resultado.organization_id },
    { status: 201, requestId },
  );
  response.cookies.set(SETUP_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
