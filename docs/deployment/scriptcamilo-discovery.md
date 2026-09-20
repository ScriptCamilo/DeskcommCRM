# Distribuicao ScriptCamilo: discovery e plano

Este documento registra o estado medido antes da implementacao da distribuicao
ScriptCamilo. O codigo continua sendo a fonte da verdade; paths e comandos sao
preferidos a contagens congeladas.

## Regras de contribuicao aplicadas

- `CONTRIBUTING.md`, `CLAUDE.md`, `ARCHITECTURE.md` e as skills
  `deskcomm-contribuir`, `deskcomm-doutrina` e `sistema-vivo` foram lidos antes
  da primeira alteracao.
- O trabalho vive na branch `feat/EPIC-12-scriptcamilo-distribution`, criada de
  `origin/main`, em worktree separado.
- Cada etapa funcional fecha com testes proporcionais e commit convencional.
- Mudancas do fork serao aditivas e, sempre que possivel, ficarao em arquivos
  novos. Nenhum instalador, compose ou fluxo upstream sera removido.

## Mapa do que ja existe

| Requisito                          | Estado              | Decisao                                                                                                                                                                                           |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imagens de app, worker e scheduler | EXISTE              | Reutilizar os tres Dockerfiles e o workflow que publica as imagens do mesmo commit em `.github/workflows/publish-image.yml`.                                                                      |
| Compose de producao                | EXISTE              | Preservar `docker-compose.prod.yml` e seus overrides. Criar um compose Dokploy independente, sem Caddy e sem portas internas publicadas.                                                          |
| WAHA, Redis e SRH                  | EXISTE              | Reutilizar imagens, volumes, healthchecks e rede interna do compose atual.                                                                                                                        |
| Voz via WaCalls                    | EXISTE PARCIALMENTE | Preservar como profile opt-in; nao ligar na instalacao padrao.                                                                                                                                    |
| Supabase                           | EXISTE              | Consumir Supabase externo. Migration continua separada do boot da aplicacao.                                                                                                                      |
| Bootstrap do primeiro dono         | EXISTE PARCIALMENTE | O `install.sh` e `scripts/bootstrap-owner.ts` criam Auth, organizacao, membership e platform admin, mas exigem credenciais em ambiente/terminal. Extrair as regras para um setup web idempotente. |
| Onboarding de organizacao          | EXISTE              | Reutilizar `/onboarding`; ele configura a organizacao depois que identidade e membership ja existem. Nao confundir com setup da instalacao.                                                       |
| Estado de instalacao               | NAO EXISTE          | Criar singleton server-only com conclusao, data e ator.                                                                                                                                           |
| Protecao do setup                  | NAO EXISTE          | Adicionar `SETUP_TOKEN` opcional no produto e obrigatorio na receita Dokploy. Token sera validado no servidor e trocado por cookie HttpOnly curto.                                                |
| Organizacoes, memberships e RLS    | EXISTE              | Reutilizar `organizations`, `user_organizations`, `fn_user_org_ids()` e `fn_user_role_in_org()`. Host nunca sera fronteira de seguranca.                                                          |
| Platform admin                     | EXISTE              | Reutilizar `/admin`, `platform_admins` e `requirePlatformAdmin`.                                                                                                                                  |
| Suporte/impersonation              | EXISTE              | Reutilizar `platform_support_sessions`, RPCs de inicio/fim, cookie assinado e auditoria. Nao criar segundo mecanismo.                                                                             |
| Branding da instalacao             | EXISTE              | Reutilizar `platform_branding` e `lib/branding/instalacao.ts`.                                                                                                                                    |
| Branding por organizacao           | EXISTE              | Reutilizar `organizations.settings.branding` e `lib/branding/organizacao.ts`.                                                                                                                     |
| Dominio por organizacao            | NAO EXISTE          | Criar tabela tenant-aware propria; nao adicionar uma unica coluna em `organizations`.                                                                                                             |
| Tenant resolver por hostname       | NAO EXISTE          | Criar modulo server-only central, normalizacao pura e cache com invalidacao explicita.                                                                                                            |
| Login contextual por dominio       | EXISTE PARCIALMENTE | A tela ja resolve a marca da instalacao. Estender para marca publica do tenant sem revelar organizacao desconhecida.                                                                              |
| Contexto de plataforma por dominio | EXISTE PARCIALMENTE | `/admin` ja e contexto de plataforma por path. Adicionar classificacao central de host sem inventar organizacao falsa.                                                                            |
| Feature flags e paywall            | EXISTE/PRESERVAR    | Nao criar planos comerciais nem bloquear recursos por organizacao.                                                                                                                                |

