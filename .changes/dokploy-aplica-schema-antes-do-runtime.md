---
impacto: exige_acao
secao: alterado
titulo: Dokploy atualiza o schema antes de iniciar o CRM
---
Nos deploys pelo Dokploy, o banco agora recebe o baseline do CRM antes de o
aplicativo e o worker começarem. Cadastre `SUPABASE_DB_ADMIN_URL` com a URI IPv4
do Session pooler do Supabase; essa credencial fica somente no processo efêmero
de migração e não é entregue ao aplicativo.
