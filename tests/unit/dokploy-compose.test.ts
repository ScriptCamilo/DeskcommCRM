import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const compose = fs.readFileSync(path.join(process.cwd(), "docker-compose.dokploy.yml"), "utf8");

function blocoDoServico(nome: string): string {
  const inicio = compose.indexOf(`\n  ${nome}:\n`);
  if (inicio < 0) return "";
  const restante = compose.slice(inicio + 1);
  const fim = restante.slice(1).search(/^  [a-z0-9_-]+:\s*$/m);
  return fim < 0 ? restante : restante.slice(0, fim + 1);
}

describe("compose da distribuicao Dokploy", () => {
  it("sobe somente os servicos necessarios e deixa Supabase externo", () => {
    for (const servico of ["app", "worker", "scheduler", "waha", "redis", "srh", "wacalls"]) {
      expect(blocoDoServico(servico), `${servico} ausente`).not.toBe("");
    }

    expect(blocoDoServico("caddy")).toBe("");
    expect(blocoDoServico("supabase")).toBe("");
  });

  it.each([
    ["app", "Dockerfile"],
    ["worker", "Dockerfile.worker"],
    ["scheduler", "Dockerfile.scheduler"],
  ])("%s tem image e build do checkout (%s)", (servico, dockerfile) => {
    const bloco = blocoDoServico(servico);
    expect(bloco).toMatch(/^    image:\s+/m);
    expect(bloco).toContain("build:");
    expect(bloco).toContain(`dockerfile: ${dockerfile}`);
    expect(bloco).toContain("APP_VERSION:");
  });

  it("nao depende de arquivo .env e falha cedo sem configuracao obrigatoria", () => {
    expect(compose).not.toMatch(/^\s+env_file:/m);
    for (const chave of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_DB_URL",
      "INTERNAL_SECRET",
      "WAHA_API_KEY",
      "SRH_TOKEN",
    ]) {
      expect(compose, `${chave} nao falha cedo`).toContain(`\${${chave}:?`);
    }
  });

  it("roteia somente o app e mantem dependencias HTTP na rede interna", () => {
    expect(blocoDoServico("app")).toMatch(/^    expose:\s*\n\s+- "3000"/m);
    expect(blocoDoServico("app")).not.toMatch(/^    ports:/m);
    expect(blocoDoServico("worker")).not.toMatch(/^    ports:/m);
    expect(blocoDoServico("waha")).not.toMatch(/^    ports:/m);
    expect(blocoDoServico("redis")).not.toMatch(/^    ports:/m);
    expect(blocoDoServico("srh")).not.toMatch(/^    ports:/m);
    expect(compose).toContain("WAHA_API_BASE_URL: http://waha:3000");
    expect(compose).toContain("UPSTASH_REDIS_REST_URL: http://srh:80");
  });

  it("persiste sessoes e midia do canal, com voz desligada por padrao", () => {
    expect(blocoDoServico("waha")).toContain("waha-data:/app/.sessions");
    expect(blocoDoServico("waha")).toContain("waha-media:/app/.media");
    expect(blocoDoServico("wacalls")).toContain('profiles: ["voz"]');
    expect(blocoDoServico("wacalls")).toMatch(/\/udp/m);
  });
});
