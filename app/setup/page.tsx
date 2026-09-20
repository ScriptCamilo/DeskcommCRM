import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { SetupWizard } from "@/components/setup/SetupWizard";
import { lerEstadoDoSetup } from "@/lib/setup/estado";
import {
  SETUP_COOKIE_NAME,
  setupEstaConfigurado,
  verificarSessaoDoSetup,
} from "@/lib/setup/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuracao inicial" };

export default async function SetupPage() {
  if (!setupEstaConfigurado()) notFound();
  if ((await lerEstadoDoSetup()).concluido) notFound();

  const cookieStore = await cookies();
  const sessao = verificarSessaoDoSetup(cookieStore.get(SETUP_COOKIE_NAME)?.value);

  return <SetupWizard initiallyAuthorized={sessao.valid} />;
}
