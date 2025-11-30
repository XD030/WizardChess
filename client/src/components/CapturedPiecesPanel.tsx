import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import type { Piece } from "@shared/schema";
import { getPieceSymbol } from "../lib/gameLogic";

// ✅ 圖片路徑（components 跟 assets 同一層，所以用 ../assets）
import wizardMoonImg from "../assets/wizard_moon.png";
import assassinLogoImg from "../assets/assassin_logo.png";


interface CapturedPiecesPanelProps {
  capturedPieces: {
    white: Piece[];
    black: Piece[];
    neutral: Piece[];
  };
}

// 共用：把一顆棋子畫成圖示（有圖片就用圖片，沒有就用符號）
function renderCapturedIcon(piece: Piece) {
  // 巫師 → 用 wizard_moon.png
  if (piece.type === "wizard") {
    return (
        <img
        src={wizardMoonImg}
        alt="巫師"
        className="h-6 w-6 object-contain"
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


  // 刺客 → 用 assassin_logo.png
  if (piece.type === "assassin") {
    return (
        <img
        src={assassinLogoImg}
        alt="刺客"
        className="h-6 w-6 object-contain"
        style={{
            filter:
            piece.side === "white"
                // 白方刺客：維持偏白的線條
                ? "invert(1) brightness(1.2)"
                // 黑方刺客：改成亮色（偏紅），在黑背景上很明顯
                : "invert(1) sepia(1) saturate(5) hue-rotate(330deg) brightness(1.1)",
        }}
        />
    );
    }


  // 其他棋子還沒有圖片 → 回退用原本符號
  return (
    <span className="text-xl">
      {getPieceSymbol(piece.type, piece.side)}
    </span>
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
