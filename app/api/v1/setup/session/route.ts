import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";
import { lerEstadoDoSetup } from "@/lib/setup/estado";
import { setupTokenSchema } from "@/lib/setup/schema";
import {
  assinarSessaoDoSetup,
  SETUP_COOKIE_NAME,
  SETUP_SESSION_TTL_SECONDS,
  setupEstaConfigurado,
  tokenDoSetupConfere,
} from "@/lib/setup/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!setupEstaConfigurado()) return fail("not_found", "Not found.", 404, { requestId });

  try {
    const estado = await lerEstadoDoSetup();
    if (estado.concluido) {
      return fail("setup_already_completed", "A instalacao ja foi configurada.", 404, {
        requestId,
      });
    }
  } catch (error) {
    logger.error("setup: falha ao ler estado antes da autorizacao", {
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("unavailable", "Nao foi possivel verificar a instalacao.", 503, { requestId });
  }

  const parsed = setupTokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Token invalido.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  if (!tokenDoSetupConfere(parsed.data.token)) {
    return fail("setup_token_invalid", "Token invalido.", 401, { requestId });
  }

  const response = ok({ authorized: true, expires_in: SETUP_SESSION_TTL_SECONDS }, { requestId });
  response.cookies.set(SETUP_COOKIE_NAME, assinarSessaoDoSetup(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SETUP_SESSION_TTL_SECONDS,
  });
  return response;
}
