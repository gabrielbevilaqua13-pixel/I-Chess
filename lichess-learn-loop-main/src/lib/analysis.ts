import { Chess, type Move } from "chess.js";
import type { Engine, EngineEval } from "./engine";

export type Judgment = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export type AnalyzedMove = {
  ply: number;
  san: string;
  uci: string;
  color: "w" | "b";
  fenBefore: string;
  fenAfter: string;
  evalBefore: number; // white POV, centipawns (mate mapped)
  evalAfter: number;
  bestUci: string | null;
  bestSan: string | null;
  bestPv: string[];
  accuracy: number;
  winDrop: number;
  judgment: Judgment;
  theme: ErrorTheme | null;
  tip: string | null;
  explanation: string[];
};

export type ErrorTheme =
  | "peca-pendurada"
  | "captura-perdida"
  | "mate-perdido"
  | "mate-permitido"
  | "abertura"
  | "final"
  | "posicional";

export const THEME_LABEL: Record<ErrorTheme, string> = {
  "peca-pendurada": "Peça deixada desprotegida",
  "captura-perdida": "Captura vantajosa ignorada",
  "mate-perdido": "Mate não aproveitado",
  "mate-permitido": "Permitiu ataque de mate",
  abertura: "Imprecisão na abertura",
  final: "Técnica de final",
  posicional: "Erro posicional",
};

export const THEME_ADVICE: Record<ErrorTheme, string> = {
  "peca-pendurada":
    "Antes de soltar a peça, faça o 'checklist do blunder': quais peças minhas ficam sem defesa depois desse lance? Quais xeques, capturas e ameaças meu adversário terá?",
  "captura-perdida":
    "A cada lance do adversário, pergunte: o que ele deixou desprotegido? Procure sempre primeiro xeques, capturas e ameaças (nesta ordem) antes de pensar em planos.",
  "mate-perdido":
    "Quando o rei adversário estiver exposto, calcule todos os xeques forçados. Pratique exercícios de 'mate em 2' e 'mate em 3' diariamente.",
  "mate-permitido":
    "Mantenha defensores perto do seu rei e evite abrir a estrutura de peões do roque sem necessidade. Sempre verifique se o adversário tem xeques perigosos.",
  abertura:
    "Na abertura: desenvolva cavalos e bispos, controle o centro, roque cedo e evite mover a mesma peça duas vezes ou sair cedo com a dama.",
  final:
    "Nos finais, ative o rei, crie peões passados e calcule com cuidado — cada tempo conta. Estude finais básicos de torre e de peões.",
  posicional:
    "Compare o lance jogado com o sugerido: busque melhorar a pior peça, controlar casas centrais e evitar fraquezas permanentes na estrutura de peões.",
};

const MATE_CP = 10000;

export function toCp(e: EngineEval): number {
  if (e.mate !== null) return e.mate > 0 ? MATE_CP - e.mate * 10 : -MATE_CP - e.mate * 10;
  return e.cp ?? 0;
}

