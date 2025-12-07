// client/src/components/GameBoard.tsx

import { useEffect, useRef, useState } from 'react';
import type {
  Piece,
  MoveHighlight,
  NodePosition,
  BurnMark,
  HolyLight,
} from '@shared/schema';
import {
  buildRows,
  buildAllNodes,
  buildAdjacency,
  NODE_RADIUS,
} from '../lib/gameLogic';

interface GameBoardProps {
  pieces: Piece[];
  selectedPieceIndex: number;
  highlights: MoveHighlight[];
  currentPlayer: 'white' | 'black';
  onNodeClick: (row: number, col: number) => void;
  burnMarks: BurnMark[];
  protectionZones: { row: number; col: number }[];
  holyLights: HolyLight[];
  viewerSide: 'white' | 'black' | 'spectator';
  observing: boolean;
  guardPreview?: {
    paladinRow: number;
    paladinCol: number;
    targetRow: number;
    targetCol: number;
    attackerRow: number;
    attackerCol: number;
  } | null;
}

// ------------ 棋子圖片載入 ------------

import wizardWhitePng from '../assets/wizard_white.png';
import wizardBlackPng from '../assets/wizard_black.png';

import assassinWhitePng from '../assets/assassin_white.png';
import assassinBlackPng from '../assets/assassin_black.png';

import paladinWhitePng from '../assets/paladin_white.png';
import paladinBlackPng from '../assets/paladin_black.png';

import dragonWhitePng from '../assets/dragon_white.png';
import dragonBlackPng from '../assets/dragon_black.png';

import rangerWhitePng from '../assets/ranger_white.png';
import rangerBlackPng from '../assets/ranger_black.png';

import griffinWhitePng from '../assets/griffin_white.png';
import griffinBlackPng from '../assets/griffin_black.png';

// ⭐ bard 只有一張圖
import bardPng from '../assets/bard.png';

import apprenticeWhitePng from '../assets/apprentice_white.png';
import apprenticeBlackPng from '../assets/apprentice_black.png';

const LOGICAL_SIZE = 700;
const PIECE_SIZE = 34;

// 這個視角是否看得到這顆棋
function isPieceVisible(
  piece: Piece,
  viewerSide: 'white' | 'black' | 'spectator',
  observing: boolean,
): boolean {
  if (observing) return true;

  // 潛行刺客：只有自己看得到
  if (piece.type === 'assassin' && piece.stealthed) {
    if (viewerSide === 'spectator') return false;
    return piece.side === viewerSide;
  }

  return true;
}

