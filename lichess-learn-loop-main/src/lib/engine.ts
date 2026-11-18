// Browser-only Stockfish wrapper (single-threaded WASM build served from /public/stockfish)
export type EngineEval = { cp: number | null; mate: number | null; best: string | null; pv: string[] };

export class Engine {
  private worker: Worker;
  private queue: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;

  constructor() {
    this.worker = new Worker("/stockfish/stockfish-nnue-16-single.js");
    this.ready = new Promise((resolve) => {
      const onMsg = (e: MessageEvent) => {
        if (String(e.data).includes("readyok")) {
          this.worker.removeEventListener("message", onMsg);
          resolve();
        }
      };
      this.worker.addEventListener("message", onMsg);
      this.worker.postMessage("uci");
      this.worker.postMessage("setoption name Hash value 32");
      this.worker.postMessage("isready");
    });
  }

  /** Evaluation from the side-to-move's perspective. */
  evaluate(fen: string, depth: number): Promise<EngineEval> {
    const run = async () => {
      await this.ready;
      return new Promise<EngineEval>((resolve) => {
        const res: EngineEval = { cp: null, mate: null, best: null, pv: [] };
        const onMsg = (e: MessageEvent) => {
          const line = String(e.data);
          if (line.startsWith("info") && line.includes(" score ") && !line.includes("lowerbound") && !line.includes("upperbound")) {
            const m = line.match(/score (cp|mate) (-?\d+)/);
            if (m) {
              if (m[1] === "cp") { res.cp = parseInt(m[2]!); res.mate = null; }
              else { res.mate = parseInt(m[2]!); res.cp = null; }
            }
            const pv = line.match(/ pv (.+)$/);
            if (pv) res.pv = pv[1]!.trim().split(" ");
          } else if (line.startsWith("bestmove")) {
            this.worker.removeEventListener("message", onMsg);
            const b = line.split(" ")[1];
            res.best = b && b !== "(none)" ? b : null;
            resolve(res);
          }
        };
        this.worker.addEventListener("message", onMsg);
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth}`);
      });
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  terminate() {
    this.worker.terminate();
  }
}
