"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  KeyRound,
  Loader2,
  Palette,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Idioma = "pt-BR" | "es";
type Etapa = "token" | "admin" | "organization" | "branding" | "review" | "done";

type Valores = {
  admin_name: string;
  admin_email: string;
  admin_password: string;
  organization_name: string;
  organization_slug: string;
  locale: Idioma;
  app_name: string;
  support_email: string;
  logo_url: string;
  accent_hex: string;
};

const textos = {
  "pt-BR": {
    title: "Configuracao inicial",
    tokenTitle: "Autorize este navegador",
    tokenBody: "Use o token definido no ambiente da instalacao.",
    token: "Token de setup",
    authorize: "Autorizar",
    admin: "Administrador",
    adminBody: "Esta conta tera acesso completo a plataforma.",
    name: "Nome completo",
    email: "Email",
    password: "Senha",
    passwordHint: "Use pelo menos 12 caracteres.",
    organization: "Primeira empresa",
    organizationBody: "Crie o primeiro espaco de trabalho da instalacao.",
    organizationName: "Nome da empresa",
    slug: "Identificador",
    language: "Idioma inicial",
    branding: "Marca da instalacao",
    brandingBody: "Estes dados aparecem no acesso e nas comunicacoes do sistema.",
    appName: "Nome da plataforma",
    supportEmail: "Email de suporte",
    logoUrl: "URL do logotipo",
    accent: "Cor principal",
    optional: "Opcional",
    review: "Revisao",
    reviewBody: "Confira os dados antes de criar a instalacao.",
    back: "Voltar",
    continue: "Continuar",
    complete: "Concluir instalacao",
    working: "Configurando...",
    done: "Instalacao concluida",
    doneBody: "A plataforma esta pronta. Entre com a conta administradora criada agora.",
    signIn: "Ir para o login",
    invalid: "Confira os campos obrigatorios desta etapa.",
    authError: "O token nao foi aceito.",
    completeError: "Nao foi possivel concluir a instalacao.",
    brazilianPortuguese: "Portugues (Brasil)",
    spanish: "Espanol",
  },
  es: {
    title: "Configuracion inicial",
    tokenTitle: "Autoriza este navegador",
    tokenBody: "Usa el token definido en el entorno de la instalacion.",
    token: "Token de configuracion",
    authorize: "Autorizar",
    admin: "Administrador",
    adminBody: "Esta cuenta tendra acceso completo a la plataforma.",
    name: "Nombre completo",
    email: "Correo electronico",
    password: "Contrasena",
    passwordHint: "Usa al menos 12 caracteres.",
    organization: "Primera empresa",
    organizationBody: "Crea el primer espacio de trabajo de la instalacion.",
    organizationName: "Nombre de la empresa",
    slug: "Identificador",
    language: "Idioma inicial",
    branding: "Marca de la instalacion",
    brandingBody: "Estos datos aparecen en el acceso y en las comunicaciones del sistema.",
    appName: "Nombre de la plataforma",
    supportEmail: "Correo de soporte",
    logoUrl: "URL del logotipo",
    accent: "Color principal",
    optional: "Opcional",
    review: "Revision",
    reviewBody: "Verifica los datos antes de crear la instalacion.",
    back: "Volver",
    continue: "Continuar",
    complete: "Completar instalacion",
    working: "Configurando...",
    done: "Instalacion completada",
    doneBody: "La plataforma esta lista. Ingresa con la cuenta administradora que acabas de crear.",
    signIn: "Ir al acceso",
    invalid: "Verifica los campos obligatorios de este paso.",
    authError: "El token no fue aceptado.",
    completeError: "No fue posible completar la instalacion.",
    brazilianPortuguese: "Portugues (Brasil)",
    spanish: "Espanol",
  },
} as const;

const ordem: Etapa[] = ["admin", "organization", "branding", "review"];

