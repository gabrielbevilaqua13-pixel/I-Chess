import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { bareName, fetchGames } from "@/lib/lichess";
import { Engine } from "@/lib/engine";
import { analyzeGame } from "@/lib/analysis";
import { buildPuzzles, difficultyLabel, loadPuzzles, loadSolved, markSolved, savePuzzles, type Puzzle } from "@/lib/puzzles";

export const Route = createFileRoute("/puzzles/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `Puzzles de ${params.username} | Mestre Interior` },
      { name: "description", content: "Puzzles criados pelo Stockfish a partir das suas partidas, em dificuldade crescente." },
      { property: "og:title", content: `Puzzles de ${params.username} | Mestre Interior` },
      { property: "og:description", content: "Treine táticas com os erros das suas próprias partidas." },
    ],
  }),
  component: PuzzlesPage,
});

function PuzzlesPage() {
  const { username } = Route.useParams();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [solved, setSolved] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [gen, setGen] = useState<string | null>(null);

  useEffect(() => {
    const ps = loadPuzzles(username);
    const s = loadSolved(username);
    setPuzzles(ps);
    setSolved(s);
    const first = ps.findIndex((p) => !s.includes(p.id));
    setIdx(first < 0 ? 0 : first);
  }, [username]);

  const generate = async () => {
    setGen("Baixando partidas do Lichess…");
    const engine = new Engine();
    try {
      const games = (await fetchGames(username, 8)).filter((g) => g.variant === "standard" && g.moves);
      for (let i = 0; i < games.length; i++) {
        const g = games[i]!;
        const color = g.players.white.user?.name.toLowerCase() === bareName(username) ? "w" : "b";
        const res = await analyzeGame(g.moves.split(" ").filter(Boolean), engine, 10, (d, t) =>
          setGen(`Partida ${i + 1}/${games.length} · posição ${d}/${t}`),
        );
        savePuzzles(username, buildPuzzles(res, color, g.id));
      }
      const ps = loadPuzzles(username);
      setPuzzles(ps);
      const first = ps.findIndex((p) => !solved.includes(p.id));
      setIdx(first < 0 ? 0 : first);
    } catch {
      setGen("Não foi possível gerar puzzles agora.");
      return;
    } finally {
      engine.terminate();
    }
    setGen(null);
  };

  const p = puzzles[idx];
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/jogador/$username" params={{ username }} className="text-sm text-primary">← Voltar às partidas</Link>
      <h1 className="mt-4 text-4xl font-bold">Puzzles de {username}</h1>
      <p className="mt-2 text-muted-foreground">
        Posições onde você errou, transformadas em exercícios pelo Stockfish — do mais fácil ao mais difícil.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button onClick={generate} disabled={!!gen} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {gen ? "Gerando…" : "Gerar puzzles das últimas partidas"}
        </button>
        {gen && <span className="text-sm text-muted-foreground">{gen}</span>}
        {puzzles.length > 0 && (
          <span className="text-sm text-muted-foreground">{solved.filter((s) => puzzles.some((x) => x.id === s)).length}/{puzzles.length} resolvidos</span>
        )}
      </div>

      {!p ? (
        <p className="mt-10 text-muted-foreground">Nenhum puzzle ainda. Gere puzzles acima ou analise uma partida.</p>
      ) : (
        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_300px]">
          <Solver
            key={p.id}
            puzzle={p}
            onSolved={() => { markSolved(username, p.id); setSolved(loadSolved(username)); }}
            onNext={() => setIdx((i) => Math.min(puzzles.length - 1, i + 1))}
            number={idx + 1}
          />
          <aside className="max-h-[560px] overflow-auto rounded-lg border border-border bg-card">
            {puzzles.map((q, i) => (
              <button key={q.id} onClick={() => setIdx(i)} className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-accent ${i === idx ? "bg-accent" : ""}`}>
                <span>#{i + 1} · {difficultyLabel(q.difficulty)}</span>
                <span className="text-xs text-muted-foreground">{solved.includes(q.id) ? "✓" : q.difficulty}</span>
              </button>
            ))}
          </aside>
        </div>
      )}
    </main>
  );
}

function Solver({ puzzle, onSolved, onNext, number }: { puzzle: Puzzle; onSolved: () => void; onNext: () => void; number: number }) {
  const [chess] = useState(() => new Chess(puzzle.fen));
  const [fen, setFen] = useState(puzzle.fen);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"play" | "wrong" | "done">("play");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const orientation = new Chess(puzzle.fen).turn() === "w" ? "white" : "black";

  const onDrop = (from: string, to: string) => {
    if (status === "done") return false;
    const expected = puzzle.solution[step]!;
    let mv;
    try {
      // The board callback does not expose a promotion picker; use the
      // promotion piece encoded in the solution (including underpromotions).
      mv = chess.move({ from, to, promotion: expected[4] ?? "q" });
    } catch {
      return false;
    }
    const uci = from + to + (mv.promotion ?? "");
    if (uci !== expected) {
      chess.undo();
      setStatus("wrong");
      return false;
    }
    setFen(chess.fen());
    setStatus("play");
    const next = step + 1;
    if (next >= puzzle.solution.length || chess.isCheckmate()) {
      setStep(next);
      setStatus("done");
      onSolved();
      return true;
    }
    setTimeout(() => {
      const r = puzzle.solution[next]!;
      chess.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] ?? "q" });
      setFen(chess.fen());
      setStep(next + 1);
    }, 400);
    return true;
  };

  const hint = () => {
    const u = puzzle.solution[step];
    if (!u) return;
    const piece = chess.get(u.slice(0, 2) as never);
    setStatus("wrong");
    alert(`Dica: mova a peça em ${u.slice(0, 2)}${piece ? "" : ""}.`);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl">Puzzle #{number} · <span className="text-primary">{difficultyLabel(puzzle.difficulty)}</span></h2>
        <span className="text-sm text-muted-foreground">{puzzle.theme}</span>
      </div>
      {mounted ? (
        <div className="overflow-hidden rounded-lg shadow-2xl ring-1 ring-border">
          <Chessboard
            position={fen}
            boardOrientation={orientation}
            onPieceDrop={onDrop}
            customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
            customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
            animationDuration={200}
          />
        </div>
      ) : <div className="aspect-square w-full rounded-lg bg-muted" />}
      <p className="mt-4 text-sm">
        {status === "play" && `Jogam as ${orientation === "white" ? "brancas" : "pretas"}. Encontre o melhor lance (na partida você jogou ${puzzle.playedSan}).`}
        {status === "wrong" && <span className="text-blunder">Não é esse. Tente de novo.</span>}
        {status === "done" && <span className="text-best">Resolvido! ✓</span>}
      </p>
      <div className="mt-3 flex gap-3">
        {status !== "done" && <button onClick={hint} className="rounded-md border border-border px-4 py-2 text-sm">Dica</button>}
        <button onClick={onNext} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Próximo →</button>
      </div>
    </div>
  );
}
