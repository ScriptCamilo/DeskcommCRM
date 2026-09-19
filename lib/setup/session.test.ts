import { describe, expect, it } from "vitest";

import {
  assinarSessaoDoSetup,
  SETUP_SESSION_TTL_SECONDS,
  setupEstaConfigurado,
  tokenDoSetupConfere,
  verificarSessaoDoSetup,
} from "./session";

const SEGREDO = "a".repeat(64);

describe("sessao curta do setup", () => {
  it("so habilita segredo com entropia minima", () => {
    expect(setupEstaConfigurado("x".repeat(31))).toBe(false);
    expect(setupEstaConfigurado("x".repeat(32))).toBe(true);
  });

  it("compara o token sem aceitar prefixo ou tamanho diferente", () => {
    expect(tokenDoSetupConfere(SEGREDO, SEGREDO)).toBe(true);
    expect(tokenDoSetupConfere(`${SEGREDO}x`, SEGREDO)).toBe(false);
    expect(tokenDoSetupConfere(SEGREDO.slice(1), SEGREDO)).toBe(false);
  });

  it("assina, verifica e expira no limite declarado", () => {
    const token = assinarSessaoDoSetup(SEGREDO, 1_000);
    expect(verificarSessaoDoSetup(token, SEGREDO, 1_001).valid).toBe(true);
    expect(verificarSessaoDoSetup(token, SEGREDO, 1_000 + SETUP_SESSION_TTL_SECONDS)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("recusa assinatura alterada", () => {
    const token = assinarSessaoDoSetup(SEGREDO, 1_000);
    const alterado = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verificarSessaoDoSetup(alterado, SEGREDO, 1_001)).toEqual({
      valid: false,
      reason: "invalid_signature",
    });
  });
});