function slugify(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function SetupWizard({ initiallyAuthorized }: { initiallyAuthorized: boolean }) {
  const [idioma, setIdioma] = useState<Idioma>("pt-BR");
  const [etapa, setEtapa] = useState<Etapa>(initiallyAuthorized ? "admin" : "token");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [slugEditado, setSlugEditado] = useState(false);
  const [valores, setValores] = useState<Valores>({
    admin_name: "",
    admin_email: "",
    admin_password: "",
    organization_name: "",
    organization_slug: "",
    locale: "pt-BR",
    app_name: "",
    support_email: "",
    logo_url: "",
    accent_hex: "#0f766e",
  });
  const t = textos[idioma];
  const indice = ordem.indexOf(etapa);
  const progresso =
    etapa === "token" ? 0 : etapa === "done" ? 100 : ((indice + 1) / ordem.length) * 100;

  const etapaValida = useMemo(() => {
    if (etapa === "admin") {
      return (
        valores.admin_name.trim().length >= 2 &&
        /.+@.+\..+/.test(valores.admin_email) &&
        valores.admin_password.length >= 12
      );
    }
    if (etapa === "organization") {
      return (
        valores.organization_name.trim().length >= 2 &&
        /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(valores.organization_slug)
      );
    }
    if (etapa === "branding") {
      return valores.app_name.trim().length >= 2 && /^#[0-9a-f]{6}$/.test(valores.accent_hex);
    }
    return true;
  }, [etapa, valores]);

  function atualizar<K extends keyof Valores>(campo: K, valor: Valores[K]) {
    setValores((atual) => ({ ...atual, [campo]: valor }));
  }

  async function autorizar() {
    setPending(true);
    setErro(null);
    try {
      const response = await fetch("/api/v1/setup/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("token");
      setToken("");
      setEtapa("admin");
    } catch {
      setErro(t.authError);
    } finally {
      setPending(false);
    }
  }

  function avancar() {
    setErro(null);
    if (!etapaValida) {
      setErro(t.invalid);
      return;
    }
    const atual = ordem.indexOf(etapa);
    if (atual >= 0 && atual < ordem.length - 1) setEtapa(ordem[atual + 1] ?? "review");
  }

  function voltar() {
    setErro(null);
    const atual = ordem.indexOf(etapa);
    if (atual > 0) setEtapa(ordem[atual - 1] ?? "admin");
  }

  async function concluir() {
    setPending(true);
    setErro(null);
    try {
      const response = await fetch("/api/v1/setup/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valores),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "setup");
      }
      setEtapa("done");
    } catch (error) {
      setErro(
        error instanceof Error && error.message !== "setup" ? error.message : t.completeError,
      );
    } finally {
      setPending(false);
    }
  }

  const Icone =
    etapa === "token"
      ? KeyRound
      : etapa === "admin"
        ? UserRound
        : etapa === "organization"
          ? Building2
          : etapa === "branding"
            ? Palette
            : ShieldCheck;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" aria-hidden />
            </div>
            <span className="font-semibold">{t.title}</span>
          </div>
          <div className="flex rounded-md border p-0.5" aria-label="Idioma">
            <Button
              type="button"
              variant={idioma === "pt-BR" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5"
              onClick={() => setIdioma("pt-BR")}
            >
              PT
            </Button>
            <Button
              type="button"
              variant={idioma === "es" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5"
              onClick={() => setIdioma("es")}
            >
              ES
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-10 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${progresso}%` }}
          />
        </div>

        <section className="grid gap-10 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-16">
          <div>
            <div className="mb-5 flex size-11 items-center justify-center rounded-md border bg-card text-primary">
              <Icone className="size-5" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold">
              {etapa === "token"
                ? t.tokenTitle
                : etapa === "admin"
                  ? t.admin
                  : etapa === "organization"
                    ? t.organization
                    : etapa === "branding"
                      ? t.branding
                      : etapa === "done"
                        ? t.done
                        : t.review}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {etapa === "token"
                ? t.tokenBody
                : etapa === "admin"
                  ? t.adminBody
                  : etapa === "organization"
                    ? t.organizationBody
                    : etapa === "branding"
                      ? t.brandingBody
                      : etapa === "done"
                        ? t.doneBody
                        : t.reviewBody}
            </p>
          </div>

          <div className="min-w-0">
            {etapa === "token" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void autorizar();
                }}
                className="max-w-lg space-y-5"
              >
                <Campo label={t.token} htmlFor="setup-token">
                  <Input
                    id="setup-token"
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    autoFocus
                  />
                </Campo>
                <Button type="submit" disabled={pending || token.length === 0}>
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <KeyRound className="size-4" aria-hidden />
                  )}
                  {t.authorize}
                </Button>
              </form>
            )}

            {etapa === "admin" && (
              <div className="max-w-lg space-y-5">
                <Campo label={t.name} htmlFor="admin-name">
                  <Input
                    id="admin-name"
                    autoComplete="name"
                    value={valores.admin_name}
                    onChange={(event) => atualizar("admin_name", event.target.value)}
                    autoFocus
                  />
                </Campo>
                <Campo label={t.email} htmlFor="admin-email">
                  <Input
                    id="admin-email"
                    type="email"
                    autoComplete="email"
                    value={valores.admin_email}
                    onChange={(event) => atualizar("admin_email", event.target.value)}
                  />
                </Campo>
                <Campo label={t.password} htmlFor="admin-password" hint={t.passwordHint}>
                  <Input
                    id="admin-password"
                    type="password"
                    autoComplete="new-password"
                    value={valores.admin_password}
                    onChange={(event) => atualizar("admin_password", event.target.value)}
                  />
                </Campo>
              </div>
            )}

            {etapa === "organization" && (
              <div className="max-w-lg space-y-5">
                <Campo label={t.organizationName} htmlFor="organization-name">
                  <Input
                    id="organization-name"
                    value={valores.organization_name}
                    onChange={(event) => {
                      const nome = event.target.value;
                      atualizar("organization_name", nome);
                      if (!slugEditado) atualizar("organization_slug", slugify(nome));
                    }}
                    autoFocus
                  />
                </Campo>
                <Campo label={t.slug} htmlFor="organization-slug">
                  <Input
                    id="organization-slug"
                    value={valores.organization_slug}
                    onChange={(event) => {
                      setSlugEditado(true);
                      atualizar("organization_slug", slugify(event.target.value));
                    }}
                  />
                </Campo>
                <Campo label={t.language} htmlFor="organization-locale">
                  <Select
                    value={valores.locale}
                    onValueChange={(value: Idioma) => atualizar("locale", value)}
                  >
                    <SelectTrigger id="organization-locale">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">{t.brazilianPortuguese}</SelectItem>
                      <SelectItem value="es">{t.spanish}</SelectItem>
                    </SelectContent>
                  </Select>
                </Campo>
              </div>
            )}

            {etapa === "branding" && (
              <div className="max-w-lg space-y-5">
                <Campo label={t.appName} htmlFor="app-name">
                  <Input
                    id="app-name"
                    value={valores.app_name}
                    onChange={(event) => atualizar("app_name", event.target.value)}
                    autoFocus
                  />
                </Campo>
                <Campo label={`${t.supportEmail} (${t.optional})`} htmlFor="support-email">
                  <Input
                    id="support-email"
                    type="email"
                    value={valores.support_email}
                    onChange={(event) => atualizar("support_email", event.target.value)}
                  />
                </Campo>
                <Campo label={`${t.logoUrl} (${t.optional})`} htmlFor="logo-url">
                  <Input
                    id="logo-url"
                    type="url"
                    value={valores.logo_url}
                    onChange={(event) => atualizar("logo_url", event.target.value)}
                  />
                </Campo>
                <Campo label={t.accent} htmlFor="accent-hex">
                  <div className="flex gap-3">
                    <Input
                      id="accent-color"
                      type="color"
                      className="h-9 w-12 p-1"
                      value={valores.accent_hex}
                      onChange={(event) => atualizar("accent_hex", event.target.value)}
                      aria-label={t.accent}
                    />
                    <Input
                      id="accent-hex"
                      className="font-mono"
                      value={valores.accent_hex}
                      onChange={(event) =>
                        atualizar("accent_hex", event.target.value.toLowerCase())
                      }
                    />
                  </div>
                </Campo>
              </div>
            )}

            {etapa === "review" && (
              <div className="max-w-xl divide-y rounded-lg border bg-card px-5">
                <Resumo
                  icon={UserRound}
                  titulo={t.admin}
                  linhas={[valores.admin_name, valores.admin_email]}
                />
                <Resumo
                  icon={Building2}
                  titulo={t.organization}
                  linhas={[valores.organization_name, valores.organization_slug, valores.locale]}
                />
                <Resumo
                  icon={Palette}
                  titulo={t.branding}
                  linhas={[valores.app_name, valores.support_email || t.optional]}
                  cor={valores.accent_hex}
                />
              </div>
            )}

            {etapa === "done" && (
              <div className="max-w-lg">
                <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-6" aria-hidden />
                </div>
                <Button asChild>
                  <a href="/login">
                    {t.signIn}
                    <ArrowRight className="size-4" aria-hidden />
                  </a>
                </Button>
              </div>
            )}

            {erro && (
              <p
                className="mt-5 max-w-lg rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {erro}
              </p>
            )}

            {ordem.includes(etapa) && (
              <div className="mt-8 flex max-w-lg items-center justify-between border-t pt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={voltar}
                  disabled={indice === 0 || pending}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  {t.back}
                </Button>
                {etapa === "review" ? (
                  <Button type="button" onClick={() => void concluir()} disabled={pending}>
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <ShieldCheck className="size-4" aria-hidden />
                    )}
                    {pending ? t.working : t.complete}
                  </Button>
                ) : (
                  <Button type="button" onClick={avancar}>
                    {t.continue}
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Campo({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Resumo({
  icon: Icone,
  titulo,
  linhas,
  cor,
}: {
  icon: typeof UserRound;
  titulo: string;
  linhas: string[];
  cor?: string;
}) {
  return (
    <div className="flex gap-4 py-5">
      <Icone className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium">{titulo}</p>
        {linhas.map((linha) => (
          <p key={linha} className="truncate text-sm text-muted-foreground">
            {linha}
          </p>
        ))}
        {cor && (
          <span
            className="mt-2 block size-5 rounded-sm border"
            style={{ backgroundColor: cor }}
            aria-label={cor}
          />
        )}
      </div>
    </div>
  );
}
