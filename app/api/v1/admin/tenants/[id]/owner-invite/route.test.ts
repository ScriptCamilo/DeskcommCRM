import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { mfaEmDivida } from "@/lib/auth/server";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitirConvite } from "@/lib/team/convites";

vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: vi.fn() }));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/team/convites", () => ({ emitirConvite: vi.fn() }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CREATION_REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_EMAIL = "responsavel@exemplo.com";

interface Cenario {
  org?: { id: string; display_name: string; status: string } | null;
  criacao?: { request_id: string } | null;
  convite?: { metadata: unknown } | null;
}

function adminStub(cenario: Cenario = {}) {
  const linhas = {
    organizations:
      cenario.org === undefined
        ? { id: ORG_ID, display_name: "Clínica Exemplo", status: "active" }
        : cenario.org,
    criacao: cenario.criacao === undefined ? { request_id: CREATION_REQUEST_ID } : cenario.criacao,
    convite:
      cenario.convite === undefined
        ? { metadata: { email: OWNER_EMAIL, role: "admin" } }
        : cenario.convite,
  };

  return {
    from: vi.fn((table: string) => {
      const filtros = new Map<string, unknown>();
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filtros.set(column, value);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (table === "organizations") return { data: linhas.organizations, error: null };
          if (filtros.get("action") === "tenant.created_by_platform_admin") {
            return { data: linhas.criacao, error: null };
          }
          if (
            filtros.get("action") === "member.invited" &&
            filtros.get("request_id") === CREATION_REQUEST_ID
          ) {
            return { data: linhas.convite, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    }),
  };
}

async function chamar(id = ORG_ID) {
  const { POST } = await import("./route");
  return POST(new NextRequest(`http://localhost/api/v1/admin/tenants/${id}/owner-invite`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: {
      id: ADMIN_ID,
      email: "admin@exemplo.com",
      user_metadata: { full_name: "Admin Exemplo" },
    },
    platformAdmin: { user_id: ADMIN_ID, scope: "full", mfa_required: true },
  } as never);
  vi.mocked(mfaEmDivida).mockResolvedValue(false);
  vi.mocked(createAdminClient).mockReturnValue(adminStub() as never);
  vi.mocked(emitirConvite).mockResolvedValue({
    convite: {
      email: OWNER_EMAIL,
      expires_at: "2026-09-25T12:00:00.000Z",
    },
    accept_url: "https://crm.exemplo/team/accept-invite/novo-token",
    email_dispatched: false,
    email_error: "provider_not_configured",
    renovado: false,
  } as never);
});

describe("POST /api/v1/admin/tenants/[id]/owner-invite", () => {
  it("recusa um tenant inválido antes de consultar o banco", async () => {
    const res = await chamar("invalido");

    expect(res.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("exige administrador de plataforma com escopo full", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({
      user: { id: ADMIN_ID },
      platformAdmin: { user_id: ADMIN_ID, scope: "support", mfa_required: false },
    } as never);

    const res = await chamar();

    expect(res.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("não emite convite para tenant suspenso", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      adminStub({
        org: { id: ORG_ID, display_name: "Clínica Exemplo", status: "suspended" },
      }) as never,
    );

    const res = await chamar();

    expect(res.status).toBe(409);
    expect(emitirConvite).not.toHaveBeenCalled();
  });

  it("não confunde outro convite admin com o convite original do responsável", async () => {
    vi.mocked(createAdminClient).mockReturnValue(adminStub({ convite: null }) as never);

    const res = await chamar();

    expect(res.status).toBe(404);
    expect(emitirConvite).not.toHaveBeenCalled();
  });

  it("reenvia ao responsável original e devolve o link mesmo quando o e-mail falha", async () => {
    const res = await chamar();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      data: {
        email: OWNER_EMAIL,
        accept_url: "https://crm.exemplo/team/accept-invite/novo-token",
        email_dispatched: false,
        email_error: "provider_not_configured",
      },
    });
    expect(emitirConvite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG_ID,
        orgName: "Clínica Exemplo",
        email: OWNER_EMAIL,
        role: "admin",
        inviterId: ADMIN_ID,
      }),
    );
  });
});
