import { describe, expect, it } from "vitest";

import { setupInicialSchema } from "./schema";

const valido = {
  admin_name: "Ana Souza",
  admin_email: "ana@example.com",
  admin_password: "uma-senha-forte-123",
  organization_name: "Empresa Inicial",
  organization_slug: "empresa-inicial",
  locale: "pt-BR",
  app_name: "Minha Plataforma",
  support_email: "",
  logo_url: "",
  accent_hex: "#0f766e",
};

describe("contrato do setup inicial", () => {
  it("normaliza opcionais vazios para null", () => {
    expect(setupInicialSchema.parse(valido)).toMatchObject({
      support_email: null,
      logo_url: null,
    });
  });

  it("recusa senha curta, slug ambiguo e cor fora do formato", () => {
    expect(
      setupInicialSchema.safeParse({
        ...valido,
        admin_password: "curta",
        organization_slug: "Empresa Inicial",
        accent_hex: "#FFF",
      }).success,
    ).toBe(false);
  });

  it("oferece portugues brasileiro e espanhol", () => {
    expect(setupInicialSchema.safeParse({ ...valido, locale: "es" }).success).toBe(true);
    expect(setupInicialSchema.safeParse({ ...valido, locale: "en" }).success).toBe(false);
  });
});
