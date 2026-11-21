import { describe, expect, it } from "vitest";
import { gameAccuracyFromEvals, moveAccuracy, winPct } from "@/lib/analysis";

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
