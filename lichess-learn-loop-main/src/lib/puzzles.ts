import { Chess } from "chess.js";
import type { AnalyzedMove } from "./analysis";
import { THEME_LABEL } from "./analysis";

export type Puzzle = {
  id: string;
  gameId: string;
  fen: string;
  solution: string[]; // UCI, alternating: player, reply, player...
  difficulty: number; // higher = harder
  theme: string;
  playedSan: string;
};

function applyUci(c: Chess, uci: string) {
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
}

export function buildPuzzles(moves: AnalyzedMove[], color: "w" | "b", gameId: string): Puzzle[] {
  const out: Puzzle[] = [];
  for (const m of moves) {
    if (m.color !== color || !["mistake", "blunder", "inaccuracy"].includes(m.judgment)) continue;
    if (!m.bestUci) continue;
    let pv = (m.bestPv.length && m.bestPv[0] === m.bestUci ? m.bestPv : [m.bestUci]).slice(0, 5);
    if (pv.length % 2 === 0) pv = pv.slice(0, -1);
    const c = new Chess(m.fenBefore);
    const valid: string[] = [];
    let checks = 0, captures = 0;
    try {
      for (const u of pv) {
        const mv = applyUci(c, u);
        if (valid.length % 2 === 0) {
          if (mv.san.includes("+")) checks++;
          if (mv.captured) captures++;
        }
        valid.push(u);
      }
    } catch { /* truncate at illegal */ }
    const sol = valid.length % 2 === 0 ? valid.slice(0, -1) : valid;
    if (!sol.length) continue;
    const userMoves = Math.ceil(sol.length / 2);
    const firstForcing = checks > 0 || captures > 0;
    const difficulty = Math.round(
      userMoves * 30 + (firstForcing ? 0 : 25) + Math.max(0, 40 - m.winDrop) / 2 + (m.judgment === "inaccuracy" ? 15 : 0),
    );
    out.push({
      id: `${gameId}-${m.ply}`,
      gameId,
      fen: m.fenBefore,
      solution: sol,
      difficulty,
      theme: m.theme ? THEME_LABEL[m.theme] : "Tática",
      playedSan: m.san,
    });
  }
  return out;
}

const key = (u: string) => `xadrez-coach-puzzles:${u.toLowerCase()}`;

export function loadPuzzles(user: string): Puzzle[] {
  try {
    return (JSON.parse(localStorage.getItem(key(user)) || "[]") as Puzzle[]).sort((a, b) => a.difficulty - b.difficulty);
  } catch {
    return [];
  }
}

export function savePuzzles(user: string, ps: Puzzle[]) {
  const map = new Map(loadPuzzles(user).map((p) => [p.id, p]));
  ps.forEach((p) => map.set(p.id, p));
  localStorage.setItem(key(user), JSON.stringify([...map.values()].slice(-300)));
}

const solvedKey = (u: string) => `xadrez-coach-solved:${u.toLowerCase()}`;
export function loadSolved(user: string): string[] {
  try { return JSON.parse(localStorage.getItem(solvedKey(user)) || "[]"); } catch { return []; }
}
export function markSolved(user: string, id: string) {
  const s = new Set(loadSolved(user)); s.add(id);
  localStorage.setItem(solvedKey(user), JSON.stringify([...s]));
}

export function difficultyLabel(d: number) {
  if (d < 50) return "Fácil";
  if (d < 80) return "Médio";
  if (d < 110) return "Difícil";
  return "Mestre";
}
