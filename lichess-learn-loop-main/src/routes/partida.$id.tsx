import { buildPuzzles, savePuzzles } from "@/lib/puzzles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { bareName, fetchGame } from "@/lib/lichess";
import { Engine } from "@/lib/engine";
import {
  analyzeGame,
  saveGameStats,
  summarize,
  THEME_ADVICE,
  avoidAdvice,
  THEME_LABEL,
  type AnalyzedMove,
  type ErrorTheme,
  type Judgment,
} from "@/lib/analysis";
import { Board } from "@/components/Board";

export const Route = createFileRoute("/partida/$id")({
  validateSearch: z.object({ user: z.string().optional() }),
  head: ({ params }) => ({
    meta: [
      { title: `Análise da partida ${params.id} | Mestre Interior` },
      { name: "description", content: "Análise lance a lance com Stockfish: precisão, erros e como evitá-los." },
      { property: "og:title", content: "Análise de partida | Mestre Interior" },
      { property: "og:description", content: "Precisão, erros e lições da sua partida." },
    ],
  }),
  component: GamePage,
});

const J_LABEL: Record<Judgment, string> = {
  best: "Melhor lance",
  good: "Bom",
  inaccuracy: "Imprecisão",
  mistake: "Erro",
  blunder: "Capivarada",
};
const J_CLASS: Record<Judgment, string> = {
  best: "text-best",
  good: "text-good",
  inaccuracy: "text-inaccuracy",
  mistake: "text-mistake",
  blunder: "text-blunder",
};
const J_SYM: Record<Judgment, string> = { best: "", good: "", inaccuracy: "?!", mistake: "?", blunder: "??" };

function fmtEval(cp: number) {
  if (Math.abs(cp) >= 9000) return cp > 0 ? "#+" : "#-";
  return (cp >= 0 ? "+" : "") + (cp / 100).toFixed(1);
}

