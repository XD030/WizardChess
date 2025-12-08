import type { Piece } from "@shared/schema";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";

import {
  SIDE_CHINESE,
  PIECE_DESCRIPTIONS,
} from "../lib/gameLogic";

// === 棋子圖片（跟 GameBoard 一致） ===
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

// bard 只有一張
import bardPng from "../assets/bard.png";

// apprentice（如果有分白黑）
import apprenticeWhitePng from "../assets/apprentice_white.png";
import apprenticeBlackPng from "../assets/apprentice_black.png";

interface PieceInfoPanelProps {
  piece: Piece | null;
}

// 依照棋子種類與陣營決定圖片
function getPieceImage(piece: Piece): string {
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
      return bardPng;

    case "apprentice":
      return piece.side === "black" ? apprenticeBlackPng : apprenticeWhitePng;

    default:
      return bardPng; // 理論上不會用到
  }
}

export default function PieceInfoPanel({ piece }: PieceInfoPanelProps) {
  if (!piece) {
    return (
      <Card className="w-full" data-testid="card-piece-info">
        <CardHeader>
          <CardTitle className="text-lg">棋子資訊</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-base font-semibold text-foreground">
              未選取棋子
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              點擊棋子可以查看能力。
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const imgSrc = getPieceImage(piece);
  const desc = PIECE_DESCRIPTIONS[piece.type];

  return (
    <Card className="w-full" data-testid="card-piece-info">
      <CardHeader>
        <CardTitle className="text-lg">棋子資訊</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ===== 棋子圖片 + 基本資訊 ===== */}
        <div className="flex items-center gap-3">
          {/* 棋子圖片（只保留顏色調整，不加邊框 / 光） */}
          <img
            src={imgSrc}
            alt={piece.type}
            className="w-16 h-16 object-contain"
            data-testid="text-piece-emoji"
            style={{
                    filter: 'none'
                  }}
          />

          <div>
            <div
              className="text-base font-bold text-foreground"
              data-testid="text-piece-name"
            >
              {desc.name}
            </div>
            <div
              className="text-sm text-muted-foreground"
              data-testid="text-piece-side"
            >
              陣營：{SIDE_CHINESE[piece.side]}
            </div>

            {piece.type === "bard" && (
              <div className="text-sm mt-1" data-testid="text-bard-status">
                狀態：{" "}
                <span
                  className={
                    piece.activated
                      ? "text-green-400 font-semibold"
                      : "text-slate-500"
                  }
                >
                  {piece.activated ? "已激活" : "未激活"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ===== 移動方式 ===== */}
        <div className="border-t border-border pt-4">
          <div className="text-sm font-semibold text-slate-400 mb-2">
            移動方式
          </div>
          <ul className="space-y-1" data-testid="list-move-desc">
            {desc.move.map((text, i) => (
              <li key={i} className="text-sm text-slate-200 flex gap-2">
                <span className="text-emerald-400">•</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ===== 能力 ===== */}
        <div className="border-t border-border pt-4">
          <div className="text-sm font-semibold text-slate-400 mb-2">
            能力
          </div>
          <ul className="space-y-1" data-testid="list-ability-desc">
            {desc.ability.map((text, i) => (
              <li key={i} className="text-sm text-slate-200 flex gap-2">
                <span className="text-amber-400">•</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