export function winPct(cp: number) {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

export function moveAccuracy(wpBefore: number, wpAfter: number) {
  const a = 103.1668 * Math.exp(-0.04354 * (wpBefore - wpAfter)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

function uciToMove(fen: string, uci: string): Move | null {
  try {
    const c = new Chess(fen);
    return c.move(uci[4] ? { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] } : { from: uci.slice(0, 2), to: uci.slice(2, 4) });
  } catch {
    return null;
  }
}

function countMaterial(fen: string) {
  const board = fen.split(" ")[0] ?? "";
  let n = 0;
  for (const ch of board) if ("qrbnQRBN".includes(ch)) n++;
  return n;
}

function classify(drop: number): Judgment {
  if (drop >= 30) return "blunder";
  if (drop >= 20) return "mistake";
  if (drop >= 10) return "inaccuracy";
  if (drop >= 3) return "good";
  return "best";
}

export async function analyzeGame(
  sanMoves: string[],
  engine: Engine,
  depth: number,
  onProgress: (done: number, total: number) => void,
): Promise<AnalyzedMove[]> {
  const chess = new Chess();
  const fens: string[] = [chess.fen()];
  const moves: Move[] = [];
  for (const san of sanMoves) {
    const m = chess.move(san);
    moves.push(m);
    fens.push(chess.fen());
  }

  // Evaluate every position (white POV)
  const evals: { cp: number; best: string | null; pv: string[]; mate: number | null }[] = [];
  for (let i = 0; i < fens.length; i++) {
    const c = new Chess(fens[i]!);
    let cp: number;
    let best: string | null = null;
    let pv: string[] = [];
    let mate: number | null = null;
    if (c.isCheckmate()) cp = c.turn() === "w" ? -MATE_CP : MATE_CP;
    else if (c.isDraw() || c.isStalemate()) cp = 0;
    else {
      const e = await engine.evaluate(fens[i]!, depth);
      const stm = toCp(e);
      cp = c.turn() === "w" ? stm : -stm;
      best = e.best;
      pv = e.pv;
      mate = e.mate === null ? null : c.turn() === "w" ? e.mate : -e.mate;
    }
    evals.push({ cp, best, pv, mate });
    onProgress(i + 1, fens.length);
  }

  return moves.map((m, i) => {
    const color = m.color;
    const sign = color === "w" ? 1 : -1;
    const before = evals[i]!;
    const after = evals[i + 1]!;
    const wpB = winPct(sign * before.cp);
    const wpA = winPct(sign * after.cp);
    const drop = Math.max(0, wpB - wpA);
    const uci = m.from + m.to + (m.promotion ?? "");
    const isBest = before.best === uci;
    let judgment = isBest ? "best" : classify(drop);
    // Missing a forced mate is always at least a mistake
    const hadMate = before.mate !== null && sign * before.mate > 0;
    const stillMate = after.mate !== null && sign * after.mate > 0;
    if (!isBest && hadMate && !stillMate && judgment !== "blunder") judgment = "mistake";
    const bestMove = before.best ? uciToMove(fens[i]!, before.best) : null;

    let theme: ErrorTheme | null = null;
    if (judgment === "inaccuracy" || judgment === "mistake" || judgment === "blunder") {
      const replyMove = after.best ? uciToMove(fens[i + 1]!, after.best) : null;
      const allowsMate = after.mate !== null && sign * after.mate < 0;
      const hangingAfter = hangingPieces(fens[i + 1]!, color);
      const replyCapturesHangingPiece =
        !!replyMove?.captured &&
        (replyMove.to === m.to ||
          hangingAfter.some((piece) => piece.sq === replyMove.to && piece.type === replyMove.captured));

      if (hadMate && !stillMate) theme = "mate-perdido";
      else if (allowsMate) theme = "mate-permitido";
      else if (replyCapturesHangingPiece) theme = "peca-pendurada";
      else if (bestMove?.captured && !m.captured) theme = "captura-perdida";
      else if (i < 20) theme = "abertura";
      else if (countMaterial(fens[i + 1]!) <= 6) theme = "final";
      else theme = "posicional";
    }

    let tip: string | null = null;
    if (theme) {
      const reply = after.best ? uciToMove(fens[i + 1]!, after.best) : null;
      const parts: string[] = [];
      if (bestMove) parts.push(`O Stockfish preferia ${bestMove.san}.`);
      if (theme === "peca-pendurada" && reply) parts.push(`Depois de ${m.san}, o adversário responde ${reply.san} e ganha material.`);
      if (theme === "captura-perdida" && bestMove) parts.push(`Havia uma captura vantajosa disponível: ${bestMove.san}.`);
      if (theme === "mate-perdido") parts.push("Você tinha uma sequência de mate forçado.");
      if (theme === "mate-permitido" && reply) parts.push(`Agora o adversário tem mate forçado começando com ${reply.san}.`);
      tip = parts.join(" ");
    }

    const explanation = explain({
      m, fenBefore: fens[i]!, fenAfter: fens[i + 1]!, bestMove, bestPv: before.pv, replyPv: after.pv,
      sign, cpBefore: before.cp, cpAfter: after.cp, drop, judgment: judgment as Judgment, isBest,
      hadMate, stillMate, allowsMate: after.mate !== null && sign * after.mate < 0,
      mateIn: before.mate, oppMateIn: after.mate,
    });

    return {
      ply: i + 1,
      san: m.san,
      uci,
      color,
      fenBefore: fens[i]!,
      fenAfter: fens[i + 1]!,
      evalBefore: before.cp,
      evalAfter: after.cp,
      bestUci: before.best,
      bestSan: bestMove?.san ?? null,
      bestPv: before.pv,
      accuracy: moveAccuracy(wpB, wpA),
      winDrop: drop,
      judgment: judgment as Judgment,
      theme,
      tip,
      explanation,
    };
  });
}

// ---------- Detailed explanations ----------
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<string, string> = { p: "peão", n: "cavalo", b: "bispo", r: "torre", q: "dama", k: "rei" };

function materialDiff(fen: string, sign: number) {
  let w = 0, b = 0;
  for (const ch of fen.split(" ")[0] ?? "") {
    const l = ch.toLowerCase();
    if (VAL[l] === undefined) continue;
    if (ch === l) b += VAL[l]!; else w += VAL[l]!;
  }
  return sign * (w - b);
}

function playLine(fen: string, uci: string[], n: number) {
  const c = new Chess(fen);
  const san: string[] = [];
  for (const u of uci.slice(0, n)) {
    try {
      const mv = c.move(u[4] ? { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] } : { from: u.slice(0, 2), to: u.slice(2, 4) });
      san.push(mv.san);
    } catch { break; }
  }
  return { san, fen: c.fen() };
}

const COLOR_NAME = (c: "w" | "b") => (c === "w" ? "Brancas" : "Pretas");
const art = (p: string) => (p === "q" || p === "r" ? "a" : "o");

function centerish(sq: string) {
  return ["c3","d3","e3","f3","c4","d4","e4","f4","c5","d5","e5","f5","c6","d6","e6","f6"].includes(sq);
}

/** Pieces of `color` attacked and not defended (or attacked by a cheaper piece) in fen. */
function hangingPieces(fen: string, color: "w" | "b") {
  const c = new Chess(fen);
  const opp = color === "w" ? "b" : "w";
  const out: { sq: string; type: string }[] = [];
  for (const row of c.board()) for (const p of row) {
    if (!p || p.color !== color || p.type === "k") continue;
    const attackers = c.attackers(p.square, opp);
    if (!attackers.length) continue;
    const defenders = c.attackers(p.square, color);
    const cheapest = Math.min(...attackers.map((s) => VAL[c.get(s)!.type]!));
    if (!defenders.length || cheapest < VAL[p.type]!) out.push({ sq: p.square, type: p.type });
  }
  return out;
}

/** Human reason why a move is good (purpose, not notation). */
function purpose(mv: Move, fenBefore: string): string {
  if (mv.san.includes("#")) return "dá xeque-mate imediato";
  if (mv.san.startsWith("O-O")) return "coloca o rei em segurança e conecta as torres";
  if (mv.promotion) return `promove o peão a ${NAME[mv.promotion]}, ganhando material decisivo`;
  if (mv.captured) {
    const gain = VAL[mv.captured]! - VAL[mv.piece]!;
    const before = new Chess(fenBefore);
    const defended = before.attackers(mv.to, mv.color === "w" ? "b" : "w").length > 0;
    if (!defended) return `ganha ${art(mv.captured)} ${NAME[mv.captured]} de graça`;
    if (gain > 0) return `vence a troca, entregando ${NAME[mv.piece]} por ${NAME[mv.captured]}`;
    return `simplifica a posição trocando peças`;
  }
  const reasons: string[] = [];
  const hangBefore = hangingPieces(fenBefore, mv.color);
  const after = new Chess(fenBefore); after.move(mv.san);
  const hangAfter = hangingPieces(after.fen(), mv.color);
  if (hangBefore.length > hangAfter.length) {
    const saved = hangBefore.find((h) => !hangAfter.some((x) => x.sq === h.sq));
    if (saved) reasons.push(saved.sq === mv.from ? `tira ${art(saved.type)} ${NAME[saved.type]} do ataque` : `defende ${art(saved.type)} ${NAME[saved.type]} em ${saved.sq}`);
  }
  if (mv.san.includes("+")) reasons.push("dá xeque e toma a iniciativa");
  const oppHang = hangingPieces(after.fen(), mv.color === "w" ? "b" : "w");
  if (oppHang.length) reasons.push(`cria uma ameaça contra ${art(oppHang[0]!.type)} ${NAME[oppHang[0]!.type]} em ${oppHang[0]!.sq}`);
  const home = mv.color === "w" ? "1" : "8";
  if ((mv.piece === "n" || mv.piece === "b") && mv.from[1] === home) reasons.push("desenvolve uma peça menor");
  if (mv.piece === "p" && ["d4","e4","d5","e5","c4","c5"].includes(mv.to)) reasons.push("disputa o centro com peões");
  else if (mv.piece !== "p" && centerish(mv.to) && !centerish(mv.from)) reasons.push(`centraliza ${art(mv.piece)} ${NAME[mv.piece]}`);
  if (mv.piece === "k" && countMaterial(fenBefore) <= 6) reasons.push("ativa o rei para o final");
  if (!reasons.length) reasons.push("mantém a posição sólida e sem fraquezas");
  return reasons.slice(0, 2).join(" e ");
}

function explain(a: {
  m: Move; fenBefore: string; fenAfter: string; bestMove: Move | null; bestPv: string[]; replyPv: string[];
  sign: number; cpBefore: number; cpAfter: number; drop: number; judgment: Judgment; isBest: boolean;
  hadMate: boolean; stillMate: boolean; allowsMate: boolean; mateIn: number | null; oppMateIn: number | null;
}): string[] {
  const out: string[] = [];
  const me = a.m.color;
  const opp = me === "w" ? "b" : "w";
  // Absolute (White POV) eval, same convention as the header.
  const abs = (cp: number) => {
    if (Math.abs(cp) >= 9000) return `mate para as ${cp > 0 ? "Brancas" : "Pretas"}`;
    const v = cp / 100;
    if (Math.abs(v) < 0.3) return `${v >= 0 ? "+" : ""}${v.toFixed(1)} (equilibrado)`;
    return `${v >= 0 ? "+" : ""}${v.toFixed(1)} a favor das ${v > 0 ? "Brancas" : "Pretas"}`;
  };

  if (a.isBest || !a.bestMove || a.judgment === "best" || a.judgment === "good") {
    out.push(`Por que é bom::${a.m.san} ${purpose(a.m, a.fenBefore)}.${a.isBest ? " É exatamente a escolha do Stockfish." : ""}`);
    const cont = playLine(a.fenAfter, a.replyPv, 4).san;
    if (cont.length) out.push(`Continuação esperada::${cont.join(" ")}.`);
    out.push(`Avaliação::${abs(a.cpAfter)}.`);
    return out;
  }

  // 1. O erro
  const replyLine = playLine(a.fenAfter, a.replyPv, 5);
  const reply = a.replyPv[0] ? uciToMove(a.fenAfter, a.replyPv[0]) : null;
  const hangNow = hangingPieces(a.fenAfter, me);
  let erro: string;
  if (a.allowsMate) erro = `este lance deixa seu rei vulnerável — o adversário passa a ter mate forçado em ${Math.abs(a.oppMateIn ?? 0)}.`;
  else if (a.hadMate && !a.stillMate) erro = `você tinha mate forçado em ${Math.abs(a.mateIn ?? 0)} e deixou o adversário escapar.`;
  else if (reply?.captured) {
    const lost = reply.captured;
    erro = reply.to === a.m.to
      ? `${art(a.m.piece) === "a" ? "a" : "o"} ${NAME[a.m.piece]} foi para uma casa onde pode ser capturad${art(a.m.piece)}.`
      : `${art(lost) === "a" ? "a" : "o"} ${NAME[lost]} em ${reply.to} ficou desprotegid${art(lost)}.`;
  } else if (hangNow.length) erro = `${art(hangNow[0]!.type)} ${NAME[hangNow[0]!.type]} em ${hangNow[0]!.sq} fica sem defesa suficiente.`;
  else if (a.bestMove.captured && !a.m.captured) erro = `você ignorou a chance de capturar ${art(a.bestMove.captured)} ${NAME[a.bestMove.captured]} em ${a.bestMove.to}.`;
  else if (reply?.san.includes("+")) erro = `o lance permite um xeque forte (${reply.san}) que entrega a iniciativa ao adversário.`;
  else erro = `o lance não resolve os problemas da posição e permite que o adversário melhore suas peças com ganho de tempo.`;
  out.push(`O erro::${erro.charAt(0).toUpperCase()}${erro.slice(1)}`);

  // 2. A punição
  if (reply) {
    const matAfterLine = materialDiff(replyLine.fen, a.sign) - materialDiff(a.fenAfter, a.sign);
    let punish = `As ${COLOR_NAME(opp)} respondem ${reply.san}`;
    if (reply.captured) punish += `, capturando ${art(reply.captured)} ${NAME[reply.captured]}`;
    const checks = replyLine.san.filter((s, i) => i % 2 === 0 && s.includes("+")).length;
    if (a.allowsMate) punish += " e iniciam um ataque de mate contra seu rei";
    else if (matAfterLine <= -3) punish += ` e saem com cerca de ${-matAfterLine} pontos de material a mais`;
    else if (matAfterLine < 0) punish += " e ganham material";
    else if (checks) punish += " com xeques que desorganizam sua defesa";
    else punish += " e ficam com uma posição claramente melhor";
    out.push(`A punição::${punish}. (Linha: ${replyLine.san.join(" ")})`);
  }

  // 3. A alternativa
  const bestLine = playLine(a.fenBefore, a.bestPv, 6);
  const matBest = materialDiff(bestLine.fen, a.sign) - materialDiff(a.fenBefore, a.sign);
  let alt = `${a.bestMove.san} era superior porque ${purpose(a.bestMove, a.fenBefore)}`;
  if (matBest >= 1) alt += `; nessa linha você termina com ${matBest} ponto(s) de material a mais`;
  else if (matBest === 0) alt += "; o material fica equilibrado e sua posição continua sólida";
  out.push(`A melhor opção::${alt}.${bestLine.san.length > 1 ? ` (Linha: ${bestLine.san.join(" ")})` : ""}`);

  // 4. Impacto (absolute POV, consistent with header)
  out.push(`Impacto::A avaliação foi de ${abs(a.cpBefore)} para ${abs(a.cpAfter)} — você perdeu ${a.drop.toFixed(0)}% de chance de vitória.`);
  return out;
}

/** Context-specific "how to avoid" advice. */
export function avoidAdvice(m: AnalyzedMove): string | null {
  if (!m.theme) return null;
  const me = m.color;
  const reply = m.explanation.find((e) => e.startsWith("O erro::"))?.slice(8) ?? "";
  const mv = (() => { try { const c = new Chess(m.fenBefore); return c.move(m.san); } catch { return null; } })();
  const piece = mv ? NAME[mv.piece]! : "peça";
  switch (m.theme) {
    case "peca-pendurada":
      return mv?.piece === "q"
        ? "Antes de lançar a dama ao ataque, confira quais peças e peões ela deixa de proteger. Pergunte: 'o que fica sem defesa se ela sair daqui?'"
        : `Antes de mover ${art(mv?.piece ?? "n")} ${piece}, faça uma varredura: alguma peça sua fica atacada e sem defesa depois do lance? ${reply.includes("casa onde") ? "Verifique também se a casa de destino é atacada pelo adversário." : ""}`.trim();
    case "captura-perdida":
      return "A cada lance do adversário, pergunte primeiro: ele deixou algo desprotegido? Procure xeques, capturas e ameaças nesta ordem.";
    case "mate-perdido":
      return "Quando o rei adversário estiver exposto, calcule todos os xeques forçados antes de qualquer outro lance.";
    case "mate-permitido":
      return `Sempre priorize a segurança do seu rei: antes de atacar, veja quais xeques as ${COLOR_NAME(me === "w" ? "b" : "w")} teriam depois do seu lance.`;
    default:
      return THEME_ADVICE[m.theme];
  }
}

export function summarize(moves: AnalyzedMove[], color: "w" | "b") {
  const mine = moves.filter((m) => m.color === color);
  const acc = mine.length ? mine.reduce((s, m) => s + m.accuracy, 0) / mine.length : 0;
  const count = (j: Judgment) => mine.filter((m) => m.judgment === j).length;
  return {
    accuracy: acc,
    best: count("best"),
    good: count("good"),
    inaccuracy: count("inaccuracy"),
    mistake: count("mistake"),
    blunder: count("blunder"),
    total: mine.length,
  };
}

// ---- Persisted personal stats across analyzed games ----
export type StoredGame = { id: string; accuracy: number; themes: Partial<Record<ErrorTheme, number>>; date: number };
const key = (u: string) => `xadrez-coach:${u.toLowerCase()}`;

export function loadStats(user: string): StoredGame[] {
  try {
    return JSON.parse(localStorage.getItem(key(user)) || "[]");
  } catch {
    return [];
  }
}

export function saveGameStats(user: string, g: StoredGame) {
  const list = loadStats(user).filter((x) => x.id !== g.id);
  list.unshift(g);
  localStorage.setItem(key(user), JSON.stringify(list.slice(0, 100)));
}