function GamePage() {
  const { id } = Route.useParams();
  const { user } = Route.useSearch();
  const gameQ = useQuery({ queryKey: ["game", id], queryFn: () => fetchGame(id, user) });
  const [depth, setDepth] = useState(12);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [moves, setMoves] = useState<AnalyzedMove[] | null>(null);
  const [ply, setPly] = useState(0);
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [tries, setTries] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);


  const g = gameQ.data;
  const myColor: "w" | "b" =
    g && user && g.players.black.user?.name.toLowerCase() === bareName(user) ? "b" : "w";

  const run = async () => {
    if (!g) return;
    setRunning(true);
    setMoves(null);
    const engine = new Engine();
    try {
      const res = await analyzeGame(g.moves.split(" ").filter(Boolean), engine, depth, (d, t) => setProgress([d, t]));
      setMoves(res);
      setPly(0);
      if (user) {
        const themes: Partial<Record<ErrorTheme, number>> = {};
        res.filter((m) => m.color === myColor && m.theme).forEach((m) => (themes[m.theme!] = (themes[m.theme!] ?? 0) + 1));
        savePuzzles(user, buildPuzzles(res, myColor, id));
        saveGameStats(user, { id, accuracy: summarize(res, myColor).accuracy, themes, date: Date.now() });
      }
    } finally {
      engine.terminate();
      setRunning(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!moves) return;
      if (e.key === "ArrowRight") setPly((p) => Math.min(moves.length, p + 1));
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moves]);

  const current = moves && ply > 0 ? moves[ply - 1] : null;
  const isChallenge =
    !!current && current.color === myColor && !!current.bestUci &&
    (current.judgment === "inaccuracy" || current.judgment === "mistake" || current.judgment === "blunder") &&
    !revealed.has(current.ply);
  useEffect(() => { setTries(0); setFeedback(null); }, [ply]);
  const fen = isChallenge
    ? current!.fenBefore
    : current ? current.fenAfter : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const arrows: [string, string, string][] = [];
  if (!isChallenge && current && current.bestUci && current.judgment !== "best" && current.judgment !== "good")
    arrows.push([current.bestUci.slice(0, 2), current.bestUci.slice(2, 4), "rgba(80,200,120,0.85)"]);
  const reveal = (p: number) => setRevealed((r) => new Set(r).add(p));
  const onDrop = (from: string, to: string) => {
    if (!current?.bestUci) return false;
    if (from + to === current.bestUci.slice(0, 4)) {
      setFeedback({ ok: true, text: `Excelente! ${current.bestSan} era o melhor lance.` });
      reveal(current.ply);
      return true;
    }
    const n = tries + 1;
    setTries(n);
    setFeedback({
      ok: false,
      text: n === 1 ? "Não é esse. Tente de novo — procure ameaças e capturas." : "Ainda não. Veja a casa destacada: é a peça que deve se mover.",
    });
    return false;
  };


  const sumMe = useMemo(() => (moves ? summarize(moves, myColor) : null), [moves, myColor]);
  const sumOpp = useMemo(() => (moves ? summarize(moves, myColor === "w" ? "b" : "w") : null), [moves, myColor]);
  const myErrors = moves?.filter((m) => m.color === myColor && m.theme) ?? [];
  const myThemes = [...new Set(myErrors.map((m) => m.theme!))];

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {user ? (
        <Link to="/jogador/$username" params={{ username: user }} className="text-sm text-primary">← Minhas partidas</Link>
      ) : (
        <Link to="/" className="text-sm text-primary">← Início</Link>
      )}
      {gameQ.isLoading && <p className="mt-6 text-muted-foreground">Carregando partida…</p>}
      {gameQ.isError && <p className="mt-6 text-destructive">Partida não encontrada.</p>}
      {g && (
        <>
          <h1 className="mt-3 text-3xl font-bold">
            {g.players.white.user?.name ?? "?"} <span className="text-muted-foreground">vs</span> {g.players.black.user?.name ?? "?"}
          </h1>
          <p className="text-sm text-muted-foreground">{g.opening?.name}</p>

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,520px)_1fr]">
            <div>
              <Board
                fen={fen}
                orientation={myColor === "w" ? "white" : "black"}
                arrows={arrows}
                onDrop={isChallenge ? onDrop : undefined}
                highlight={isChallenge && tries >= 2 && current?.bestUci ? [current.bestUci.slice(0, 2)] : []}
              />
              {moves && (
                <div className="mt-3 flex justify-center gap-2">
                  {[["⏮", 0], ["◀", ply - 1], ["▶", ply + 1], ["⏭", moves.length]].map(([l, v]) => (
                    <button key={l as string} onClick={() => setPly(Math.max(0, Math.min(moves.length, v as number)))} className="rounded-md bg-secondary px-4 py-2 hover:bg-accent">
                      {l}
                    </button>
                  ))}
                </div>
              )}
              {feedback?.ok && !isChallenge && (
                <p className="mt-4 rounded-lg border border-border bg-card p-3 text-sm font-semibold text-[color:var(--best)]">✓ {feedback.text}</p>
              )}
              {isChallenge && current && (
                <div className="mt-4 rounded-lg border-2 border-primary bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Tente novamente</p>
                  <p className="mt-2">
                    Você jogou <b>{current.san}</b>{" "}
                    <span className={J_CLASS[current.judgment]}>({J_LABEL[current.judgment]})</span>. Consegue achar um lance melhor? Arraste a peça no tabuleiro.
                  </p>
                  {feedback && !feedback.ok && <p className="mt-2 text-sm text-[color:var(--mistake)]">{feedback.text}</p>}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => { setFeedback(null); reveal(current.ply); }} className="rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                      Mostrar resposta
                    </button>
                  </div>
                </div>
              )}
              {current && !isChallenge && (
                <div className="mt-4 rounded-lg border border-border bg-card p-4">

                  <p>
                    <b>{Math.ceil(current.ply / 2)}{current.color === "w" ? "." : "..."} {current.san}</b>{" "}
                    <span className={J_CLASS[current.judgment]}>{J_LABEL[current.judgment]}</span>{" "}
                    <span className="text-muted-foreground">· {fmtEval(current.evalAfter)} · precisão {current.accuracy.toFixed(0)}%</span>
                  </p>
                  {current.explanation?.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{["inaccuracy","mistake","blunder"].includes(current.judgment) ? "Por que este lance foi ruim?" : "Por que este lance?"}</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {current.explanation.map((t, i) => {
                          const [label, body] = t.includes("::") ? t.split("::") : [null, t];
                          return <li key={i}>{label && <b className="text-foreground">{label}: </b>}{body}</li>;
                        })}
                      </ul>
                    </div>
                  )}
                  {current.theme && <p className="mt-2 text-sm text-muted-foreground"><b className="text-primary">Como evitar:</b> {avoidAdvice(current)}</p>}
                </div>
              )}
            </div>

            <div>
              {!moves && (
                <div className="rounded-lg border border-border bg-card p-6">
                  <h2 className="text-2xl">Analisar com Stockfish</h2>
                  <p className="mt-2 text-sm text-muted-foreground">A análise roda no seu navegador. Profundidade maior = mais precisa, porém mais lenta.</p>
                  <label className="mt-4 block text-sm">
                    Profundidade: <b>{depth}</b>
                    <input type="range" min={8} max={18} value={depth} onChange={(e) => setDepth(+e.target.value)} disabled={running} className="mt-2 w-full accent-primary" />
                  </label>
                  <button onClick={run} disabled={running} className="mt-4 w-full rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-60">
                    {running ? `Analisando… ${progress ? Math.round((progress[0] / progress[1]) * 100) : 0}%` : "Iniciar análise"}
                  </button>
                  {running && progress && (
                    <div className="mt-3 h-2 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${(progress[0] / progress[1]) * 100}%` }} />
                    </div>
                  )}
                </div>
              )}

              {sumMe && sumOpp && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    {[["Você", sumMe], ["Adversário", sumOpp]].map(([label, s]) => {
                      const v = s as typeof sumMe;
                      return (
                        <div key={label as string} className="rounded-lg border border-border bg-card p-4">
                          <p className="text-sm text-muted-foreground">{label as string}</p>
                          <p className="font-display text-4xl text-primary">{v.accuracy.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">precisão</p>
                          <div className="mt-3 space-y-1 text-sm">
                            <p className="text-inaccuracy">Imprecisões: {v.inaccuracy}</p>
                            <p className="text-mistake">Erros: {v.mistake}</p>
                            <p className="text-blunder">Capivaradas: {v.blunder}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {myThemes.length > 0 && (
                    <div className="mt-4 rounded-lg border border-border bg-card p-5">
                      <h2 className="text-xl">Lições desta partida</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Recomendações geradas a partir dos lances identificados nesta análise.
                      </p>
                      <ul className="mt-3 space-y-4">
                        {myThemes.map((t) => {
                          const relatedErrors = myErrors.filter((m) => m.theme === t);
                          const example = relatedErrors[0]!;
                          return (
                            <li key={t} className="text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <b className="text-mistake">{THEME_LABEL[t]}</b>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {relatedErrors.length} {relatedErrors.length === 1 ? "ocorrência" : "ocorrências"}
                                </span>
                              </div>
                              <p className="mt-2 text-muted-foreground">
                                {avoidAdvice(example) ?? THEME_ADVICE[t]}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Exemplo observado: lance {Math.ceil(example.ply / 2)}{example.color === "w" ? "." : "..."} {example.san}.
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-card p-3">
                    <div className="grid grid-cols-[3rem_1fr_1fr] gap-1 text-sm">
                      {Array.from({ length: Math.ceil(moves!.length / 2) }).map((_, i) => (
                        <div key={i} className="contents">
                          <span className="py-1 text-muted-foreground">{i + 1}.</span>
                          {[moves![i * 2], moves![i * 2 + 1]].map((m) =>
                            m ? (
                              <button key={m.ply} onClick={() => setPly(m.ply)} className={`rounded px-2 py-1 text-left hover:bg-accent ${ply === m.ply ? "bg-accent" : ""}`}>
                                {m.san}
                                <span className={`ml-1 font-bold ${J_CLASS[m.judgment]}`}>{J_SYM[m.judgment]}</span>
                              </button>
                            ) : (
                              <span key="empty" />
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={run} className="mt-3 text-sm text-primary">Analisar novamente</button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
