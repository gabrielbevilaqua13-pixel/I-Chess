// Stockfish.js 19.0.1 Lite, single-threaded WebAssembly build.
// The matching .wasm file must be served beside this worker script.
export const ENGINE_VERSION = "Stockfish 19 Lite";

export type EngineEval = {
  cp: number | null;
  mate: number | null;
  best: string | null;
  pv: string[];
  depth: number;
  nodes: number;
  nps: number;
  time: number;
};

export class Engine {
  private worker: Worker;
  private queue: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;

  constructor() {
    this.worker = new Worker("/stockfish/stockfish-19-lite-single.js");
    this.ready = new Promise((resolve, reject) => {
      let phase: "uci" | "ready" = "uci";
      const cleanup = () => {
        clearTimeout(timeout);
        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onError);
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("O Stockfish não respondeu durante a inicialização."));
      }, 30_000);

      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || "Falha ao iniciar o Stockfish."));
      };

      const onMessage = (event: MessageEvent) => {
        const line = String(event.data).trim();
        if (phase === "uci" && line === "uciok") {
          phase = "ready";
          this.worker.postMessage("setoption name Hash value 32");
          this.worker.postMessage("isready");
        } else if (phase === "ready" && line === "readyok") {
          cleanup();
          resolve();
        }
      };

      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", onError);
      this.worker.postMessage("uci");
    });
  }

  /** Evaluates a position from the side-to-move's perspective with a node budget. */
  evaluate(fen: string, nodeLimit: number): Promise<EngineEval> {
    if (!Number.isSafeInteger(nodeLimit) || nodeLimit < 1) {
      return Promise.reject(new Error("O limite de nós da análise é inválido."));
    }

    const run = async () => {
      await this.ready;
      return new Promise<EngineEval>((resolve, reject) => {
        const result: EngineEval = {
          cp: null,
          mate: null,
          best: null,
          pv: [],
          depth: 0,
          nodes: 0,
          nps: 0,
          time: 0,
        };
        let settled = false;

        const cleanup = () => {
          clearTimeout(timeout);
          this.worker.removeEventListener("message", onMessage);
          this.worker.removeEventListener("error", onError);
        };

        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) reject(error);
          else if (result.cp === null && result.mate === null) {
            reject(new Error("O Stockfish terminou sem retornar uma avaliação."));
          } else {
            resolve(result);
          }
        };

        const onError = (event: ErrorEvent) => {
          finish(new Error(event.message || "Ocorreu uma falha durante a análise."));
        };

        const onMessage = (event: MessageEvent) => {
          const line = String(event.data).trim();

          if (line.startsWith("info ")) {
            const depthMatch = line.match(/\bdepth\s+(\d+)/);
            const nodesMatch = line.match(/\bnodes\s+(\d+)/);
            const npsMatch = line.match(/\bnps\s+(\d+)/);
            const timeMatch = line.match(/\btime\s+(\d+)/);

            if (nodesMatch) result.nodes = Math.max(result.nodes, Number(nodesMatch[1]));
            if (npsMatch) result.nps = Number(npsMatch[1]);
            if (timeMatch) result.time = Number(timeMatch[1]);

            const depth = depthMatch ? Number(depthMatch[1]) : 0;
            const hasBound = line.includes(" lowerbound") || line.includes(" upperbound");
            if (depth >= result.depth && !hasBound) {
              const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
              if (scoreMatch) {
                result.depth = depth;
                if (scoreMatch[1] === "cp") {
                  result.cp = Number(scoreMatch[2]);
                  result.mate = null;
                } else {
                  result.mate = Number(scoreMatch[2]);
                  result.cp = null;
                }
                const pvMatch = line.match(/\bpv\s+(.+)$/);
                if (pvMatch) result.pv = pvMatch[1].trim().split(/\s+/);
              }
            }
          } else if (line.startsWith("bestmove ")) {
            const best = line.split(/\s+/)[1];
            result.best = best && best !== "(none)" ? best : null;
            finish();
          }
        };

        const timeout = setTimeout(() => {
          this.worker.postMessage("stop");
          finish(new Error("A análise demorou mais do que o esperado. Tente um nível mais rápido."));
        }, 180_000);

        this.worker.addEventListener("message", onMessage);
        this.worker.addEventListener("error", onError);
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go nodes ${nodeLimit}`);
      });
    };

    const pending = this.queue.then(run);
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  terminate() {
    this.worker.terminate();
  }
}
