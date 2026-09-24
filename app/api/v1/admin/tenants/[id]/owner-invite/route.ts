/**
 * POST /api/v1/admin/tenants/[id]/owner-invite
 *
 * Recupera o convite do responsável criado junto com o tenant. A criação
 * administrativa antiga devolvia o link uma única vez e não gravava uma linha
 * em `team_invites`; por isso esta rota liga os dois registros duráveis daquele
 * ato pelo `request_id`: `tenant.created_by_platform_admin` e `member.invited`.
 * A nova emissão usa o fluxo canônico de convites e passa a existir em
 * `team_invites`, de onde poderá ser reenviada ou revogada normalmente.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { mfaEmDivida } from "@/lib/auth/server";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { INTERFACE_COMPLETA } from "@/lib/navigation/interface";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitirConvite } from "@/lib/team/convites";

const paramsSchema = z.object({ id: z.string().uuid() });
const metadataSchema = z.object({
  email: z.string().email(),
  role: z.literal("admin"),
});

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const lido = paramsSchema.safeParse(await params);
  if (!lido.success) {
    return fail("validation_error", "Tenant inválido.", 400, { requestId });
  }
  const tenantId = lido.data.id;

  const supportDenied = await requireSupportWrite(tenantId);
  if (supportDenied) return supportDenied;

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Administrador da plataforma obrigatório.", 403, { requestId });
  }
  if (adminCtx.platformAdmin.scope !== "full") {
    return fail("forbidden", "Seu acesso de suporte não permite reenviar convites.", 403, {
      requestId,
    });
  }
  if (await mfaEmDivida()) {
    return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId });
  }

  const admin = createAdminClient();
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, display_name, status")
    .eq("id", tenantId)
    .maybeSingle();
  if (orgError)
    return fail("internal_error", "Não foi possível consultar o tenant.", 500, { requestId });
  if (!org) return fail("not_found", "Tenant não encontrado.", 404, { requestId });
  if (org.status !== "active") {
    return fail("state_conflict", "Reative o tenant antes de reenviar o convite.", 409, {
      requestId,
    });
  }

  const { data: criacao, error: creationError } = await admin
    .from("api_audit_log")
    .select("request_id")
    .eq("organization_id", tenantId)
    .eq("action", "tenant.created_by_platform_admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (creationError) {
    return fail("internal_error", "Não foi possível consultar a criação do tenant.", 500, {
      requestId,
    });
  }
  if (!criacao?.request_id) {
    return fail("not_found", "O convite original do responsável não foi encontrado.", 404, {
      requestId,
    });
  }

  const { data: conviteOriginal, error: inviteError } = await admin
    .from("api_audit_log")
    .select("metadata")
    .eq("organization_id", tenantId)
    .eq("request_id", criacao.request_id)
    .eq("action", "member.invited")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inviteError) {
    return fail("internal_error", "Não foi possível consultar o convite original.", 500, {
      requestId,
    });
  }

  const metadata = metadataSchema.safeParse(conviteOriginal?.metadata);
  if (!metadata.success) {
    return fail("not_found", "O convite original do responsável não foi encontrado.", 404, {
      requestId,
    });
  }

  const resultado = await emitirConvite(admin, {
    organizationId: tenantId,
    orgName: org.display_name,
    email: metadata.data.email,
    role: "admin",
    interfaceSettings: INTERFACE_COMPLETA,
    inviterId: adminCtx.user.id,
    inviterName: adminCtx.user.user_metadata?.full_name ?? adminCtx.user.email ?? "Administrador",
    requestId,
  });

  return ok(
    {
      email: resultado.convite.email,
      accept_url: resultado.accept_url,
      expires_at: resultado.convite.expires_at,
      email_dispatched: resultado.email_dispatched,
      email_error: resultado.email_error ?? null,
    },
    { requestId },
  );
}
