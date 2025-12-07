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
import wizardMoonImg from '../assets/wizard_moon.png';
import assassinLogoImg from '../assets/assassin_logo.png';

// 其他棋子的 PNG（依你的實際檔名調整）
import paladinPng from '../assets/paladin.png';
import dragonPng from '../assets/dragon.png';
import rangerPng from '../assets/ranger.png';
import griffinPng from '../assets/griffin.png';
import bardPng from '../assets/bard.png';
import apprenticePng from '../assets/apprentice.png';

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

// 所有棋子統一的繪製尺寸（你覺得太大/太小可以改這裡）
const PIECE_SIZE = 34;

// 決定這個視角是否看得到這顆棋
function isPieceVisible(
  piece: Piece,
  viewerSide: 'white' | 'black' | 'spectator',
  observing: boolean,
): boolean {
  if (observing) return true;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<{ row: number; col: number } | null>(null);
  const [rows, setRows] = useState<{ x: number; y: number }[][]>([]);
  const [allNodes, setAllNodes] = useState<NodePosition[]>([]);
  const [adjacency, setAdjacency] = useState<number[][]>([]);

  const [wizardHatImage, setWizardHatImage] = useState<HTMLImageElement | null>(null);
  const [assassinLogoImage, setAssassinLogoImage] = useState<HTMLImageElement | null>(null);

  const [paladinImage, setPaladinImage] = useState<HTMLImageElement | null>(null);
  const [dragonImage, setDragonImage] = useState<HTMLImageElement | null>(null);
  const [rangerImage, setRangerImage] = useState<HTMLImageElement | null>(null);
  const [griffinImage, setGriffinImage] = useState<HTMLImageElement | null>(null);
  const [bardImage, setBardImage] = useState<HTMLImageElement | null>(null);
  const [apprenticeImage, setApprenticeImage] = useState<HTMLImageElement | null>(null);

  const LOGICAL_SIZE = 700;

  // ==== 動畫狀態 ====
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

  // 載入圖片
  useEffect(() => {
    const loadImage = (src: string, cb: (img: HTMLImageElement) => void) => {
      const img = new Image();
      img.src = src;
      img.onload = () => cb(img);
    };

    loadImage(wizardMoonImg, setWizardHatImage);
    loadImage(assassinLogoImg, setAssassinLogoImage);
    loadImage(paladinPng, setPaladinImage);
    loadImage(dragonPng, setDragonImage);
    loadImage(rangerPng, setRangerImage);
    loadImage(griffinPng, setGriffinImage);
    loadImage(bardPng, setBardImage);
    loadImage(apprenticePng, setApprenticeImage);
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
    const newAdj = buildAdjacency(newRows);

    setRows(newRows);
    setAllNodes(newNodes);
    setAdjacency(newAdj);
  }, []);

  // 偵測棋子移動 → 啟動動畫
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

  // 取得其他棋子的圖片 & 尺寸（尺寸統一用 PIECE_SIZE）
  function getImageForPiece(piece: Piece): { img: HTMLImageElement | null; size: number } {
    switch (piece.type) {
      case 'paladin':
        return { img: paladinImage, size: PIECE_SIZE };
      case 'dragon':
        return { img: dragonImage, size: PIECE_SIZE };
      case 'ranger':
        return { img: rangerImage, size: PIECE_SIZE };
      case 'griffin':
        return { img: griffinImage, size: PIECE_SIZE };
      case 'bard':
        return { img: bardImage, size: PIECE_SIZE };
      case 'apprentice':
        return { img: apprenticeImage, size: PIECE_SIZE };
      default:
        return { img: null, size: PIECE_SIZE };
    }
  }

  // ===== 實際繪圖 =====
  const drawBoard = (
    ctx: CanvasRenderingContext2D,
    overridePos?: { pieceIndex: number; x: number; y: number },
  ) => {
    ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    // === 背景 ===
    const gradient = ctx.createRadialGradient(
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE / 2,
      0,
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE * 0.7,
    );
    gradient.addColorStop(0, 'hsl(222, 47%, 7%)');
    gradient.addColorStop(1, 'hsl(222, 47%, 4%)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    // === 三角形棋盤 ===
    for (let r = 0; r < rows.length - 1; r++) {
      const rowA = rows[r];
      const rowB = rows[r + 1];

      if (rowB.length === rowA.length + 1) {
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

    // === 節點連線 ===
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    allNodes.forEach((node, idx) => {
      adjacency[idx]?.forEach((adjIdx) => {
        const adjNode = allNodes[adjIdx];
        if (!adjNode) return;
        if (idx < adjIdx) {
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(adjNode.x, adjNode.y);
          ctx.stroke();
        }
      });
    });

    // === 節點圓點 ===
    allNodes.forEach((node) => {
      const isHovered = hoveredNode?.row === node.row && hoveredNode?.col === node.col;
      ctx.beginPath();
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.2)';
      ctx.fill();
    });

    // === 火焰 ===
    burnMarks.forEach((mark) => {
      const node = allNodes.find((n) => n.row === mark.row && n.col === mark.col);
      if (!node) return;

      const g2 = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 14);
      g2.addColorStop(0, 'rgba(255, 140, 0, 0.8)');
      g2.addColorStop(0.5, 'rgba(255, 69, 0, 0.6)');
      g2.addColorStop(1, 'rgba(255, 69, 0, 0)');
      ctx.beginPath();
      ctx.arc(node.x, node.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = g2;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4500';
      ctx.fill();
    });

    // === 聖光 ===
    holyLights.forEach((light) => {
      const node = allNodes.find((n) => n.row === light.row && n.col === light.col);
      if (!node) return;

      const g3 = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 16);
      g3.addColorStop(0, 'rgba(255, 215, 0, 0.9)');
      g3.addColorStop(0.5, 'rgba(255, 255, 100, 0.6)');
      g3.addColorStop(1, 'rgba(255, 255, 200, 0)');
      ctx.beginPath();
      ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = g3;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(node.x, node.y - 8);
      ctx.lineTo(node.x, node.y + 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(node.x - 8, node.y);
      ctx.lineTo(node.x + 8, node.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd700';
      ctx.fill();
    });

    // === 移動高亮 ===
    highlights.forEach((h) => {
      if (h.type !== 'move') return;
      const node = allNodes.find((n) => n.row === h.row && n.col === h.col);
      if (!node) return;
      const isHovered = hoveredNode?.row === h.row && hoveredNode?.col === h.col;
      const opacity = isHovered ? 0.7 : 0.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(16, 185, 129, ${opacity})`;
      ctx.fill();
    });

    // === 座標標籤 ===
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';

    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    rowLabels.forEach((label, rowIdx) => {
      if (rowIdx < rows.length && rowIdx <= 8) {
        const rightNode = rows[rowIdx][rows[rowIdx].length - 1];
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, rightNode.x + 10, rightNode.y - 5);
      }
    });

    const colLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    colLabels.forEach((label, rowIdx) => {
      if (rowIdx < rows.length && rowIdx <= 8) {
        const leftNode = rows[rowIdx][0];
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, leftNode.x - 10, leftNode.y - 5);
      }
    });

    // === 棋子 ===
    pieces.forEach((piece, idx) => {
      if (!isPieceVisible(piece, viewerSide, observing)) return;

      const node = allNodes.find((n) => n.row === piece.row && n.col === piece.col);
      if (!node) return;

      const drawX =
        overridePos && overridePos.pieceIndex === idx ? overridePos.x : node.x;
      const drawY =
        overridePos && overridePos.pieceIndex === idx ? overridePos.y : node.y;

      const swapHighlight = highlights.find(
        (h) => h.type === 'swap' && h.row === piece.row && h.col === piece.col,
      );
      const attackHighlight = highlights.find(
        (h) => h.type === 'attack' && h.row === piece.row && h.col === piece.col,
      );
      const isProtected =
        protectionZones?.some((z) => z.row === piece.row && z.col === piece.col) ||
        false;

      // === 巫師 ===
      if (piece.type === 'wizard' && wizardHatImage) {
        const displaySize = PIECE_SIZE;
        const highResSize = 128;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = highResSize;
        tempCanvas.height = highResSize;
        const tempCtx = tempCanvas.getContext('2d', { alpha: true });

        if (tempCtx) {
          tempCtx.imageSmoothingEnabled = true;
          tempCtx.imageSmoothingQuality = 'high';
          tempCtx.drawImage(wizardHatImage, 0, 0, highResSize, highResSize);

          const imageData = tempCtx.getImageData(0, 0, highResSize, highResSize);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const alpha = data[i + 3];

            if (alpha > 0) {
              const brightness = (r + g + b) / 3;
              if (brightness > 50) {
                data[i + 3] = 0;
              } else {
                if (piece.side === 'white') {
                  data[i] = 255 - data[i];
                  data[i + 1] = 255 - data[i + 1];
                  data[i + 2] = 255 - data[i + 2];
                } else if (piece.side === 'neutral') {
                  data[i] = Math.min(255, data[i] * 0.6 + 168);
                  data[i + 1] = Math.min(255, data[i + 1] * 0.3 + 85);
                  data[i + 2] = Math.min(255, data[i + 2] * 0.6 + 247);
                } else {
                  data[i] = 0;
                  data[i + 1] = 0;
                  data[i + 2] = 0;
                }
              }
            }
          }

          tempCtx.putImageData(imageData, 0, 0);

          let outlineColor: string | null = null;
          let outlineWidth = 0;

          if (idx === selectedPieceIndex) {
            outlineColor = '#fbbf24';
            outlineWidth = 3;
          } else if (swapHighlight) {
            outlineColor = '#3b82f6';
            outlineWidth = 3;
          } else if (attackHighlight) {
            outlineColor = '#ef4444';
            outlineWidth = 3;
          } else if (isProtected) {
            outlineColor = '#06b6d4';
            outlineWidth = 2.5;
          } else if (piece.side === 'black') {
            outlineColor = '#fff';
            outlineWidth = 1;
          }

          if (outlineColor && outlineWidth > 0) {
            ctx.save();
            ctx.shadowColor = outlineColor;
            ctx.shadowBlur = outlineWidth;

            const offsets = [
              [-0.8, -0.8], [0, -0.8], [0.8, -0.8],
              [-0.8,  0],              [0.8,  0],
              [-0.8,  0.8], [0,  0.8], [0.8,  0.8],
            ];
            offsets.forEach(([dx, dy]) => {
              ctx.shadowOffsetX = dx;
              ctx.shadowOffsetY = dy;
              ctx.drawImage(
                tempCanvas,
                drawX - displaySize / 2,
                drawY - displaySize / 2,
                displaySize,
                displaySize,
              );
            });
            ctx.restore();
          }

          ctx.drawImage(
            tempCanvas,
            drawX - displaySize / 2,
            drawY - displaySize / 2,
            displaySize,
            displaySize,
          );
        }

        ctx.restore();
      }
      // === 刺客 ===
      else if (piece.type === 'assassin' && assassinLogoImage) {
        const displaySize = PIECE_SIZE;
        const highResSize = 128;
        ctx.save();

        if (
          piece.stealthed &&
          viewerSide !== 'spectator' &&
          piece.side === viewerSide &&
          !observing
        ) {
          ctx.globalAlpha = 0.5;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = highResSize;
        tempCanvas.height = highResSize;
        const tempCtx = tempCanvas.getContext('2d', { alpha: true });

        if (tempCtx) {
          tempCtx.imageSmoothingEnabled = true;
          tempCtx.imageSmoothingQuality = 'high';
          tempCtx.drawImage(assassinLogoImage, 0, 0, highResSize, highResSize);

          const imageData = tempCtx.getImageData(0, 0, highResSize, highResSize);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const brightness = (r + g + b) / 3;

            if (brightness > 128) {
              data[i + 3] = 0;
            } else {
              if (piece.side === 'white') {
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
              } else {
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
              }
            }
          }

          tempCtx.putImageData(imageData, 0, 0);

          let outlineColor: string | null = null;
          let outlineWidth = 0;

          if (idx === selectedPieceIndex) {
            outlineColor = '#fbbf24';
            outlineWidth = 3;
          } else if (swapHighlight) {
            outlineColor = '#3b82f6';
            outlineWidth = 3;
          } else if (attackHighlight) {
            outlineColor = '#ef4444';
            outlineWidth = 3;
          } else if (
            piece.stealthed &&
            viewerSide !== 'spectator' &&
            piece.side === viewerSide &&
            !observing
          ) {
            outlineColor = '#ff69b4';
            outlineWidth = 3;
          } else if (isProtected) {
            outlineColor = '#06b6d4';
            outlineWidth = 2.5;
          } else if (piece.side === 'black') {
            outlineColor = '#fff';
            outlineWidth = 1;
          } else if (piece.side === 'white') {
            outlineColor = '#000';
            outlineWidth = 1;
          }

          if (outlineColor && outlineWidth > 0) {
            ctx.save();
            ctx.shadowColor = outlineColor;
            ctx.shadowBlur = outlineWidth;

            const offsets = [
              [-0.8, -0.8], [0, -0.8], [0.8, -0.8],
              [-0.8,  0],              [0.8,  0],
              [-0.8,  0.8], [0,  0.8], [0.8,  0.8],
            ];
            offsets.forEach(([dx, dy]) => {
              ctx.shadowOffsetX = dx;
              ctx.shadowOffsetY = dy;
              ctx.drawImage(
                tempCanvas,
                drawX - displaySize / 2,
                drawY - displaySize / 2,
                displaySize,
                displaySize,
              );
            });
            ctx.restore();
          }

          ctx.drawImage(
            tempCanvas,
            drawX - displaySize / 2,
            drawY - displaySize / 2,
            displaySize,
            displaySize,
          );
        }

        ctx.restore();
      }
      // === 其他棋子：PNG + 沿圖案發光 ===
      else {
        const { img, size: displaySize } = getImageForPiece(piece);
        if (!img) return;

        let outlineColor: string | null = null;
        let outlineWidth = 0;

        if (idx === selectedPieceIndex) {
          outlineColor = '#fbbf24';
          outlineWidth = 3;
        } else if (swapHighlight) {
          outlineColor = '#3b82f6';
          outlineWidth = 3;
        } else if (attackHighlight) {
          outlineColor = '#ef4444';
          outlineWidth = 3;
        } else if (isProtected) {
          outlineColor = '#06b6d4';
          outlineWidth = 2.5;
        } else {
          if (piece.side === 'white') {
            outlineColor = 'rgba(229, 231, 235, 0.9)';
            outlineWidth = 2;
          } else if (piece.side === 'black') {
            outlineColor = 'rgba(15, 23, 42, 0.9)';
            outlineWidth = 2;
          } else {
            outlineColor = 'rgba(168, 85, 247, 0.9)';
            outlineWidth = 2;
          }
        }

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (outlineColor && outlineWidth > 0) {
          ctx.save();
          ctx.shadowColor = outlineColor;
          ctx.shadowBlur = outlineWidth;

          const offsets = [
            [-1, -1], [0, -1], [1, -1],
            [-1,  0],         [1,  0],
            [-1,  1], [0,  1], [1,  1],
          ];

          offsets.forEach(([dx, dy]) => {
            ctx.shadowOffsetX = dx;
            ctx.shadowOffsetY = dy;
            ctx.drawImage(
              img,
              drawX - displaySize / 2,
              drawY - displaySize / 2,
              displaySize,
              displaySize,
            );
          });

          ctx.restore();
        }

        ctx.drawImage(
          img,
          drawX - displaySize / 2,
          drawY - displaySize / 2,
          displaySize,
          displaySize,
        );

        ctx.restore();
      }
    });

    // --- 守護預覽光暈 ---
    if (guardPreview) {
      const drawGuardGlow = (
        row: number,
        col: number,
        color: string,
        radius: number,
      ) => {
        const node = allNodes.find((n) => n.row === row && n.col === col);
        if (!node) return;

        const g = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);
        g.addColorStop(0, color.replace('0.9', '0.0'));
        g.addColorStop(0.4, color);
        g.addColorStop(1, color.replace('0.9', '0'));
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      };

      drawGuardGlow(
        guardPreview.paladinRow,
        guardPreview.paladinCol,
        'rgba(56, 189, 248, 0.9)',
        26,
      );
      drawGuardGlow(
        guardPreview.targetRow,
        guardPreview.targetCol,
        'rgba(250, 204, 21, 0.9)',
        26,
      );
      drawGuardGlow(
        guardPreview.attackerRow,
        guardPreview.attackerCol,
        'rgba(248, 113, 113, 0.9)',
        26,
      );
    }
  };

  // 一般重繪（非動畫）
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
    wizardHatImage,
    assassinLogoImage,
    paladinImage,
    dragonImage,
    rangerImage,
    griffinImage,
    bardImage,
    apprenticeImage,
    protectionZones,
    viewerSide,
    observing,
    guardPreview,
  ]);

  // 動畫 effect
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
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
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
  ]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * LOGICAL_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * LOGICAL_SIZE;

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
    const x = ((e.clientX - rect.left) / rect.width) * LOGICAL_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * LOGICAL_SIZE;

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
        綠=移動、藍=換位、紅=攻擊
      </p>
    </div>
  );
}
