# Deploy da distribuicao ScriptCamilo no Dokploy

O `docker-compose.dokploy.yml` e o ponto de entrada oficial desta distribuicao.
Ele nao instala nem configura Docker, Dokploy, Traefik, DNS ou certificados. O
Dokploy continua dono dessas responsabilidades.

## Pre-requisitos

- servidor com Dokploy operacional e recursos para a stack;
- projeto Supabase externo com o schema desta branch aplicado;
- dominio com DNS apontando para o servidor;
- acesso ao fork e permissao para o Dokploy construir o repositorio;
- OpenSSL numa maquina confiavel para gerar os segredos.

O Supabase nao faz parte do compose. Banco e aplicacao possuem ciclos separados:
aplique migrations pelo fluxo controlado do Supabase antes de publicar uma
versao que dependa delas. O startup da aplicacao nunca executa DDL.

## Criar o servico

1. No Dokploy, crie um projeto do tipo Docker Compose.
2. Conecte `ScriptCamilo/DeskcommCRM` e escolha a branch desejada.
3. Informe `docker-compose.dokploy.yml` como caminho do compose.
4. Cadastre as variaveis da secao seguinte na aba Environment.
5. Crie o dominio apontando para o servico `app`, porta interna `3000`.
6. Inicie o deploy e espere `app`, `worker`, `scheduler`, `waha`, `redis` e
   `srh` ficarem ativos.

Nao adicione Caddy, Nginx Proxy Manager ou mapeamentos 80/443 a esta stack. O
Traefik administrado pelo Dokploy e o unico proxy publico.

## Servicos

| Servico     | Papel                                 | Exposicao                                    |
| ----------- | ------------------------------------- | -------------------------------------------- |
| `app`       | Next.js, UI e APIs                    | porta interna 3000 para o dominio do Dokploy |
| `worker`    | filas, agente e event log             | somente rede interna                         |
| `scheduler` | crons HTTP autenticados               | somente rede interna                         |
| `waha`      | transporte do canal de mensagens      | somente rede interna                         |
| `redis`     | debounce e rate limit                 | somente rede interna                         |
| `srh`       | adaptador REST compativel com Upstash | somente rede interna                         |
| `wacalls`   | chamada de voz opt-in                 | profile `voz`; somente a porta UDP de midia  |

App, worker e scheduler possuem `build:` e `image:`. O Dokploy constroi os tres
a partir do mesmo checkout e guarda imagens nomeadas, evitando misturar commits.
Use `APP_VERSION` com o SHA curto ou a versao publicada para o endpoint de health
identificar o artefato em execucao.

## Variaveis obrigatorias

O compose usa `${VAR:?mensagem}` nas chaves desta tabela. Ausencia interrompe a
resolucao do compose antes que uma stack parcialmente configurada seja criada.

| Variavel                        | Finalidade                         | Geracao/origem              |
| ------------------------------- | ---------------------------------- | --------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL HTTP do projeto Supabase       | painel do Supabase          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave publica do Supabase          | painel do Supabase          |
| `SUPABASE_SERVICE_ROLE_KEY`     | operacoes server-side              | segredo do Supabase         |
| `SUPABASE_DB_URL`               | Postgres usado pelo worker         | connection string com SSL   |
| `NEXT_PUBLIC_APP_URL`           | URL publica canonica               | `https://crm.exemplo.com`   |
| `NEXT_PUBLIC_ADMIN_URL`         | URL da administracao               | pode ser a mesma URL do app |
| `INTERNAL_SECRET`               | chamadas internas autenticadas     | `openssl rand -hex 32`      |
| `INTERNAL_CRON_SECRET`          | crons autenticados                 | `openssl rand -hex 32`      |
| `CPF_ENCRYPTION_KEY`            | cifra de CPF                       | `openssl rand -base64 32`   |
| `WAHA_BYO_ENCRYPTION_KEY`       | cifra de credencial WAHA por org   | `openssl rand -base64 32`   |
| `AI_CRED_AES_KEY`               | cifra de credenciais de IA         | `openssl rand -base64 32`   |
| `IMPERSONATE_COOKIE_SECRET`     | cookie de suporte temporario       | `openssl rand -hex 32`      |
| `LGPD_SIGNING_KEY`              | assinatura de exportacoes LGPD     | `openssl rand -hex 32`      |
| `WAHA_API_KEY`                  | plaintext enviado pelo app ao WAHA | `openssl rand -hex 32`      |
| `WAHA_API_KEY_SHA512`           | hash recebido pelo WAHA            | comando abaixo              |
| `SRH_TOKEN`                     | autentica o adaptador Redis REST   | `openssl rand -hex 32`      |

