// client/src/components/GameBoard.tsx
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { Piece, MoveHighlight, NodePosition, BurnMark, HolyLight } from '@shared/schema';
import { buildRows, buildAllNodes, buildAdjacency, NODE_RADIUS } from '../lib/gameLogic';

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

// bard 只有一張
import bardPng from '../assets/bard.png';

// apprentice
import apprenticeWhitePng from '../assets/apprentice_white.png';
import apprenticeBlackPng from '../assets/apprentice_black.png';

type BeamEdge = {
  from: { row: number; col: number };
  to: { row: number; col: number };
};

type WizardBeamResult = {
  pathNodes: { row: number; col: number }[];
  pathEdges: BeamEdge[];
  target?: { row: number; col: number };
};

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

  // ✅ 巫師導線（由 Game.tsx 計算後傳進來）
  wizardBeam?: WizardBeamResult | null;
}

const LOGICAL_SIZE = 1000; // Canvas 基礎尺寸
const BOARD_SCALE = 2; // 棋盤放大倍率（1 = 原本大小）
const PIECE_SIZE = 40;

const BOARD_THEME = {
  // ==== 背景 ====
  bgInner: '#2a2622',
  bgOuter: '#1a1714',

  // ==== 邊框 ====
  triBorder: 'rgba(255, 255, 255, 0.35)',

  // ==== 線條與節點（一般） ====
  linkLine: 'rgba(255, 255, 255, 0.15)',
  nodeNormal: 'rgba(255, 255, 255, 0.75)',
  nodeHover: 'rgba(255, 240, 150, 1.0)',

  // ==== 座標文字 ====
  labelText: 'rgba(255, 255, 255, 0.85)',

  // ==== ✅ 巫師導線顏色（線：黃金；路徑點：青藍；目標：紅） ====
  beamLine: 'rgba(250, 204, 21, 0.85)',
  beamGlow: 'rgba(250, 204, 21, 0.55)',
  beamNode: 'rgba(56, 189, 248, 0.95)',
  beamNodeGlow: 'rgba(56, 189, 248, 0.55)',
  beamTarget: 'rgba(239, 68, 68, 0.95)',
  beamTargetGlow: 'rgba(239, 68, 68, 0.55)',
};

// 這個視角是否看得到這顆棋
function isPieceVisible(piece: Piece, viewerSide: 'white' | 'black' | 'spectator', observing: boolean): boolean {
  if (observing) return true;

  if (piece.type === 'assassin' && piece.stealthed) {
    if (viewerSide === 'spectator') return false;
    return piece.side === viewerSide;
  }

  return true;
}

function posKey(row: number, col: number) {
  return `${row},${col}`;
}

/**
 * ✅ 用圖片 alpha 做「描邊」：先畫紅色剪影多次，再畫原圖
 * 這樣攻擊目標會是「沿著棋子圖片本體外緣」紅色描邊，而不是方框/圈圈。
 */
