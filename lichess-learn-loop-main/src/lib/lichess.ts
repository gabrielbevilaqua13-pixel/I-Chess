import { Chess } from "chess.js";
export type LichessGame = {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  createdAt: number;
  status: string;
  winner?: "white" | "black" | undefined;
  moves: string;
  opening?: { name: string; eco: string } | undefined;
  players: {
    white: { user?: { name: string }; rating?: number; analysis?: { accuracy?: number | undefined } };
    black: { user?: { name: string }; rating?: number; analysis?: { accuracy?: number | undefined } };
  };
};

function parseNdjson(text: string): LichessGame[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

async function fetchLichessUser(username: string) {
  const r = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`);
  if (!r.ok) throw new Error("Usuário não encontrado no Lichess");
  return (await r.json()) as {
    id: string;
    username: string;
    perfs: Record<string, { rating: number; games: number }>;
    count?: { all: number; win: number; loss: number; draw: number };
  };
}

async function fetchLichessGames(username: string, max = 20): Promise<LichessGame[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&opening=true&accuracy=true&perfType=bullet,blitz,rapid,classical,correspondence`;
  const r = await fetch(url, { headers: { Accept: "application/x-ndjson" } });
  if (!r.ok) throw new Error("Não foi possível carregar as partidas");
  return parseNdjson(await r.text());
}

async function fetchLichessGame(id: string): Promise<LichessGame> {
  const r = await fetch(`https://lichess.org/game/export/${id}?opening=true&accuracy=true`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error("Partida não encontrada");
  return r.json();
}

export const SPEED_PT: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rápida",
  classical: "Clássica",
  correspondence: "Correspondência",
};

// ---- Chess.com support. Chess.com accounts are encoded as "name@chesscom".
export const CC_SUFFIX = "@chesscom";
export const isChessCom = (u: string) => u.toLowerCase().endsWith(CC_SUFFIX);
export const bareName = (u: string) => (isChessCom(u) ? u.slice(0, -CC_SUFFIX.length) : u).toLowerCase();
export const platformLabel = (u: string) => (isChessCom(u) ? "Chess.com" : "Lichess");

type CCGame = {
  url: string; uuid: string; pgn?: string; rules: string; time_class: string; rated: boolean; end_time: number;
  eco?: string; accuracies?: { white: number; black: number };
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
};

function ccToGame(g: CCGame): LichessGame | null {
  if (!g.pgn || g.rules !== "chess") return null;
  const c = new Chess();
  try { c.loadPgn(g.pgn); } catch { return null; }
  const moves = c.history().join(" ");
  if (!moves) return null;
  const openingName = g.eco?.split("/openings/")[1]?.replace(/-/g, " ");
  const winner = g.white.result === "win" ? "white" : g.black.result === "win" ? "black" : undefined;
  return {
    id: "cc" + g.uuid.replace(/-/g, ""),
    rated: g.rated, variant: "standard", speed: g.time_class === "daily" ? "correspondence" : g.time_class,
    createdAt: g.end_time * 1000, status: "", winner, moves,
    opening: openingName ? { name: openingName, eco: "" } : undefined,
    players: {
      white: { user: { name: g.white.username }, rating: g.white.rating, analysis: { accuracy: g.accuracies?.white } },
      black: { user: { name: g.black.username }, rating: g.black.rating, analysis: { accuracy: g.accuracies?.black } },
    },
  };
}

const recentGames = new Map<string, LichessGame>();
function cacheGames(games: LichessGame[]) {
  if (typeof window === "undefined") return;
  for (const game of games) recentGames.set(game.id, game);
  for (const id of recentGames.keys()) {
    if (recentGames.size <= 300) break;
    recentGames.delete(id);
  }
}

async function fetchCCUser(username: string) {
  const n = bareName(username);
  const [p, s] = await Promise.all([
    fetch(`https://api.chess.com/pub/player/${encodeURIComponent(n)}`),
    fetch(`https://api.chess.com/pub/player/${encodeURIComponent(n)}/stats`),
  ]);
  if (!p.ok) throw new Error("Usuário não encontrado no Chess.com");
  const pj = await p.json();
  const sj = s.ok ? await s.json() : {};
  const map: Record<string, string> = { bullet: "chess_bullet", blitz: "chess_blitz", rapid: "chess_rapid", classical: "chess_daily" };
  const perfs: Record<string, { rating: number; games: number }> = {};
  for (const [k, v] of Object.entries(map)) {
    const r = sj[v]?.last?.rating;
    if (r) perfs[k] = { rating: r, games: 0 };
  }
  return { id: n, username: `${pj.username ?? n} (Chess.com)`, perfs };
}

async function fetchCCGames(username: string, max: number): Promise<LichessGame[]> {
  const n = bareName(username);
  const a = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(n)}/games/archives`);
  if (!a.ok) throw new Error("Não foi possível carregar as partidas");
  const archives: string[] = (await a.json()).archives ?? [];
  const out: LichessGame[] = [];
  for (const url of archives.reverse()) {
    const r = await fetch(url);
    if (!r.ok) continue;
    const gs: CCGame[] = (await r.json()).games ?? [];
    for (const g of gs.reverse()) {
      const x = ccToGame(g);
      if (x) out.push(x);
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  cacheGames(out);
  return out;
}

export function fetchUser(username: string) {
  return isChessCom(username) ? fetchCCUser(username) : fetchLichessUser(username);
}
export function fetchGames(username: string, max = 20) {
  return isChessCom(username) ? fetchCCGames(username, max) : fetchLichessGames(username, max);
}
export async function fetchGame(id: string, user?: string): Promise<LichessGame> {
  if (!id.startsWith("cc")) return fetchLichessGame(id);
  const cached = recentGames.get(id);
  if (cached) return cached;
  if (user && isChessCom(user)) {
    const found = (await fetchCCGames(user, 100)).find((g) => g.id === id);
    if (found) return found;
  }
  throw new Error("Partida não encontrada");
}
