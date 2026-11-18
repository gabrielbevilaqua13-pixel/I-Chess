import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
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
  const navigate = useNavigate();
  useEffect(() => {
    const saved = localStorage.getItem("xadrez-coach:user");
    if (saved?.endsWith("@chesscom")) { setPlatform("chesscom"); setUser(saved.slice(0, -9)); }
    else if (saved) setUser(saved);
  }, []);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const name = user.trim();
    if (!name) return;
    const u = platform === "chesscom" ? `${name}@chesscom` : name;
    localStorage.setItem("xadrez-coach:user", u);
    navigate({ to: "/jogador/$username", params: { username: u } });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="mb-4 text-sm uppercase tracking-[0.3em] text-primary">♞ Mestre Interior</p>
      <h1 className="max-w-3xl text-5xl font-bold leading-tight md:text-7xl">
        Seu melhor professor são <em className="text-primary">suas próprias partidas.</em>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        Vincule sua conta do Lichess ou do Chess.com. O Stockfish analisa cada lance, mede sua precisão e mostra
        os erros que você repete — e como parar de cometê-los.
      </p>
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
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder={platform === "chesscom" ? "Seu usuário no Chess.com" : "Seu usuário no Lichess"}
          className="flex-1 rounded-md border border-input bg-card px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        <button className="rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:opacity-90">
          Analisar minhas partidas
        </button>
      </form>
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