## Decisoes de arquitetura

### Artefatos Docker

O compose Dokploy usara `image:` e `build:` juntos para app, worker e scheduler.
O build garante que os tres derivem do commit selecionado pelo Dokploy; `image:`
evita servicos `build:`-only e permite nomear/cachear o artefato. A distribuicao
publicada continua sendo o caminho recomendado para atualizacoes previsiveis.

O Dokploy assume Traefik, dominio e TLS. Portanto o compose novo nao sobe Caddy,
nao publica 80/443 e expoe somente a porta interna 3000 do app para o roteador do
painel. Supabase nao entra no compose.

### Setup inicial

O setup tera duas camadas:

1. validacao constante do `SETUP_TOKEN` exclusivamente no servidor, seguida de
   cookie HttpOnly, `SameSite=Strict`, com expiracao curta;
2. uma RPC server-only que cria organizacao, membership, platform admin,
   branding e estado de instalacao numa unica transacao.

A criacao em Supabase Auth ocorre antes da RPC porque a Admin API nao participa
de transacao Postgres. Se a RPC falhar e o usuario tiver sido criado por aquela
tentativa, o handler o remove. Repeticoes consultam o estado singleton e
terminam sem duplicar estruturas. Depois de concluido, `/setup` e suas mutacoes
respondem como superficie inexistente.

### Dominio e seguranca

`organization_domains` tera `organization_id not null`, RLS e unicidade sobre o
hostname normalizado. O resolvedor de hostname fornece contexto visual; acesso
a dados continua dependendo de Auth, membership e RLS. Um usuario autenticado
sem membership no tenant resolvido recebe resposta indistinguivel de recurso
inexistente e nao e redirecionado para outra organizacao.

### Compatibilidade upstream

Os pontos com maior chance de conflito sao `proxy.ts`, `lib/env.ts`,
`.env.example`, a tela de login e o catalogo de navegacao. A implementacao deve
manter esses diffs pequenos e delegar comportamento a modulos novos. Schema sai
sempre como migration nova, apendice idempotente no baseline e entrada no
MANIFEST.

## Plano incremental e commits

1. Dokploy: compose, documentacao operacional, validacao estrutural e fragmento
   de release.
2. Setup: estado no banco, RPC atomica, sessao protegida, UI e testes.
3. Dominios: schema/RLS, normalizacao, resolver, administracao e testes de
   isolamento.
4. Contexto: branding no login, enforcement de membership e contexto platform.
5. Fechamento: mapas de arquitetura, E2E visual, gates completos e pre-voo.

## Living System Checklist

### Deployment Dokploy

- Entrada: commit do fork + variaveis inseridas no painel.
- Saida: stack executavel e healthchecks observaveis no Dokploy.
- Log/superficie: logs e estado dos servicos no painel; guia de troubleshooting.
- Porta: `docs/deployment/dokploy.md` e o seletor de compose do Dokploy.
- Anti-morte: healthchecks, restart policies e diagnostico explicito.
- Configuracao: Environment Variables do Dokploy, documentadas sem segredos.
- Continuidade e retorno: nao se aplica a atendimento; falha retorna pelo estado
  do deploy e pelo endpoint de health.

### Setup e tenant context

- Entrada: operador autorizado pelo token e hostname da requisicao.
- Saida: identidade administrativa consistente e contexto visual do tenant.
- Log/superficie: auditoria de conclusao/setup e telas de setup/admin.
- Porta: `/setup`, removida logicamente depois da conclusao; dominios na area
  administrativa existente.
- Anti-morte: compensacao da criacao Auth, idempotencia e estado recuperavel.
- Configuracao: setup visual e gestao de dominios/branding no admin.
- Continuidade IA-humano: nao se aplica; nenhum turno de atendimento e criado.
- Retorno: erros permanecem visiveis e acionaveis no setup/admin; alteracoes de
  dominio invalidam o contexto em cache.
