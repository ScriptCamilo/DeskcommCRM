import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

const ACTOR = "03430000-0000-4000-8000-000000000001";
const OUTRO = "03430000-0000-4000-8000-000000000002";
const MIGRATION = readFileSync(
  resolve("supabase/migrations/20260923222231_0393_setup_inicial_seguro.sql"),
  "utf8",
);

function limpar(): void {
  sql(`
    delete from public.platform_settings;
    delete from public.platform_branding;
    delete from public.platform_admins where user_id in ('${ACTOR}', '${OUTRO}');
    delete from public.organizations where slug in ('primeira-empresa', 'empresa-antiga');
    delete from auth.users where id in ('${ACTOR}', '${OUTRO}');
  `);
}

function erroDe(comando: string): string {
  try {
    sql(comando);
    return "";
  } catch (error) {
    return motivoDoErro(error);
  }
}

afterEach(limpar);

describe("setup inicial da instalacao", () => {
  it("so o service_role pode executar a operacao privilegiada", () => {
    expect(
      sql(
        "select has_function_privilege('authenticated', " +
          "'public.fn_complete_initial_setup(uuid,text,text,text,text,text,text,text)', 'execute');",
      ),
    ).toBe("f");
    expect(
      sql(
        "select has_function_privilege('service_role', " +
          "'public.fn_complete_initial_setup(uuid,text,text,text,text,text,text,text)', 'execute');",
      ),
    ).toBe("t");
  });

  it("cria administrador, organizacao e marca na mesma conclusao", () => {
    sql(`insert into auth.users (id, email) values ('${ACTOR}', 'owner@setup.test');`);

    const retorno = sql(`
      set role service_role;
      select public.fn_complete_initial_setup(
        '${ACTOR}', 'Primeira Empresa', 'primeira-empresa', 'pt-BR',
        'Minha Plataforma', 'suporte@example.com', null, '#12abef'
      )->>'organization_id';
      reset role;
    `);
    expect(retorno).toMatch(/(?:^|\n)[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:\n|$)/);

    expect(
      sql(`
        select (
          ps.setup_completed_by = '${ACTOR}'
          and ps.setup_completed_at is not null
          and pb.app_name = 'Minha Plataforma'
          and pb.support_email = 'suporte@example.com'
          and pa.scope = 'full'
          and uo.role = 'admin'
        )
          from public.platform_settings ps
          join public.platform_branding pb on pb.id = ps.id
          join public.platform_admins pa on pa.user_id = ps.setup_completed_by
          join public.user_organizations uo on uo.user_id = ps.setup_completed_by
          join public.organizations o on o.id = uo.organization_id
         where ps.id = 1 and o.slug = 'primeira-empresa';
      `),
    ).toBe("t");
  });

  it("recusa a segunda conclusao antes de criar outra organizacao", () => {
    sql(`insert into auth.users (id, email) values ('${ACTOR}', 'owner@setup.test');`);
    sql(`
      set role service_role;
      select public.fn_complete_initial_setup(
        '${ACTOR}', 'Primeira Empresa', 'primeira-empresa', 'pt-BR', 'Minha Plataforma'
      );
      reset role;
    `);

    const erro = erroDe(`
      set role service_role;
      select public.fn_complete_initial_setup(
        '${ACTOR}', 'Outra Empresa', 'outra-empresa', 'pt-BR', 'Outra Plataforma'
      );
    `);
    expect(erro).toContain("setup_already_completed");
    expect(sql("select count(*) from public.organizations where slug = 'outra-empresa';")).toBe(
      "0",
    );
  });

  it("upgrade fecha o setup quando ja existe administrador ativo", () => {
    sql(`
      insert into auth.users (id, email) values ('${OUTRO}', 'antigo@setup.test');
      insert into public.platform_admins
        (user_id, granted_by, scope, mfa_required, reason)
      values ('${OUTRO}', '${OUTRO}', 'full', false, 'Instalacao anterior');
    `);

    sql(MIGRATION);

    expect(
      sql(`
        select setup_completed_at is not null and setup_completed_by = '${OUTRO}'
          from public.platform_settings where id = 1;
      `),
    ).toBe("t");
  });
});
