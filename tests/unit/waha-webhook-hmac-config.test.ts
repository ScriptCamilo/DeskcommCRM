import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const COMPOSES = [
  "docker-compose.yml",
  "docker-compose.local.yml",
  "docker-compose.prod.yml",
  "docker-compose.dokploy.yml",
];

function linhasAtivas(conteudo: string): string {
  return conteudo
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("#"))
    .join("\n");
}

describe("assinatura HMAC do webhook WAHA", () => {
  for (const arquivo of COMPOSES) {
    it(`${arquivo}: passa o segredo sob o nome que o WAHA reconhece`, () => {
      const conteudo = linhasAtivas(readFileSync(arquivo, "utf8"));

      expect(conteudo).toMatch(/WHATSAPP_HOOK_HMAC_KEY:\s*\$\{WAHA_HMAC_SECRET/);
      expect(conteudo).not.toMatch(/^\s*WHATSAPP_HOOK_HMAC:/m);
    });
  }
});
