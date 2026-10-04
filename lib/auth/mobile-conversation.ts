/**
 * Identidade do aplicativo nativo para ações em UMA conversa.
 *
 * O app não usa os cookies Strict do navegador nem recebe `dsk_` (token de
 * integração). Ele apresenta o access token emitido pelo Supabase Auth. Esta
 * borda o valida com `getUser(token)`, descobre a organização pela conversa e
 * exige um membership ativo nela. Assim o cliente nunca escolhe o tenant e um
 * platform admin sem vínculo não transforma o Inbox mobile em visão global.
 */
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { env } from "@/lib/env";
import { fetchDoServidor } from "@/lib/supabase/fetch-do-servidor";
import { urlDoSupabaseNoServidor } from "@/lib/supabase/url-do-servidor";

type MobileConversationAuth = {
  ok: true;
  userId: string;
  fullName: string | null;
  organizationId: string;
  role: Role;
  supabase: SupabaseClient;
};

type MobileConversationAuthFailure = { ok: false; response: Response };

function bearerDoAplicativo(request: NextRequest): string | null {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  // Tokens da API (`dsk_…`) têm outra superfície e não podem ganhar acesso
  // por acidente ao endpoint do aplicativo.
  return token && !token.startsWith("dsk_") ? token : null;
}

function clientDoAplicativo(accessToken: string): SupabaseClient {
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: fetchDoServidor(
        urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL),
        env.NEXT_PUBLIC_SUPABASE_URL,
      ),
      headers: { Authorization: `Bearer ${accessToken}`, "X-Client-Info": "deskcomm-crm/mobile" },
    },
  });
}

/**
 * Valida a sessão nativa e dá acesso somente a uma conversa de uma organização
 * na qual a pessoa ainda é membro. Toda mutação mobile passa por aqui.
 */
export async function requireMobileConversation(
  request: NextRequest,
  conversationId: string,
  requestId: string,
  resource: string,
  minimumRole: Role = "agent",
): Promise<MobileConversationAuth | MobileConversationAuthFailure> {
  const token = bearerDoAplicativo(request);
  if (!token) {
    return { ok: false, response: fail("unauthenticated", "Sessão inválida.", 401, { requestId }) };
  }

  const supabase = clientDoAplicativo(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) {
    return { ok: false, response: fail("unauthenticated", "Sessão inválida.", 401, { requestId }) };
  }

  // Equivalente nativo de `mfaEmDivida()`: passa o JWT explicitamente porque
  // esta superfície não tem o cookie do browser. `nextLevel=aal2` só aparece
  // quando há fator verificado; então não bloqueia quem ainda precisa cadastrar
  // o primeiro fator, mas exige a prova de quem já o possui.
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa
    .getAuthenticatorAssuranceLevel(token);
  if (assuranceError) {
    return { ok: false, response: fail("internal_error", "Não foi possível validar a sessão.", 500, { requestId }) };
  }
  if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    return {
      ok: false,
      response: fail(
        "mfa_required",
        "Esta sessão precisa da verificação em duas etapas. Entre novamente com o código do aplicativo.",
        403,
        { requestId },
      ),
    };
  }

  // A primeira leitura é RLS-scoped para não revelar a existência de conversa
  // que a própria política já esconde (por exemplo, agente limitado à fila).
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, organization_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversationError) {
    return { ok: false, response: fail("internal_error", "Não foi possível validar a conversa.", 500, { requestId }) };
  }
  if (!conversation) {
    return { ok: false, response: fail("not_found", "Conversa não encontrada.", 404, { requestId }) };
  }

  // Não use a permissão transversal de platform admin como membership. O app
  // só abre organizações que a pessoa acompanha de modo explícito.
  const { data: membership, error: membershipError } = await supabase
    .from("user_organizations")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", conversation.organization_id)
    .is("revoked_at", null)
    .maybeSingle();
  if (membershipError) {
    return { ok: false, response: fail("internal_error", "Não foi possível validar seu acesso.", 500, { requestId }) };
  }
  const role = membership?.role as Role | undefined;
  if (!role || (ROLE_RANK[role] ?? 0) < ROLE_RANK[minimumRole]) {
    void audit({
      action: "authz.denied",
      actorUserId: user.id,
      organizationId: conversation.organization_id,
      resourceType: resource,
      resourceId: conversationId,
      requestId,
      metadata: { required_role: minimumRole, auth_surface: "mobile" },
    });
    return { ok: false, response: fail("forbidden_role", "Você não tem acesso para esta ação.", 403, { requestId }) };
  }

  return {
    ok: true,
    userId: user.id,
    fullName: typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null,
    organizationId: conversation.organization_id,
    role,
    supabase,
  };
}
