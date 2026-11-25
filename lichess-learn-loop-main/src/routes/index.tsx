import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { rememberProfile, signOut } from "@/lib/auth";
import { useSession } from "@/lib/session-context";
import { fetchUser } from "@/lib/lichess";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { modo?: "perfil" } =>
    search["modo"] === "perfil" ? { modo: "perfil" } : {},
  head: () => ({
    meta: [
      { title: "Mestre Interior — aprenda xadrez com suas partidas do Lichess e Chess.com" },
      { name: "description", content: "Conecte sua conta Lichess, analise suas partidas com Stockfish e descubra seus erros recorrentes." },
      { property: "og:title", content: "Mestre Interior — seu treinador de xadrez" },
      { property: "og:description", content: "Precisão, erros e lições personalizadas a partir das suas próprias partidas." },
    ],
  }),
  component: Index,
});

function Index() {
  const [user, setUser] = useState("");
  const [platform, setPlatform] = useState<"lichess" | "chesscom">("lichess");
  const session = useSession();
  const navigate = useNavigate();
  const { modo } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const profile = session?.user.user_metadata?.["chess_profile"];
  useEffect(() => {
    if (!modo && typeof profile === "string" && profile)
      void navigate({ to: "/jogador/$username", params: { username: profile }, replace: true });
  }, [profile, modo, navigate]);

  const go = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = user.trim();
    if (busy || !name) return;
    const username = platform === "chesscom" ? name + "@chesscom" : name;
    setBusy(true);
    setError("");
    try {
      await fetchUser(username);
      if (session) await rememberProfile(username, session.user.id);
      await navigate({ to: "/jogador/$username", params: { username } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir esse perfil.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm uppercase tracking-[0.3em] text-primary">♞ Mestre Interior</p>
        {session ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Conta conectada{session.user.email ? `: ${session.user.email}` : ""}
            </span>
            <button
              type="button"
              onClick={async () => { await signOut(); await navigate({ to: "/" }); }}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold transition hover:bg-accent"
            >
              Sair
            </button>
          </div>
        ) : null}
      </div>
      {session || modo ? <>
        <h1 className="text-4xl font-bold">Qual perfil você quer analisar?</h1>
        {!session && <p className="mt-3 text-muted-foreground">Modo visitante. Ao sair da partida ou recarregar a página, a análise será descartada.</p>}
        <div className="mt-10 inline-flex w-fit rounded-md border border-border bg-card p-1">
          {([["lichess", "Lichess"], ["chesscom", "Chess.com"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPlatform(k)}
              className={`rounded px-4 py-2 text-sm font-semibold transition ${platform === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
        <form onSubmit={go} className="mt-3 flex max-w-lg flex-col gap-3 sm:flex-row">
          <input
            required aria-label="Nome de usuário na plataforma" autoComplete="off"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder={platform === "chesscom" ? "Seu usuário no Chess.com" : "Seu usuário no Lichess"}
            className="flex-1 rounded-md border border-input bg-card px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <button disabled={busy} className="rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:opacity-90">
            {busy ? "Buscando perfil…" : "Ver partidas"}
          </button>
        </form>
        {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
      </> : <>
        <h1 className="max-w-3xl text-5xl font-bold leading-tight md:text-7xl">Seu melhor professor são <em className="text-primary">suas próprias partidas.</em></h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">Analise suas partidas do Lichess ou do Chess.com com o Stockfish e treine a partir dos seus erros.</p>
        <Link to="/login" className="mt-8 w-fit rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground">Entrar ou criar conta</Link>
        <Link to="/" search={{ modo: "perfil" }} className="mt-5 w-fit text-sm underline">Experimentar sem conta</Link>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">Você pode analisar uma partida sem criar conta. Para salvar a análise e continuar depois, entre na sua conta.</p>
      </>}
      <div className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          ["Precisão", "Porcentagem de acerto por partida, no mesmo padrão usado pelo Lichess."],
          ["Erros", "Imprecisões, erros e capivaradas, com o lance que o Stockfish recomendava."],
          ["Lições", "Padrões recorrentes nas suas partidas e conselhos práticos para corrigi-los."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-lg border border-border bg-card/60 p-5">
            <h3 className="text-xl text-primary">{t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
