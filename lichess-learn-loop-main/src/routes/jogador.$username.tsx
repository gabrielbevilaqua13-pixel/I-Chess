import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { bareName, fetchGames, fetchUser, SPEED_PT } from "@/lib/lichess";
import { loadStats, THEME_ADVICE, THEME_LABEL, type ErrorTheme, type StoredGame } from "@/lib/analysis";

export const Route = createFileRoute("/jogador/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.username} — partidas e padrões | Mestre Interior` },
      { name: "description", content: `Partidas recentes de ${params.username} no Lichess, prontas para análise com Stockfish.` },
      { property: "og:title", content: `${params.username} | Mestre Interior` },
      { property: "og:description", content: "Escolha uma partida e aprenda com seus erros." },
    ],
  }),
  component: Player,
});

function Player() {
  const { username } = Route.useParams();
  const userQ = useQuery({ queryKey: ["user", username], queryFn: () => fetchUser(username) });
  const gamesQ = useQuery({ queryKey: ["games", username], queryFn: () => fetchGames(username) });
  const [stats, setStats] = useState<StoredGame[]>([]);
  useEffect(() => setStats(loadStats(username)), [username]);

  const orderedStats = [...stats].sort((a, b) => b.date - a.date);
  const recentStats = orderedStats.slice(0, 5);
  const previousStats = orderedStats.slice(5, 10);
  const average = (items: StoredGame[]) =>
    items.length ? items.reduce((sum, game) => sum + game.accuracy, 0) / items.length : null;
  const recentAvg = average(recentStats);
  const previousAvg = average(previousStats);
  const accuracyDelta = recentAvg !== null && previousAvg !== null ? recentAvg - previousAvg : null;

  const themeTotals: Partial<Record<ErrorTheme, number>> = {};
  const themeGames: Partial<Record<ErrorTheme, number>> = {};
  orderedStats.forEach((game) => {
    Object.entries(game.themes).forEach(([key, value]) => {
      const theme = key as ErrorTheme;
      themeTotals[theme] = (themeTotals[theme] ?? 0) + (value ?? 0);
      if ((value ?? 0) > 0) themeGames[theme] = (themeGames[theme] ?? 0) + 1;
    });
  });
  const topThemes = Object.entries(themeTotals)
    .sort((a, b) => (themeGames[b[0] as ErrorTheme] ?? 0) - (themeGames[a[0] as ErrorTheme] ?? 0) || b[1] - a[1])
    .slice(0, 3) as [ErrorTheme, number][];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex justify-between"><Link to="/" className="text-sm text-primary">← Trocar conta</Link><Link to="/puzzles/$username" params={{ username }} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">♞ Puzzles</Link></div>
      {userQ.isError ? (
        <p className="mt-10 text-destructive">Usuário não encontrado.</p>
      ) : (
        <>
          <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <h1 className="text-4xl font-bold">{userQ.data?.username ?? username}</h1>
            <div className="flex gap-4 text-sm text-muted-foreground">
              {userQ.data &&
                ["bullet", "blitz", "rapid", "classical"].map((p) =>
                  userQ.data.perfs[p] ? (
                    <span key={p}>
                      {SPEED_PT[p]} <b className="text-foreground">{userQ.data.perfs[p].rating}</b>
                    </span>
                  ) : null,
                )}
            </div>
          </header>

          {stats.length > 0 && (
            <>
              <section className="mt-8 rounded-lg border border-border bg-card p-6">
                <h2 className="text-2xl">Sua evolução</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Comparação das até 5 análises mais recentes com as 5 anteriores.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-md bg-muted p-4">
                    <p className="text-sm text-muted-foreground">Últimas partidas</p>
                    <p className="mt-1 text-3xl font-semibold text-primary">
                      {recentAvg !== null ? `${recentAvg.toFixed(1)}%` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{recentStats.length} analisada(s)</p>
                  </div>
                  <div className="rounded-md bg-muted p-4">
                    <p className="text-sm text-muted-foreground">Período anterior</p>
                    <p className="mt-1 text-3xl font-semibold">
                      {previousAvg !== null ? `${previousAvg.toFixed(1)}%` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{previousStats.length} analisada(s)</p>
                  </div>
                  <div className="rounded-md bg-muted p-4">
                    <p className="text-sm text-muted-foreground">Variação</p>
                    <p className={`mt-1 text-3xl font-semibold ${accuracyDelta === null ? "text-muted-foreground" : accuracyDelta >= 0 ? "text-best" : "text-blunder"}`}>
                      {accuracyDelta === null ? "—" : `${accuracyDelta > 0 ? "+" : ""}${accuracyDelta.toFixed(1)} p.p.`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {accuracyDelta === null ? "Analise mais partidas para comparar" : accuracyDelta >= 0 ? "Evolução na precisão média" : "Queda na precisão média"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  A precisão é uma estimativa do Stockfish e pode variar conforme a profundidade da análise. A comparação só aparece quando há dois períodos.
                </p>
              </section>

              <section className="mt-8 rounded-lg border border-border bg-card p-6">
              <h2 className="text-2xl">Seus padrões</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Com base em {stats.length} partida(s) analisada(s). Os temas abaixo indicam em quantas partidas cada dificuldade apareceu.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {topThemes.map(([t, n]) => (
                  <div key={t} className="rounded-md bg-muted p-4">
                    <p className="font-semibold text-mistake">{THEME_LABEL[t]}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {themeGames[t] ?? 0} de {stats.length} partidas · {n} ocorrência(s)
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{THEME_ADVICE[t]}</p>
                  </div>
                ))}
              </div>
              </section>
            </>
          )}

          <h2 className="mt-10 text-2xl">Partidas recentes</h2>
          {gamesQ.isLoading && <p className="mt-4 text-muted-foreground">Carregando partidas do Lichess…</p>}
          {gamesQ.isError && <p className="mt-4 text-destructive">Não foi possível carregar as partidas.</p>}
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {gamesQ.data?.map((g) => {
              const isWhite = g.players.white.user?.name.toLowerCase() === bareName(username);
              const opp = isWhite ? g.players.black : g.players.white;
              const res = !g.winner ? "½" : (g.winner === "white") === isWhite ? "Vitória" : "Derrota";
              const analyzed = stats.find((s) => s.id === g.id);
              return (
                <li key={g.id}>
                  <Link
                    to="/partida/$id"
                    params={{ id: g.id }}
                    search={{ user: username }}
                    className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-accent"
                  >
                    <span className={`w-16 text-sm font-semibold ${res === "Vitória" ? "text-best" : res === "Derrota" ? "text-blunder" : "text-muted-foreground"}`}>{res}</span>
                    <span className="text-lg">{isWhite ? "♔" : "♚"}</span>
                    <span className="flex-1">
                      vs <b>{opp.user?.name ?? "Anônimo"}</b> <span className="text-muted-foreground">({opp.rating ?? "?"})</span>
                      <span className="block text-xs text-muted-foreground">{g.opening?.name ?? ""}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{SPEED_PT[g.speed] ?? g.speed} · {new Date(g.createdAt).toLocaleDateString("pt-BR")}</span>
                    {analyzed && <span className="rounded bg-primary/15 px-2 py-1 text-xs text-primary">{analyzed.accuracy.toFixed(0)}%</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
