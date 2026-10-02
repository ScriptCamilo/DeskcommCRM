---
impacto: nada_mudou
secao: corrigido
titulo: O WhatsApp volta a entregar mensagens quando a assinatura do webhook esta ativa
---

O compose passa o segredo de webhook ao WAHA com o nome de variavel que ele reconhece. Antes,
o nome incorreto deixava o WAHA enviar eventos sem assinatura; instalacoes que ativavam a
proteção no painel recusavam todas as mensagens recebidas, embora ainda conseguissem enviar.
Depois de atualizar, basta manter o mesmo `WAHA_HMAC_SECRET` ja configurado e reativar a
exigencia de assinatura no painel de Sistema.
