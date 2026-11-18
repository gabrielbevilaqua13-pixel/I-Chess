import { useEffect, useState } from "react";
import { Chessboard } from "react-chessboard";

type Props = {
  fen: string;
  orientation: "white" | "black";
  arrows?: [string, string, string][];
  onDrop?: ((from: string, to: string) => boolean) | undefined;
  highlight?: string[];
};

export function Board({ fen, orientation, arrows = [], onDrop, highlight = [] }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="aspect-square w-full rounded-lg bg-muted" />;
  const squareStyles = Object.fromEntries(
    highlight.map((s) => [s, { boxShadow: "inset 0 0 0 4px var(--primary)" }]),
  );
  return (
    <div className="overflow-hidden rounded-lg shadow-2xl ring-1 ring-border">
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        arePiecesDraggable={!!onDrop}
        onPieceDrop={(s: string, t: string) => (onDrop ? onDrop(s, t) : false)}
        customArrows={arrows as never}
        customSquareStyles={squareStyles}
        customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
        customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
        animationDuration={150}
      />
    </div>
  );
}
