import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();
const copiarMock = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/lib/api/client", () => ({
  apiClient: { post: (...args: unknown[]) => postMock(...args) },
}));
vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (...args: unknown[]) => copiarMock(...args),
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSucesso(...args), error: vi.fn() },
}));

import { OwnerInviteRecovery } from "./OwnerInviteRecovery";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const LINK = "https://crm.exemplo/team/accept-invite/novo-token";

function renderizar(disabled = false) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OwnerInviteRecovery organizationId={ORG_ID} disabled={disabled} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  postMock.mockReset();
  copiarMock.mockReset();
  toastSucesso.mockReset();
});

describe("OwnerInviteRecovery", () => {
  it("mantém a ação indisponível quando o tenant não está ativo", () => {
    renderizar(true);

    expect(screen.getByRole("button", { name: "Reenviar convite do responsável" })).toBeDisabled();
  });

  it("mostra um link copiável mesmo quando o provedor não envia o e-mail", async () => {
    postMock.mockResolvedValue({
      data: {
        email: "responsavel@exemplo.com",
        accept_url: LINK,
        expires_at: "2026-09-25T12:00:00.000Z",
        email_dispatched: false,
        email_error: "provider_not_configured",
      },
    });
    copiarMock.mockResolvedValue(true);
    renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite do responsável" }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(`/api/v1/admin/tenants/${ORG_ID}/owner-invite`, {}),
    );
    const campo = await screen.findByLabelText("Link do convite do responsável");
    expect(campo).toHaveValue(LINK);
    expect(screen.getByText(/Envio não confirmado para responsavel@exemplo.com/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() => expect(copiarMock).toHaveBeenCalledWith(LINK));
  });
});
