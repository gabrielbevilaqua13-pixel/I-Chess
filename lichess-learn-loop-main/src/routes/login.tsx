import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { initializeAuthConfig, isAuthConfigured, signIn, signUp, getSession, signOut } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta | Mestre Interior" },
      { name: "description", content: "Acesse sua conta e acompanhe sua evolução no xadrez." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [authConfigured, setAuthConfigured] = useState(false);

  useEffect(() => {
    initializeAuthConfig().then((configured) => {
      setAuthConfigured(configured && isAuthConfigured());
      if (configured) getSession().then((session) => { if (session) setMessage(`Você já está conectado como ${session.user.email ?? "jogador"}.`); });
    });
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const result = await signUp(email.trim(), password);
        if (result.access_token) {
          await navigate({ to: "/" });
        } else {
          setMessage("Cadastro recebido! Verifique seu e-mail para confirmar a conta e depois entre.");
          setMode("signin");
        }
      } else {
        await signIn(email.trim(), password);
        setMessage("Login realizado. Seu espaço de treinamento está pronto.");
        navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro inesperado.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await signOut();
    setMessage("Você saiu da sua conta.");
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-xl">
        <Link to="/" className="text-sm text-primary">← Voltar ao Mestre Interior</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.25em] text-primary">♞ Mestre Interior</p>
        <h1 className="mt-3 text-3xl font-bold">{mode === "signin" ? "Entre na sua conta" : "Crie sua conta"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Guarde suas análises e acompanhe sua evolução partida após partida.
        </p>

        {!authConfigured && (
          <div className="mt-6 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
            <b className="text-primary">Configuração necessária</b>
            <p className="mt-1 text-muted-foreground">
              O formulário está pronto, mas falta conectar o projeto Supabase e cadastrar as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no serviço de hospedagem.
            </p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 rounded-lg bg-muted p-1">
          <button type="button" onClick={() => { setMode("signin"); setError(""); setMessage(""); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "signin" ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}>Entrar</button>
          <button type="button" onClick={() => { setMode("signup"); setError(""); setMessage(""); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "signup" ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}>Criar conta</button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            E-mail
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" className="mt-2 w-full rounded-md border border-input bg-background px-3 py-3 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="block text-sm font-medium">
            Senha
            <input type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" className="mt-2 w-full rounded-md border border-input bg-background px-3 py-3 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <button disabled={busy || !authConfigured} className="w-full rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar minha conta"}
          </button>
        </form>

        {error && <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-md bg-primary/10 p-3 text-sm text-foreground">{message}</p>}
        <button type="button" onClick={logout} className="mt-4 text-xs text-muted-foreground underline">Sair desta conta neste dispositivo</button>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Seus dados de acesso são tratados pelo Supabase. Nunca compartilhe sua senha com ninguém.
        </p>
      </section>
    </main>
  );
}
