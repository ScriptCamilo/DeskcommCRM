"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { ArrowsClockwise, Copy } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

interface OwnerInviteResult {
  email: string;
  accept_url: string;
  expires_at: string;
  email_dispatched: boolean;
  email_error: string | null;
}

export function OwnerInviteRecovery({
  organizationId,
  disabled,
}: {
  organizationId: string;
  disabled: boolean;
}) {
  const t = useT();
  const [resultado, setResultado] = useState<OwnerInviteResult | null>(null);
  const reenviar = useMutation({
    mutationFn: () =>
      apiClient.post<{ data: OwnerInviteResult }>(
        `/api/v1/admin/tenants/${organizationId}/owner-invite`,
        {},
      ),
    onError: showApiError,
    onSuccess: (resposta) => {
      setResultado(resposta.data);
      toast.success(
        t(
          resposta.data.email_dispatched
            ? "Convite do responsável reenviado por e-mail."
            : "O e-mail não saiu. Use o novo link de convite abaixo.",
        ),
      );
    },
  });

  async function copiar() {
    if (!resultado) return;
    if (await copyToClipboard(resultado.accept_url)) {
      toast.success(t("Link do convite copiado."));
    } else {
      toast.error(t("Não foi possível copiar. Selecione o link abaixo."));
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        disabled={disabled || reenviar.isPending}
        onClick={() => reenviar.mutate()}
      >
        <ArrowsClockwise size={16} />
        {reenviar.isPending ? t("Reenviando…") : t("Reenviar convite do responsável")}
      </Button>

      {resultado ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {resultado.email_dispatched
              ? `${t("Enviado para")} ${resultado.email}.`
              : `${t("Envio não confirmado para")} ${resultado.email}.`}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={resultado.accept_url}
              aria-label={t("Link do convite do responsável")}
              className="min-w-0 text-xs"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => void copiar()}>
              <Copy size={16} />
              <span className="sr-only">{t("Copiar link")}</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Válido até")} {new Date(resultado.expires_at).toLocaleString()}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
