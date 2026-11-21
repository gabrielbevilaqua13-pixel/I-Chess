import { buildPuzzles, savePuzzles } from "@/lib/puzzles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { bareName, fetchGame } from "@/lib/lichess";
import { Engine, type EngineEval } from "@/lib/engine";
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
  ANALYSIS_PROFILES,
  type AnalysisLevel,
} from "@/lib/analysis";
import { Board } from "@/components/Board";
import { saveCloudStats } from "@/lib/cloud-stats";

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
  const [analysisLevel, setAnalysisLevel] = useState<AnalysisLevel>("standard");
  const [flipped, setFlipped] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [engineInfo, setEngineInfo] = useState<EngineEval | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisNotice, setAnalysisNotice] = useState("");
  const activeAnalysis = useRef<{ controller: AbortController; engine: Engine } | null>(null);
  const [moves, setMoves] = useState<AnalyzedMove[] | null>(null);
  const [ply, setPly] = useState(0);
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [tries, setTries] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);


  const g = gameQ.data;
  const myColor: "w" | "b" =
    g && user && g.players.black.user?.name.toLowerCase() === bareName(user) ? "b" : "w";

  const stopAnalysis = () => {
    const active = activeAnalysis.current;
    if (!active) return;
    active.controller.abort();
    active.engine.terminate();
  };

  useEffect(() => {
    return () => {
      activeAnalysis.current?.controller.abort();
      activeAnalysis.current?.engine.terminate();
      activeAnalysis.current = null;
    };
  }, []);

  const run = async () => {
    if (!g || activeAnalysis.current) return;
    const controller = new AbortController();
    const nodeLimit = ANALYSIS_PROFILES[analysisLevel].nodes;
    const sanMoves = g.moves.split(" ").filter(Boolean);
    setRunning(true);
    // Mantém o último resultado completo disponível até a nova análise terminar.
    setProgress([0, sanMoves.length + 1]);
    setEngineInfo(null);
    setAnalysisError("");
    setAnalysisNotice("");

    let engine: Engine | null = null;
    try {
      engine = new Engine();
      activeAnalysis.current = { controller, engine };
      const res = await analyzeGame(
        sanMoves,
        engine,
        nodeLimit,
        (done, total, info) => {
          if (controller.signal.aborted) return;
          setProgress([done, total]);
          if (info) setEngineInfo(info);
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setMoves(res);
      setPly(0);
      setRevealed(new Set());
      setFeedback(null);
      setTries(0);
      if (user) {
        const themes: Partial<Record<ErrorTheme, number>> = {};
        res.filter((m) => m.color === myColor && m.theme).forEach((m) => (themes[m.theme!] = (themes[m.theme!] ?? 0) + 1));
        savePuzzles(user, buildPuzzles(res, myColor, id));
        const storedGame = { id, accuracy: summarize(res, myColor).accuracy, themes, date: Date.now() };
        saveGameStats(user, storedGame);
        saveCloudStats(user, storedGame).catch((error) =>
          console.warn("A análise foi mantida neste dispositivo, mas não sincronizou com a nuvem.", error),
        );
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        setAnalysisNotice("Análise interrompida. Nenhum resultado parcial foi salvo; análises anteriores permanecem disponíveis.");
      } else {
        setAnalysisError(error instanceof Error ? error.message : "Não foi possível concluir a análise.");
      }
    } finally {
      engine?.terminate();
      if (activeAnalysis.current?.controller === controller) activeAnalysis.current = null;
      setRunning(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!moves || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPly((p) => Math.min(moves.length, p + 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPly((p) => Math.max(0, p - 1));
      }
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
  const reviewPlies = (moves ?? [])
    .filter((m) => m.color === myColor && ["inaccuracy", "mistake", "blunder"].includes(m.judgment))
    .map((m) => m.ply);
  const previousError = [...reviewPlies].reverse().find((movePly) => movePly < ply);
  const nextError = reviewPlies.find((movePly) => movePly > ply);
  const reviewMove = (movePly: number) => {
    setPly(movePly);
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const judgmentWeight: Record<Judgment, number> = {
    best: 0, good: 0, inaccuracy: 1, mistake: 2, blunder: 3,
  };
  const themeInsights = [...new Set(myErrors.map((m) => m.theme!))]
    .map((theme) => {
      const related = myErrors.filter((m) => m.theme === theme);
      const example = [...related].sort(
        (a, b) => judgmentWeight[b.judgment] - judgmentWeight[a.judgment] || b.winDrop - a.winDrop,
      )[0]!;
      return { theme, related, example, count: related.length };
    })
    .sort((a, b) => b.count - a.count || judgmentWeight[b.example.judgment] - judgmentWeight[a.example.judgment]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {user ? (
        <Link to="/jogador/$username" params={{ username: user }} className="text-sm text-primary">← Minhas partidas</Link>
      ) : (
        <Link to="/" className="text-sm text-primary">← Início</Link>
      )}
      {gameQ.isLoading && <p className="mt-6 text-muted-foreground">Carregando partida…</p>}
      {gameQ.isError && <p className="mt-6 text-destructive">Partida não encontrada.</p>}
      {g && (
        <>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
            {g.players.white.user?.name ?? "?"} <span className="text-muted-foreground">vs</span> {g.players.black.user?.name ?? "?"}
          </h1>
          <p className="text-sm text-muted-foreground">{g.opening?.name}</p>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr] lg:gap-8">
            <div ref={boardRef}>
              <Board
                fen={fen}
                orientation={(myColor === "w") !== flipped ? "white" : "black"}
                arrows={arrows}
                onDrop={isChallenge ? onDrop : undefined}
                highlight={isChallenge && tries >= 2 && current?.bestUci ? [current.bestUci.slice(0, 2)] : []}
              />
              {moves && (
                <>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2" aria-label="Navegação pela partida">
                    {([
                      ["⏮", 0, "Início da partida"],
                      ["◀", ply - 1, "Lance anterior"],
                      ["▶", ply + 1, "Próximo lance"],
                      ["⏭", moves.length, "Fim da partida"],
                    ] as const).map(([label, destination, description]) => (
                      <button
                        key={description}
                        type="button"
                        aria-label={description}
                        title={description}
                        disabled={destination < 0 || destination > moves.length || destination === ply}
                        onClick={() => setPly(destination)}
                        className="min-h-10 min-w-10 rounded-md bg-secondary px-3 py-2 transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFlipped((value) => !value)}
                      className="min-h-10 rounded-md border border-border px-3 py-2 text-sm transition hover:bg-accent"
                      aria-label="Virar tabuleiro"
                      title="Virar tabuleiro"
                    >
                      ↻ Virar
                    </button>
                  </div>
                  {reviewPlies.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={previousError === undefined}
                        onClick={() => previousError !== undefined && setPly(previousError)}
                        className="min-h-10 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ← Erro anterior
                      </button>
                      <span className="text-center text-xs text-muted-foreground" aria-live="polite">
                        {reviewPlies.length} {reviewPlies.length === 1 ? "lance para revisar" : "lances para revisar"}
                      </span>
                      <button
                        type="button"
                        disabled={nextError === undefined}
                        onClick={() => nextError !== undefined && setPly(nextError)}
                        className="min-h-10 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Próximo erro →
                      </button>
                    </div>
                  )}
                </>
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
              <div className="rounded-lg border border-border bg-card p-6">
                <h2 className="text-2xl">Analisar com Stockfish 19</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Análise realizada diretamente no seu navegador. O computador examina milhares de possibilidades para encontrar as melhores jogadas. O nível de análise pode variar conforme a complexidade da posição.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Intensidade da análise">
                  {(["quick", "standard", "deep"] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setAnalysisLevel(level)}
                      disabled={running}
                      aria-pressed={analysisLevel === level}
                      className={`rounded-md border px-2 py-2 text-sm font-semibold transition disabled:opacity-60 ${analysisLevel === level ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-accent"}`}
                    >
                      {ANALYSIS_PROFILES[level].label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {ANALYSIS_PROFILES[analysisLevel].description} Limite: {ANALYSIS_PROFILES[analysisLevel].nodes.toLocaleString("pt-BR")} nós por posição.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={run} disabled={running} className="min-h-11 flex-1 rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60">
                    {running ? `Analisando… ${progress ? Math.round((progress[0] / progress[1]) * 100) : 0}%` : moves ? "Reanalisar neste nível" : "Iniciar análise"}
                  </button>
                  {running && (
                    <button
                      type="button"
                      onClick={stopAnalysis}
                      className="min-h-11 rounded-md border border-border bg-background px-5 py-3 font-semibold transition hover:bg-accent"
                    >
                      Interromper análise
                    </button>
                  )}
                </div>
                {running && moves && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Você pode continuar consultando a última análise enquanto a nova é preparada.
                  </p>
                )}
                {running && progress && (
                  <div className="mt-3">
                    <div
                      className="h-2 overflow-hidden rounded bg-muted"
                      role="progressbar"
                      aria-label="Progresso da análise"
                      aria-valuemin={0}
                      aria-valuemax={progress[1]}
                      aria-valuenow={progress[0]}
                    >
                      <div className="h-full bg-primary transition-all" style={{ width: `${(progress[0] / progress[1]) * 100}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Posição {progress[0]} de {progress[1]}
                      {engineInfo ? ` · profundidade ${engineInfo.depth} · ${engineInfo.nodes.toLocaleString("pt-BR")} nós` : ""}
                    </p>
                  </div>
                )}
                {analysisNotice && <p role="status" className="mt-3 rounded-md border border-border bg-muted p-3 text-sm text-foreground">{analysisNotice}</p>}
                {analysisError && <p role="alert" className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{analysisError}</p>}
              </div>

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

                  {themeInsights.length > 0 && (
                    <>
                      <div className="mt-4 rounded-lg border border-primary/40 bg-card p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Diagnóstico desta partida</p>
                        <h2 className="mt-1 text-xl">Seu principal ponto de atenção</h2>
                        <p className="mt-2 text-sm">
                          <b>{THEME_LABEL[themeInsights[0]!.theme]}</b> — {themeInsights[0]!.count} {themeInsights[0]!.count === 1 ? "ocorrência identificada" : "ocorrências identificadas"}.
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {avoidAdvice(themeInsights[0]!.example) ?? THEME_ADVICE[themeInsights[0]!.theme]}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Exemplo mais relevante: lance {Math.ceil(themeInsights[0]!.example.ply / 2)}{themeInsights[0]!.example.color === "w" ? "." : "..."} {themeInsights[0]!.example.san} ({J_LABEL[themeInsights[0]!.example.judgment].toLowerCase()}).
                        </p>
                        <button type="button" onClick={() => reviewMove(themeInsights[0]!.example.ply)} className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-semibold text-primary hover:bg-accent">
                          Revisar este lance no tabuleiro
                        </button>
                      </div>
                      <div className="mt-4 rounded-lg border border-border bg-card p-5">
                        <h2 className="text-xl">Lições desta partida</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Categorias ordenadas pela frequência nesta partida. Para confirmar hábitos recorrentes, compare várias partidas.
                        </p>
                        <ul className="mt-3 space-y-4">
                          {themeInsights.map(({ theme, related, example, count }) => (
                            <li key={theme} className="text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <b className="text-mistake">{THEME_LABEL[theme]}</b>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {count} {count === 1 ? "ocorrência" : "ocorrências"}
                                </span>
                              </div>
                              <p className="mt-2 text-muted-foreground">
                                {avoidAdvice(example) ?? THEME_ADVICE[theme]}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Exemplo: lance {Math.ceil(example.ply / 2)}{example.color === "w" ? "." : "..."} {example.san}; {related.filter((m) => m.judgment === "blunder").length} capivarada(s), {related.filter((m) => m.judgment === "mistake").length} erro(s) e {related.filter((m) => m.judgment === "inaccuracy").length} imprecisão(ões).
                              </p>
                              <button type="button" onClick={() => reviewMove(example.ply)} className="mt-2 rounded-md border border-border px-3 py-2 font-semibold text-primary hover:bg-accent">Revisar lance</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}

                  <div className="mt-4 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-card p-3">
                    <div className="grid grid-cols-[3rem_1fr_1fr] gap-1 text-sm">
                      {Array.from({ length: Math.ceil(moves!.length / 2) }).map((_, i) => (
                        <div key={i} className="contents">
                          <span className="py-1 text-muted-foreground">{i + 1}.</span>
                          {[moves![i * 2], moves![i * 2 + 1]].map((m) =>
                            m ? (
                              <button key={m.ply} type="button" onClick={() => reviewMove(m.ply)} aria-current={ply === m.ply ? "step" : undefined} aria-label={`${Math.ceil(m.ply / 2)}${m.color === "w" ? "." : "..."} ${m.san}: ${J_LABEL[m.judgment]}`} className={`min-h-9 rounded px-2 py-1 text-left hover:bg-accent ${ply === m.ply ? "bg-accent" : ""}`}>
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

                </>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
