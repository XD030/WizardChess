// client/src/components/CapturedPiecesPanel.tsx

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import type { Piece } from "@shared/schema";

// === 棋子圖片（跟 GameBoard 用同一套） ===
import wizardWhitePng from "../assets/wizard_white.png";
import wizardBlackPng from "../assets/wizard_black.png";

import assassinWhitePng from "../assets/assassin_white.png";
import assassinBlackPng from "../assets/assassin_black.png";

import paladinWhitePng from "../assets/paladin_white.png";
import paladinBlackPng from "../assets/paladin_black.png";

import dragonWhitePng from "../assets/dragon_white.png";
import dragonBlackPng from "../assets/dragon_black.png";

import rangerWhitePng from "../assets/ranger_white.png";
import rangerBlackPng from "../assets/ranger_black.png";

import griffinWhitePng from "../assets/griffin_white.png";
import griffinBlackPng from "../assets/griffin_black.png";

// bard 只有一張圖
import bardPng from "../assets/bard.png";

// apprentice 這裡我也分白黑，跟棋盤一樣
import apprenticeWhitePng from "../assets/apprentice_white.png";
import apprenticeBlackPng from "../assets/apprentice_black.png";

interface CapturedPiecesPanelProps {
  capturedPieces: {
    white: Piece[];
    black: Piece[];
    neutral: Piece[];
  };
}

// 取得每個棋子對應的圖片 src
function getPieceImageSrc(piece: Piece): string | null {
  switch (piece.type) {
    case "wizard":
      return piece.side === "black" ? wizardBlackPng : wizardWhitePng;
    case "assassin":
      return piece.side === "black" ? assassinBlackPng : assassinWhitePng;
    case "paladin":
      return piece.side === "black" ? paladinBlackPng : paladinWhitePng;
    case "dragon":
      return piece.side === "black" ? dragonBlackPng : dragonWhitePng;
    case "ranger":
      return piece.side === "black" ? rangerBlackPng : rangerWhitePng;
    case "griffin":
      return piece.side === "black" ? griffinBlackPng : griffinWhitePng;
    case "bard":
      // bard 不分白黑，固定一張
      return bardPng;
    case "apprentice":
      return piece.side === "black" ? apprenticeBlackPng : apprenticeWhitePng;
    default:
      return null;
  }
}

// 把一顆棋子畫成圖示（全部用圖片）
function renderCapturedIcon(piece: Piece) {
  const src = getPieceImageSrc(piece);
  const baseClass = "h-6 w-6 object-contain";

  if (src) {
    return <img src={src} alt={piece.type} className={baseClass} />;
  }

  // 萬一有未知棋種，先簡單給個問號
  return (
    <span className="text-lg leading-none select-none">?</span>
  );
}

export default function CapturedPiecesPanel({
  capturedPieces,
}: CapturedPiecesPanelProps) {
  return (
    <Card className="h-full bg-background/40 backdrop-blur-sm border-border/60">
      <CardHeader>
        <CardTitle className="text-lg">被吃掉的棋子</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* 白方被吃 */}
        <div>
          <div className="mb-1 font-semibold">白方被吃：</div>
          <div className="flex flex-wrap gap-1">
            {capturedPieces.white.length === 0 && (
              <span className="text-muted-foreground">目前沒有</span>
            )}
            {capturedPieces.white.map((p, idx) => (
              <div
                key={idx}
                className="flex items-center justify-center mr-1"
              >
                {renderCapturedIcon(p)}
              </div>
            ))}
          </div>
        </div>

        {/* 黑方被吃 */}
        <div>
          <div className="mb-1 font-semibold">黑方被吃：</div>
          <div className="flex flex-wrap gap-1">
            {capturedPieces.black.length === 0 && (
              <span className="text-muted-foreground">目前沒有</span>
            )}
            {capturedPieces.black.map((p, idx) => (
              <div
                key={idx}
                className="flex items-center justify-center mr-1"
              >
                {renderCapturedIcon(p)}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
