import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const SETUP_COOKIE_NAME = "deskcomm-setup";
export const SETUP_SESSION_TTL_SECONDS = 20 * 60;

type SetupSessionPayload = { purpose: "initial_setup"; exp: number };
export type SetupSessionResult =
  | { valid: true; payload: SetupSessionPayload }
  | { valid: false; reason: "missing_secret" | "malformed" | "invalid_signature" | "expired" };

function codificar(valor: string | Buffer): string {
  return Buffer.from(valor).toString("base64url");
}

function assinatura(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function setupEstaConfigurado(secret = env.SETUP_TOKEN): boolean {
  return secret.length >= 32;
}

export function tokenDoSetupConfere(recebido: string, configurado = env.SETUP_TOKEN): boolean {
  if (!setupEstaConfigurado(configurado)) return false;
  const recebidoBuffer = Buffer.from(recebido);
  const configuradoBuffer = Buffer.from(configurado);
  return (
    recebidoBuffer.length === configuradoBuffer.length &&
    timingSafeEqual(recebidoBuffer, configuradoBuffer)
  );
}

export function assinarSessaoDoSetup(
  secret = env.SETUP_TOKEN,
  agoraEmSegundos = Math.floor(Date.now() / 1000),
): string {
  if (!setupEstaConfigurado(secret)) throw new Error("SETUP_TOKEN ausente ou curto");
  const payload = codificar(
    JSON.stringify({ purpose: "initial_setup", exp: agoraEmSegundos + SETUP_SESSION_TTL_SECONDS }),
  );
  return `${payload}.${codificar(assinatura(payload, secret))}`;
}

export function verificarSessaoDoSetup(
  token: string | undefined,
  secret = env.SETUP_TOKEN,
  agoraEmSegundos = Math.floor(Date.now() / 1000),
): SetupSessionResult {
  if (!setupEstaConfigurado(secret)) return { valid: false, reason: "missing_secret" };
  const [payload, assinaturaRecebida, sobra] = token?.split(".") ?? [];
  if (!payload || !assinaturaRecebida || sobra) return { valid: false, reason: "malformed" };

  let recebida: Buffer;
  try {
    recebida = Buffer.from(assinaturaRecebida, "base64url");
  } catch {
    return { valid: false, reason: "malformed" };
  }
  const esperada = assinatura(payload, secret);
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) {
    return { valid: false, reason: "invalid_signature" };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<SetupSessionPayload>;
    if (parsed.purpose !== "initial_setup" || typeof parsed.exp !== "number") {
      return { valid: false, reason: "malformed" };
    }
    if (parsed.exp <= agoraEmSegundos) return { valid: false, reason: "expired" };
    return { valid: true, payload: parsed as SetupSessionPayload };
  } catch {
    return { valid: false, reason: "malformed" };
  }
}
