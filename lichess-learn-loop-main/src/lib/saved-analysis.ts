import type { AnalysisLevel, AnalyzedMove } from "./analysis";
import type { LichessGame } from "./lichess";

export type SavedAnalysis = {
  revision: string;
  game: LichessGame;
  level: AnalysisLevel;
  moves: AnalyzedMove[];
};

export function analysisKey(id: string, user?: string) {
  return "mestre-interior:analysis:v1:" + JSON.stringify([id, user?.toLowerCase() ?? ""]);
}

export function readAnalysis(key: string, id: string) {
  try {
    const result: SavedAnalysis | null = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!result || result.game?.id !== id || !Array.isArray(result.moves) ||
        !["quick", "standard", "deep"].includes(result.level)) return null;
    let ply = 0;
    let revealed: number[] = [];
    try {
      const cursor = JSON.parse(localStorage.getItem(key + ":position") ?? "null");
      if (cursor?.revision === result.revision) {
        if (Number.isInteger(cursor.ply)) ply = Math.max(0, Math.min(cursor.ply, result.moves.length));
        if (Array.isArray(cursor.revealed)) revealed = cursor.revealed.filter(Number.isInteger);
      }
    } catch { /* A damaged bookmark does not invalidate the analysis. */ }
    return { result, ply, revealed };
  } catch {
    return null;
  }
}
