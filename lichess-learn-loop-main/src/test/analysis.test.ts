import { describe, expect, it, vi } from "vitest";
import { analyzeGame, gameAccuracyFromEvals, moveAccuracy, winPct } from "@/lib/analysis";
import type { Engine, EngineEval } from "@/lib/engine";

describe("Lichess-style accuracy calculations", () => {
  it("maps an unchanged winning-chance position to 100% move accuracy", () => {
    expect(moveAccuracy(50, 50)).toBe(100);
  });

  it("never returns move accuracy outside 0..100", () => {
    expect(moveAccuracy(100, 0)).toBe(0);
    expect(moveAccuracy(0, 100)).toBe(100);
  });

  it("returns 100% game accuracy for unchanged positions", () => {
    const evals = [0, 0, 0, 0, 0];
    const colors = ["w", "b", "w", "b"] as const;
    expect(gameAccuracyFromEvals(evals, [...colors], "w")).toBe(100);
    expect(gameAccuracyFromEvals(evals, [...colors], "b")).toBe(100);
  });

  it("computes the same winning-chance curve for equal and opposite evaluations", () => {
    expect(winPct(250)).toBeCloseTo(100 - winPct(-250), 10);
  });

  it("returns zero when no moves exist for the requested side", () => {
    expect(gameAccuracyFromEvals([0, 50], ["w"], "b")).toBe(0);
  });
});

describe("Interrupção da análise", () => {
  it("não inicia o motor quando o cancelamento já foi pedido", async () => {
    const controller = new AbortController();
    controller.abort();
    const evaluate = vi.fn();
    const onProgress = vi.fn();
    const engine = { evaluate } as unknown as Engine;

    await expect(analyzeGame(["e4"], engine, 100, onProgress, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(evaluate).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("interrompe imediatamente uma avaliação pendente", async () => {
    const controller = new AbortController();
    const evaluate = vi.fn(() => new Promise<EngineEval>(() => {}));
    const onProgress = vi.fn();
    const engine = { evaluate } as unknown as Engine;
    const pending = analyzeGame(["e4"], engine, 100, onProgress, controller.signal);

    expect(evaluate).toHaveBeenCalledTimes(1);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("não processa posições adicionais após a interrupção", async () => {
    const controller = new AbortController();
    const evaluation: EngineEval = {
      cp: 0, mate: null, best: "e2e4", pv: [], depth: 8, nodes: 100, nps: 1000, time: 100,
    };
    const evaluate = vi.fn().mockResolvedValue(evaluation);
    const onProgress = vi.fn((done: number) => {
      if (done === 1) controller.abort();
    });
    const engine = { evaluate } as unknown as Engine;

    await expect(analyzeGame(["e4", "e5"], engine, 100, onProgress, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});