Gere `WAHA_API_KEY` uma vez e derive o hash sem expor o valor em historico de
shell compartilhado:

```bash
printf '%s' 'COLE_A_WAHA_API_KEY' | openssl dgst -sha512 -hex
```

Cadastre apenas o ultimo campo hexadecimal como `WAHA_API_KEY_SHA512`. O
plaintext fica em `WAHA_API_KEY`. Nunca use o hash no cliente nem o plaintext no
container do WAHA.

## Variaveis opcionais

O compose passa para app e worker as integracoes declaradas em `.env.example`:
provedores de IA, OpenRouter, transcricao, calendario e anuncios Google,
Nuvemshop, Meta, Zernio, Resend/SMTP, web push, Sentry, voz e knobs de retencao.
Valor vazio mantem a integracao desligada quando o contrato em `lib/env.ts`
permite isso.

Branding inicial usa `APP_NAME`, `APP_LOGO_URL`, `APP_ACCENT_HEX`, `APP_LOCALE`
e `SUPPORT_EMAIL`. Depois da primeira gravacao, o banco e a superficie de
administracao sao a fonte de verdade; as envs ficam como fallback de rollback.

`SUPABASE_DB_ADMIN_URL` e opcional no runtime e nao e usada para migrations pelo
app. Se uma pipeline de banco precisar dela, mantenha a credencial somente nessa
pipeline, fora dos containers da aplicacao sempre que possivel.

## Primeiro administrador

Nesta etapa da branch, o compose ja e reproduzivel, mas o setup visual ainda
esta em implementacao. Ate a etapa de setup ser concluida, a criacao inicial do
dono continua seguindo as regras de `scripts/bootstrap-owner.ts`. Nao mantenha
`OWNER_PASSWORD` como variavel permanente do Dokploy.

Quando o setup visual entrar, esta secao sera substituida pelo fluxo protegido
de `/setup`, e uma atualizacao normal nunca executara o bootstrap novamente.

## Persistencia e backup

Backup obrigatorio:

- banco, Auth e Storage no Supabase;
- volume `waha-data`, que guarda as sessoes pareadas;
- volume `waha-media`, conforme a politica de retencao de midia;
- volume `wacalls-data` somente quando o profile de voz estiver ativo.

Redis e efemero por desenho. Nao restaure seu volume. O codigo da aplicacao vem
do Git e as imagens podem ser reconstruidas do commit publicado.

## Atualizar

1. aplique migrations novas pelo fluxo do Supabase;
2. selecione a nova tag ou commit no Dokploy;
3. faca redeploy do compose;
4. confira `/api/v1/health`, logs do worker e execucao do scheduler;
5. nunca execute novamente o bootstrap numa instalacao ja concluida.

Evite apontar clientes para uma branch movel sem janela de validacao. Releases
devem usar tag imutavel e manter app, worker e scheduler no mesmo commit.

## Troubleshooting

| Sintoma                       | Verificacao                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| Compose nao resolve           | procure a mensagem `configure NOME_DA_VARIAVEL` no deploy        |
| App reinicia                  | confirme Supabase, `SUPABASE_DB_URL` e chaves criptograficas     |
| Worker unhealthy              | veja `/healthz` no container e a conectividade com Postgres/WAHA |
| Scheduler ativo sem efeito    | compare `INTERNAL_SECRET` e logs das rotas de cron               |
| WAHA devolve 401              | derive novamente `WAHA_API_KEY_SHA512` a partir do plaintext     |
| Rate limit devolve 401        | confirme que `SRH_TOKEN` e o mesmo valor entregue ao app         |
| Dominio responde 404 do proxy | confirme servico `app` e porta interna `3000` no Dokploy         |

Os containers internos nao publicam TCP no host. Para diagnostico, use o
terminal/logs do proprio Dokploy em vez de abrir portas temporarias na internet.
