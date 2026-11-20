import { getSession, getSupabaseConfig } from "@/lib/auth";
import type { StoredGame } from "@/lib/analysis";

function platformFor(username: string): "lichess" | "chesscom" {
  return username.endsWith("@chesscom") ? "chesscom" : "lichess";
}

async function requestHeaders() {
  const session = await getSession();
  const config = getSupabaseConfig();
  if (!session || !config.url || !config.anonKey) return null;
  return {
    apikey: config.anonKey,
    Authorization: "Bearer " + session.access_token,
    "Content-Type": "application/json",
  };
}

export async function saveCloudStats(username: string, game: StoredGame) {
  const headers = await requestHeaders();
  const config = getSupabaseConfig();
  if (!headers || !config.url) return false;
  const session = await getSession();
  if (!session) return false;

  const response = await fetch(
    config.url + "/rest/v1/game_analyses?on_conflict=user_id,platform,game_id",
    {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        user_id: session.user.id,
        platform: platformFor(username),
        external_username: username.replace(/@chesscom$/, ""),
        game_id: game.id,
        accuracy: game.accuracy,
        themes: game.themes,
        analyzed_at: game.date,
      }]),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Não foi possível salvar a análise na nuvem: " + detail);
  }
  return true;
}

export async function loadCloudStats(username: string): Promise<StoredGame[]> {
  const headers = await requestHeaders();
  const config = getSupabaseConfig();
  if (!headers || !config.url) return [];
  const platform = platformFor(username);
  const externalUsername = username.replace(/@chesscom$/, "");
  const params = new URLSearchParams({
    select: "game_id,accuracy,themes,analyzed_at",
    platform: "eq." + platform,
    external_username: "eq." + externalUsername,
    order: "analyzed_at.desc",
    limit: "100",
  });
  const response = await fetch(config.url + "/rest/v1/game_analyses?" + params, { headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Não foi possível carregar seu histórico: " + detail);
  }
  const rows = await response.json() as Array<{
    game_id: string;
    accuracy: number;
    themes: StoredGame["themes"];
    analyzed_at: number;
  }>;
  return rows.map((row) => ({
    id: row.game_id,
    accuracy: Number(row.accuracy),
    themes: row.themes ?? {},
    date: Number(row.analyzed_at),
  }));
}
