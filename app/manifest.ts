import type { MetadataRoute } from "next";

import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { marcaDaSaida } from "@/lib/branding/saida";

// A imagem distribuída é construída sem a marca da instalação. Uma função
// async, sozinha, ainda pode ser prerenderizada com o nome de fallback do build.
export const dynamic = "force-dynamic";

// A especificação Web App Manifest permite combinar os dois propósitos. As
// tipagens do Next modelam apenas cada valor isolado, então mantemos o valor
// emitido pelo manifest separado da limitação de tipo local.
const PURPOSE_DO_ICONE = "any maskable" as never;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const marca = await marcaDaSaida(null);
  const linha = await marcaDaInstalacao();
  const versao = linha?.favicon_path ? `?v=${encodeURIComponent(linha.favicon_path)}` : "";
  return {
    name: marca.nome,
    short_name: marca.nome,
    display: "standalone",
    start_url: "/app",
    scope: "/",
    background_color: "#0B1020",
    theme_color: "#0B1020",
    icons: [
      {
        src: `/app-icon/192${versao}`,
        sizes: "192x192",
        type: "image/png",
        purpose: PURPOSE_DO_ICONE,
      },
      {
        src: `/app-icon/512${versao}`,
        sizes: "512x512",
        type: "image/png",
        purpose: PURPOSE_DO_ICONE,
      },
    ],
  };
}