export default function GameBoard({
  pieces,
  selectedPieceIndex,
  highlights,
  currentPlayer,
  onNodeClick,
  burnMarks,
  protectionZones,
  holyLights,
  viewerSide,
  observing,
  guardPreview,
}: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredNode, setHoveredNode] = useState<{ row: number; col: number } | null>(null);
  const [rows, setRows] = useState<{ x: number; y: number }[][]>([]);
  const [allNodes, setAllNodes] = useState<NodePosition[]>([]);
  const [adjacency, setAdjacency] = useState<number[][]>([]);

  // ===== 棋子圖片 =====
  const [pieceImages, setPieceImages] = useState<Record<string, HTMLImageElement | null>>({});

  // ===== 移動動畫 =====
  type MoveAnimState = {
    pieceIndex: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startTime: number;
    duration: number;
  } | null;

  const [animState, setAnimState] = useState<MoveAnimState>(null);
  const animStateRef = useRef<MoveAnimState>(null);
  const prevPiecesRef = useRef<Piece[] | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    animStateRef.current = animState;
  }, [animState]);

  // key：決定用哪張圖
  function keyForPiece(piece: Piece): string {
    if (piece.type === 'bard') {
      return 'bard';
    }
    if (piece.side === 'white' || piece.side === 'black') {
      return `${piece.type}_${piece.side}`;
    }
    // 中立 → 共用白方圖
    return `${piece.type}_white`;
  }

  function getImageForPiece(piece: Piece): HTMLImageElement | null {
    const key = keyForPiece(piece);
    return pieceImages[key] ?? null;
  }

  // 載入所有棋子圖片
  useEffect(() => {
    const srcMap: Record<string, string> = {
      wizard_white: wizardWhitePng,
      wizard_black: wizardBlackPng,

      assassin_white: assassinWhitePng,
      assassin_black: assassinBlackPng,

      paladin_white: paladinWhitePng,
      paladin_black: paladinBlackPng,

      dragon_white: dragonWhitePng,
      dragon_black: dragonBlackPng,

      ranger_white: rangerWhitePng,
      ranger_black: rangerBlackPng,

      griffin_white: griffinWhitePng,
      griffin_black: griffinBlackPng,

      bard: bardPng,

      apprentice_white: apprenticeWhitePng,
      apprentice_black: apprenticeBlackPng,
    };

    Object.entries(srcMap).forEach(([key, src]) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setPieceImages((prev) => ({ ...prev, [key]: img }));
      };
    });
  }, []);

  // 棋盤幾何
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = LOGICAL_SIZE * ratio;
    canvas.height = LOGICAL_SIZE * ratio;
    canvas.style.width = `${LOGICAL_SIZE}px`;
    canvas.style.height = `${LOGICAL_SIZE}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const newRows = buildRows(LOGICAL_SIZE, LOGICAL_SIZE);
    const newNodes = buildAllNodes(newRows);
    const newAdjacency = buildAdjacency(newRows);

    setRows(newRows);
    setAllNodes(newNodes);
    setAdjacency(newAdjacency);
  }, []);

  // 偵測棋子位移 → 啟動動畫
  useEffect(() => {
    if (!allNodes.length) {
      prevPiecesRef.current = pieces;
      return;
    }

    const prev = prevPiecesRef.current;
    if (prev && prev.length === pieces.length) {
      for (let i = 0; i < pieces.length; i++) {
        const pNew = pieces[i];
        const pOld = prev[i];

        if (
          pNew.type === pOld.type &&
          pNew.side === pOld.side &&
          (pNew.row !== pOld.row || pNew.col !== pOld.col)
        ) {
          const fromNode = allNodes.find((n) => n.row === pOld.row && n.col === pOld.col);
          const toNode = allNodes.find((n) => n.row === pNew.row && n.col === pNew.col);
          if (fromNode && toNode) {
            setAnimState({
              pieceIndex: i,
              fromX: fromNode.x,
              fromY: fromNode.y,
              toX: toNode.x,
              toY: toNode.y,
              startTime: performance.now(),
              duration: 200,
            });
          }
          break;
        }
      }
    }

    prevPiecesRef.current = pieces;
  }, [pieces, allNodes]);

  // ========= 繪圖主函式 =========
  const drawBoard = (
    ctx: CanvasRenderingContext2D,
    overridePos?: { pieceIndex: number; x: number; y: number },
  ) => {
    ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    // --- 背景 ---
    const bgGrad = ctx.createRadialGradient(
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE / 2,
      0,
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE * 0.7,
    );
    bgGrad.addColorStop(0, 'hsl(222, 47%, 7%)');
    bgGrad.addColorStop(1, 'hsl(222, 47%, 4%)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    // --- 棋盤三角形 ---
    for (let r = 0; r < rows.length - 1; r++) {
      const rowA = rows[r];
      const rowB = rows[r + 1];

      if (rowB.length === rowA.length + 1) {
        // 擴張
        for (let c = 0; c < rowA.length; c++) {
          const p1 = rowA[c];
          const p2 = { x: rowB[c].x, y: rowB[c].y };
          const p3 = { x: rowB[c + 1].x, y: rowB[c + 1].y };

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        for (let c = 0; c < rowA.length - 1; c++) {
          const p1 = rowA[c];
          const p2 = rowA[c + 1];
          const p3 = { x: rowB[c + 1].x, y: rowB[c + 1].y };

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else if (rowA.length === rowB.length + 1) {
        // 收縮
        for (let c = 0; c < rowB.length; c++) {
          const p1 = rowB[c];
          const p2 = { x: rowA[c].x, y: rowA[c].y };
          const p3 = { x: rowA[c + 1].x, y: rowA[c + 1].y };

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        for (let c = 0; c < rowB.length - 1; c++) {
          const p1 = rowB[c];
          const p2 = rowB[c + 1];
          const p3 = { x: rowA[c + 1].x, y: rowA[c + 1].y };

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // --- 節點連線 ---
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    allNodes.forEach((node, idx) => {
      adjacency[idx]?.forEach((adjIdx) => {
        if (idx >= adjIdx) return;
        const adjNode = allNodes[adjIdx];
        if (!adjNode) return;
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo
