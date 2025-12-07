import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import type { Piece } from "@shared/schema";

// ✅ 圖片路徑
import wizardMoonImg from "../assets/wizard_moon.png";
import assassinLogoImg from "../assets/assassin_logo.png";

import paladinPng from "../assets/paladin.png";
import dragonPng from "../assets/dragon.png";
import rangerPng from "../assets/ranger.png";
import griffinPng from "../assets/griffin.png";
import bardPng from "../assets/bard.png";
import apprenticePng from "../assets/apprentice.png";

interface CapturedPiecesPanelProps {
  capturedPieces: {
    white: Piece[];
    black: Piece[];
    neutral: Piece[];
  };
}

// 共用：把一顆棋子畫成圖示（全部用圖片，沒有 emoji）
function renderCapturedIcon(piece: Piece) {
  const baseClass = "h-6 w-6 object-contain";

  // 巫師 → wizard_moon.png
  if (piece.type === "wizard") {
    return (
      <img
        src={wizardMoonImg}
        alt="巫師"
        className={baseClass}
        style={{
          filter:
            piece.side === "white"
              // 白方巫師：亮藍月亮
              ? "invert(1) sepia(1) saturate(6) hue-rotate(210deg) brightness(1.3)"
              // 黑方巫師：亮紫月亮
              : "invert(1) sepia(1) saturate(6) hue-rotate(280deg) brightness(1.2)",
        }}
      />
    );
  }

  // 刺客 → assassin_logo.png
  if (piece.type === "assassin") {
    return (
      <img
        src={assassinLogoImg}
        alt="刺客"
        className={baseClass}
        style={{
          filter:
            piece.side === "white"
              // 白方刺客：偏白線條
              ? "invert(1) brightness(1.2)"
              // 黑方刺客：偏紅亮色
              : "invert(1) sepia(1) saturate(5) hue-rotate(330deg) brightness(1.1)",
        }}
      />
    );
  }

  // 其他棋子 → 專用 PNG（不再用 emoji）
  if (piece.type === "paladin") {
    return <img src={paladinPng} alt="聖騎士" className={baseClass} />;
  }

  if (piece.type === "dragon") {
    return <img src={dragonPng} alt="巨龍" className={baseClass} />;
  }

  if (piece.type === "ranger") {
    return <img src={rangerPng} alt="遊俠" className={baseClass} />;
  }

  if (piece.type === "griffin") {
    return <img src={griffinPng} alt="獅鷲" className={baseClass} />;
  }

  if (piece.type === "bard") {
    return <img src={bardPng} alt="吟遊詩人" className={baseClass} />;
  }

  if (piece.type === "apprentice") {
    return <img src={apprenticePng} alt="學徒" className={baseClass} />;
  }

  // 萬一有未知棋種，給個小問號（不是 emoji 的那種圖案也可以之後再換成圖片）
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