function drawImageOutline(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  color: string,
  thickness = 2,
) {
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext('2d');
  if (!octx) return;

  octx.clearRect(0, 0, off.width, off.height);
  octx.drawImage(img, 0, 0);

  // 把圖變成單色（保留 alpha）
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = color;
  octx.fillRect(0, 0, off.width, off.height);
  octx.globalCompositeOperation = 'source-over';

  const offsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (let t = 1; t <= thickness; t++) {
    offsets.forEach(([ox, oy]) => {
      ctx.drawImage(off, 0, 0, off.width, off.height, dx + ox * t, dy + oy * t, dw, dh);
    });
  }

  ctx.restore();
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
  wizardBeam,
}: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredNode, setHoveredNode] = useState<{ row: number; col: number } | null>(null);
  const [rows, setRows] = useState<{ x: number; y: number }[][]>([]);
  const [allNodes, setAllNodes] = useState<NodePosition[]>([]);
  const [adjacency, setAdjacency] = useState<number[][]>([]);

  // ✅✅✅ 黑方視角翻面（UI-only）
  const shouldFlip = viewerSide === 'black' && viewerSide !== 'spectator';
  const vx = (x: number) => (shouldFlip ? LOGICAL_SIZE - x : x);
  const vy = (y: number) => (shouldFlip ? LOGICAL_SIZE - y : y);
  const vPoint = (p: { x: number; y: number }) => ({ x: vx(p.x), y: vy(p.y) });

  // ===== 棋子圖片 =====
  const [pieceImages, setPieceImages] = useState<Record<string, HTMLImageElement | null>>({});

  // ===== 移動動畫 =====
  type MoveAnimState =
    | {
        pieceIndex: number;
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
        startTime: number;
        duration: number;
      }
    | null;

  const [animState, setAnimState] = useState<MoveAnimState>(null);
  const animStateRef = useRef<MoveAnimState>(null);
  const prevPiecesRef = useRef<Piece[] | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    animStateRef.current = animState;
  }, [animState]);

  // key：決定用哪張圖
  function keyForPiece(piece: Piece): string {
    if (piece.type === 'bard') return 'bard';
    if (piece.side === 'white' || piece.side === 'black') return `${piece.type}_${piece.side}`;
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
      img.onload = () => setPieceImages((prev) => ({ ...prev, [key]: img }));
    });
  }, []);

  // 棋盤幾何（含放大）
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

    const baseRows = buildRows(LOGICAL_SIZE, LOGICAL_SIZE);
    const cx = LOGICAL_SIZE / 2;
    const cy = LOGICAL_SIZE / 2;

    const scaledRows = baseRows.map((row) =>
      row.map((p) => ({
        x: cx + (p.x - cx) * BOARD_SCALE,
        y: cy + (p.y - cy) * BOARD_SCALE,
      })),
    );

    const newNodes = buildAllNodes(scaledRows);
    const newAdjacency = buildAdjacency(scaledRows);

    setRows(scaledRows);
    setAllNodes(newNodes);
    setAdjacency(newAdjacency);
  }, []);

  // 偵測棋子位移 → 啟動動畫（注意：animState 存的是「原始座標」，畫的時候再 vx/vy）
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

        if (pNew.type === pOld.type && pNew.side === pOld.side && (pNew.row !== pOld.row || pNew.col !== pOld.col)) {
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
  const drawBoard = (ctx: CanvasRenderingContext2D, overridePos?: { pieceIndex: number; x: number; y: number }) => {
    ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    // 快取 node lookup（避免一直 find）
    const nodeMap = new Map<string, NodePosition>();
    allNodes.forEach((n) => nodeMap.set(posKey(n.row, n.col), n));
    const getNode = (r: number, c: number) => nodeMap.get(posKey(r, c));

    // --- 背景 ---
    const bgGrad = ctx.createRadialGradient(
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE / 2,
      0,
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE * 0.7,
    );
    bgGrad.addColorStop(0, BOARD_THEME.bgInner);
    bgGrad.addColorStop(1, BOARD_THEME.bgOuter);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    // --- 棋盤三角形輪廓 ---
    ctx.strokeStyle = BOARD_THEME.triBorder;
    ctx.lineWidth = 1.5;

    for (let r = 0; r < rows.length - 1; r++) {
      const rowA = rows[r];
      const rowB = rows[r + 1];

      if (rowB.length === rowA.length + 1) {
        for (let c = 0; c < rowA.length; c++) {
          const p1 = vPoint(rowA[c]);
          const p2 = vPoint(rowB[c]);
          const p3 = vPoint(rowB[c + 1]);

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.stroke();
        }

        for (let c = 0; c < rowA.length - 1; c++) {
          const p1 = vPoint(rowA[c]);
          const p2 = vPoint(rowA[c + 1]);
          const p3 = vPoint(rowB[c + 1]);

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.stroke();
        }
      } else if (rowA.length === rowB.length + 1) {
        for (let c = 0; c < rowB.length; c++) {
          const p1 = vPoint(rowB[c]);
          const p2 = vPoint(rowA[c]);
          const p3 = vPoint(rowA[c + 1]);

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.stroke();
        }

        for (let c = 0; c < rowB.length - 1; c++) {
          const p1 = vPoint(rowB[c]);
          const p2 = vPoint(rowB[c + 1]);
          const p3 = vPoint(rowA[c + 1]);

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

    // --- 節點連線（一般） ---
    ctx.strokeStyle = BOARD_THEME.linkLine;
    ctx.lineWidth = 1;
    allNodes.forEach((node, idx) => {
      adjacency[idx]?.forEach((adjIdx) => {
        if (idx >= adjIdx) return;
        const adjNode = allNodes[adjIdx];
        if (!adjNode) return;

        const a = vPoint(node);
        const b = vPoint(adjNode);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    });

    // =========================================================
    // ✅ 巫師導線：只有「目前選到的棋子是巫師」才顯示（黃線＋藍點，命中目標紅點）
    // =========================================================
    const selectedPiece = selectedPieceIndex >= 0 ? pieces[selectedPieceIndex] : null;
    const shouldDrawBeam = !!wizardBeam && !!selectedPiece && selectedPiece.type === 'wizard';

    const getBeamEdges = (): BeamEdge[] => {
      if (!wizardBeam) return [];
      if (wizardBeam.pathEdges?.length) return wizardBeam.pathEdges;
      const nodes = wizardBeam.pathNodes ?? [];
      if (nodes.length < 2) return [];
      return nodes.slice(0, -1).map((n, i) => ({ from: n, to: nodes[i + 1] }));
    };

    const isBeamTarget = (r: number, c: number) =>
      !!wizardBeam?.target && wizardBeam.target.row === r && wizardBeam.target.col === c;

    const drawBeamLineAndDots = () => {
      if (!shouldDrawBeam || !wizardBeam) return;

      const edges = getBeamEdges();
      const nodes = wizardBeam.pathNodes ?? [];

      // 線（glow + main）
      if (edges.length) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // glow
        ctx.strokeStyle = BOARD_THEME.beamGlow;
        ctx.lineWidth = 10;
        ctx.shadowColor = BOARD_THEME.beamGlow;
        ctx.shadowBlur = 12;

        edges.forEach((e) => {
          const fromNode = getNode(e.from.row, e.from.col);
          const toNode = getNode(e.to.row, e.to.col);
          if (!fromNode || !toNode) return;

          const a = vPoint(fromNode);
          const b = vPoint(toNode);

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        });

        // main
        ctx.shadowBlur = 0;
        ctx.strokeStyle = BOARD_THEME.beamLine;
        ctx.lineWidth = 4;

        edges.forEach((e) => {
          const fromNode = getNode(e.from.row, e.from.col);
          const toNode = getNode(e.to.row, e.to.col);
          if (!fromNode || !toNode) return;

          const a = vPoint(fromNode);
          const b = vPoint(toNode);

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        });

        ctx.restore();
      }

      // 點（glow + core）
      if (nodes.length) {
        ctx.save();

        // glow dots
        nodes.forEach((p) => {
          const node = getNode(p.row, p.col);
          if (!node) return;

          const v = vPoint(node);
          const target = isBeamTarget(p.row, p.col);

          ctx.beginPath();
          ctx.arc(v.x, v.y, target ? 12 : 10, 0, Math.PI * 2);
          ctx.fillStyle = target ? BOARD_THEME.beamTargetGlow : BOARD_THEME.beamNodeGlow;
          ctx.shadowColor = target ? BOARD_THEME.beamTargetGlow : BOARD_THEME.beamNodeGlow;
          ctx.shadowBlur = 12;
          ctx.fill();
        });

        // core dots
        ctx.shadowBlur = 0;
        nodes.forEach((p) => {
          const node = getNode(p.row, p.col);
          if (!node) return;

          const v = vPoint(node);
          const target = isBeamTarget(p.row, p.col);

          ctx.beginPath();
          ctx.arc(v.x, v.y, target ? 6.5 : 5.5, 0, Math.PI * 2);
          ctx.fillStyle = target ? BOARD_THEME.beamTarget : BOARD_THEME.beamNode;
          ctx.fill();
        });

        ctx.restore();
      }
    };

    // ✅ 導線畫在「一般線」之上，但在「節點白點/棋子」之下（最後會再覆蓋一次）
    drawBeamLineAndDots();

    // --- 節點圓點 ---
    allNodes.forEach((node) => {
      const isHovered = hoveredNode?.row === node.row && hoveredNode?.col === node.col;
      const v = vPoint(node);

      ctx.beginPath();
      ctx.arc(v.x, v.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? BOARD_THEME.nodeHover : BOARD_THEME.nodeNormal;
      ctx.fill();
    });

    // --- 火焰標記 ---
    burnMarks.forEach((mark) => {
      const node = getNode(mark.row, mark.col);
      if (!node) return;
      const v = vPoint(node);

      const g2 = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 14);
      g2.addColorStop(0, 'rgba(255, 140, 0, 0.8)');
      g2.addColorStop(0.5, 'rgba(255, 69, 0, 0.6)');
      g2.addColorStop(1, 'rgba(255, 69, 0, 0)');
      ctx.beginPath();
      ctx.arc(v.x, v.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = g2;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4500';
      ctx.fill();
    });

    // --- 聖光標記 ---
    holyLights.forEach((light) => {
      const node = getNode(light.row, light.col);
      if (!node) return;
      const v = vPoint(node);

      const g3 = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 16);
      g3.addColorStop(0, 'rgba(255, 215, 0, 0.9)');
      g3.addColorStop(0.5, 'rgba(255, 255, 100, 0.6)');
      g3.addColorStop(1, 'rgba(255, 255, 200, 0)');
      ctx.beginPath();
      ctx.arc(v.x, v.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = g3;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(v.x, v.y - 8);
      ctx.lineTo(v.x, v.y + 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(v.x - 8, v.y);
      ctx.lineTo(v.x + 8, v.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(v.x, v.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd700';
      ctx.fill();
    });

    // --- 移動高亮（節點綠點）---
    highlights.forEach((h) => {
      if (h.type !== 'move') return;
      const node = getNode(h.row, h.col);
      if (!node) return;
      const v = vPoint(node);

      const isHovered = hoveredNode?.row === h.row && hoveredNode?.col === h.col;
      const opacity = isHovered ? 0.7 : 0.5;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(16, 185, 129, ${opacity})`;
      ctx.fill();
    });

    // --- 座標標籤 A~I / 1~9（✅ 放到棋盤外面，且跟著翻面位置）---
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = BOARD_THEME.labelText;
    
    // 先算出「翻面後」所有節點的 bounding box
    let minX = Infinity;
    let maxX = -Infinity;
    
    for (const n of allNodes) {
      const v = vPoint(n);
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
    }
    
    // 往外推的距離（可自行調大/小）
    const OUT = 26;
    
    // 固定放在棋盤外的左右兩側
    const labelXRight = maxX + OUT; // 英文字母
    const labelXLeft = minX - OUT;  // 數字
    
    // A~I（每一排的「最右節點」取 y，x 固定在棋盤外右側）
    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    rowLabels.forEach((label, rowIdx) => {
      if (rowIdx < rows.length && rowIdx <= 8) {
        const rightNode = rows[rowIdx][rows[rowIdx].length - 1];
        const v = vPoint(rightNode);
    
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelXRight, v.y - 5);
      }
    });
    
    // 1~9（每一排的「最左節點」取 y，x 固定在棋盤外左側）
    const colLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    colLabels.forEach((label, rowIdx) => {
      if (rowIdx < rows.length && rowIdx <= 8) {
        const leftNode = rows[rowIdx][0];
        const v = vPoint(leftNode);
    
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelXLeft, v.y - 5);
      }
    });


    // --- 棋子（圖片） ---
    pieces.forEach((piece, idx) => {
      if (!isPieceVisible(piece, viewerSide, observing)) return;

      const baseImg = getImageForPiece(piece);
      if (!baseImg) return;

      const node = getNode(piece.row, piece.col);
      if (!node) return;

      const vp = vPoint(node);
      const displaySize = PIECE_SIZE;

      // overridePos（動畫）也要翻
      const drawX =
        overridePos && overridePos.pieceIndex === idx ? vx(overridePos.x) : vp.x;
      const drawY =
        overridePos && overridePos.pieceIndex === idx ? vy(overridePos.y) : vp.y;

      const swapHighlight = highlights.find((h) => h.type === 'swap' && h.row === piece.row && h.col === piece.col);
      const attackHighlight = highlights.find((h) => h.type === 'attack' && h.row === piece.row && h.col === piece.col);
      const isProtected = protectionZones?.some((z) => z.row === piece.row && z.col === piece.col) || false;

      // ✅ 外框樣式：glow(原本) / outline(攻擊目標紅描邊) / none
      let outlineStyle: 'none' | 'glow' | 'outline' = 'none';
      let outlineColor: string | null = null;
      let outlineWidth = 0;

      if (idx === selectedPieceIndex) {
        outlineStyle = 'glow';
        outlineColor = '#fbbf24';
        outlineWidth = 3;
      } else if (swapHighlight) {
        outlineStyle = 'glow';
        outlineColor = '#3b82f6';
        outlineWidth = 3;
      } else if (attackHighlight) {
        outlineStyle = 'outline';
        outlineColor = '#ef4444';
        outlineWidth = 2;
      } else if (isProtected) {
        outlineStyle = 'glow';
        outlineColor = '#06b6d4';
        outlineWidth = 2.5;
      } else if (piece.type === 'bard' && (piece as any).activated) {
        outlineStyle = 'glow';
        outlineColor = 'rgba(168, 85, 247, 0.9)';
        outlineWidth = 2.5;
      }

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (
        piece.type === 'assassin' &&
        piece.stealthed &&
        viewerSide !== 'spectator' &&
        piece.side === viewerSide &&
        !observing
      ) {
        ctx.globalAlpha = 0.5;
      }

      // ✅ 原本的 glow（選取 / 換位 / 守護 / 啟動吟遊）
      if (outlineStyle === 'glow' && outlineColor && outlineWidth > 0) {
        ctx.save();
        ctx.shadowColor = outlineColor;
        ctx.shadowBlur = outlineWidth;

        const offsets = [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ];
        offsets.forEach(([dx, dy]) => {
          ctx.shadowOffsetX = dx;
          ctx.shadowOffsetY = dy;
          ctx.drawImage(
            baseImg,
            0,
            0,
            baseImg.width,
            baseImg.height,
            drawX - displaySize / 2,
            drawY - displaySize / 2,
            displaySize,
            displaySize,
          );
        });
        ctx.restore();
      }

      // ✅ 攻擊目標：紅色描邊（沿圖片形狀）
      if (outlineStyle === 'outline' && outlineColor && outlineWidth > 0) {
        drawImageOutline(
          ctx,
          baseImg,
          drawX - displaySize / 2,
          drawY - displaySize / 2,
          displaySize,
          displaySize,
          outlineColor,
          Math.max(1, Math.round(outlineWidth)),
        );
      }

      // 先畫棋子
      ctx.drawImage(
        baseImg,
        0,
        0,
        baseImg.width,
        baseImg.height,
        drawX - displaySize / 2,
        drawY - displaySize / 2,
        displaySize,
        displaySize,
      );

      ctx.restore();
    });

    // --- 聖騎士守護 preview 光暈 ---
    if (guardPreview) {
      const drawGuardGlow = (row: number, col: number, color: string, radius: number) => {
        const node = getNode(row, col);
        if (!node) return;
        const v = vPoint(node);

        const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, radius);
        g.addColorStop(0, color.replace('0.9', '0.0'));
        g.addColorStop(0.4, color);
        g.addColorStop(1, color.replace('0.9', '0'));
        ctx.beginPath();
        ctx.arc(v.x, v.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      };

      drawGuardGlow(guardPreview.paladinRow, guardPreview.paladinCol, 'rgba(56, 189, 248, 0.9)', 26);
      drawGuardGlow(guardPreview.targetRow, guardPreview.targetCol, 'rgba(250, 204, 21, 0.9)', 26);
      drawGuardGlow(guardPreview.attackerRow, guardPreview.attackerCol, 'rgba(248, 113, 113, 0.9)', 26);
    }

    // ✅ 最後再覆蓋一次導線線/點，避免被節點白點/棋子蓋掉
    drawBeamLineAndDots();
  };

  // 非動畫時重繪
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0 || allNodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (animStateRef.current) return;
    drawBoard(ctx);
  }, [
    rows,
    allNodes,
    adjacency,
    pieces,
    selectedPieceIndex,
    highlights,
    hoveredNode,
    burnMarks,
    holyLights,
    protectionZones,
    viewerSide,
    observing,
    guardPreview,
    pieceImages,
    wizardBeam,
    shouldFlip,
  ]);

  // 動畫 loop（動畫時 overridePos 會在 drawBoard 裡被 vx/vy 翻面）
  useEffect(() => {
    if (!animState) return;
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0 || allNodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { pieceIndex, fromX, fromY, toX, toY, startTime, duration } = animState;

    const step = (time: number) => {
      const t = Math.min(1, (time - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const x = fromX + (toX - fromX) * eased;
      const y = fromY + (toY - fromY) * eased;

      drawBoard(ctx, { pieceIndex, x, y });

      if (t < 1 && animStateRef.current) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        setAnimState(null);
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current != null) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [
    animState,
    rows,
    allNodes,
    adjacency,
    highlights,
    burnMarks,
    holyLights,
    protectionZones,
    viewerSide,
    observing,
    guardPreview,
    selectedPieceIndex,
    pieceImages,
    wizardBeam,
    shouldFlip,
  ]);

  // ========= Canvas 事件 =========
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * LOGICAL_SIZE;
    let y = ((e.clientY - rect.top) / rect.height) * LOGICAL_SIZE;

    // ✅ 黑方視角：把點擊座標反轉回「邏輯座標」
    if (shouldFlip) {
      x = LOGICAL_SIZE - x;
      y = LOGICAL_SIZE - y;
    }

    for (const node of allNodes) {
      const dx = x - node.x;
      const dy = y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) {
        onNodeClick(node.row, node.col);
        return;
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * LOGICAL_SIZE;
    let y = ((e.clientY - rect.top) / rect.height) * LOGICAL_SIZE;

    // ✅ 黑方視角：hover 也要反轉回「邏輯座標」
    if (shouldFlip) {
      x = LOGICAL_SIZE - x;
      y = LOGICAL_SIZE - y;
    }

    let found = false;
    for (const node of allNodes) {
      const dx = x - node.x;
      const dy = y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) {
        setHoveredNode({ row: node.row, col: node.col });
        found = true;
        break;
      }
    }
    if (!found) setHoveredNode(null);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        data-testid="canvas-board"
        className="rounded-2xl shadow-2xl cursor-pointer"
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={() => setHoveredNode(null)}
      />
      <p className="text-xs text-muted-foreground" data-testid="text-hint">
        綠=移動、藍=換位、紅描邊=可攻擊（選到巫師時：可用導線＝黃線＋藍點，命中目標＝紅點）
      </p>
    </div>
  );
}
