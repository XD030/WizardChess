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
  getPieceSymbol,
  buildRows,
  buildAllNodes,
  buildAdjacency,
  NODE_RADIUS,
} from '../lib/gameLogic';
import wizardMoonImg from '../assets/wizard_moon.png';
import assassinLogoImg from '../assets/assassin_logo.png';

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

// 視角能不能看到這顆棋（刺客潛行）
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
  const [wizardHatImage, setWizardHatImage] = useState<HTMLImageElement | null>(null);
  const [assassinLogoImage, setAssassinLogoImage] = useState<HTMLImageElement | null>(null);

  const LOGICAL_SIZE = 700;

  // 載入圖片
  useEffect(() => {
    const wizardImg = new Image();
    wizardImg.src = wizardMoonImg;
    wizardImg.onload = () => setWizardHatImage(wizardImg);

    const assassinImg = new Image();
    assassinImg.src = assassinLogoImg;
    assassinImg.onload = () => setAssassinLogoImage(assassinImg);
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
    setRows(newRows);
    setAllNodes(newNodes);
  }, []);

  // 繪圖
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
    const adjacency = buildAdjacency(rows);

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

    // === 節點連線 ===
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    allNodes.forEach((node, idx) => {
      adjacency[idx].forEach((adjIdx) => {
        const adjNode = allNodes[adjIdx];
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

    // === 火焰標記 ===
    burnMarks.forEach((mark) => {
      const node = allNodes.find((n) => n.row === mark.row && n.col === mark.col);
      if (!node) return;

      const gradient2 = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 14);
      gradient2.addColorStop(0, 'rgba(255, 140, 0, 0.8)');
      gradient2.addColorStop(0.5, 'rgba(255, 69, 0, 0.6)');
      gradient2.addColorStop(1, 'rgba(255, 69, 0, 0)');
      ctx.beginPath();
      ctx.arc(node.x, node.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = gradient2;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4500';
      ctx.fill();
    });

    // === 聖光標記 ===
    holyLights.forEach((light) => {
      const node = allNodes.find((n) => n.row === light.row && n.col === light.col);
      if (!node) return;

      const gradient3 = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 16);
      gradient3.addColorStop(0, 'rgba(255, 215, 0, 0.9)');
      gradient3.addColorStop(0.5, 'rgba(255, 255, 100, 0.6)');
      gradient3.addColorStop(1, 'rgba(255, 255, 200, 0)');
      ctx.beginPath();
      ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = gradient3;
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

    // === 移動高亮（綠色圓點） ===
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

    // === 座標標籤 A~I / 1~9 ===
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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px serif';

    pieces.forEach((piece, idx) => {
      if (!isPieceVisible(piece, viewerSide, observing)) return;

      const node = allNodes.find((n) => n.row === piece.row && n.col === piece.col);
      if (!node) return;

      const swapHighlight = highlights.find(
        (h) => h.type === 'swap' && h.row === piece.row && h.col === piece.col,
      );
      const attackHighlight = highlights.find(
        (h) => h.type === 'attack' && h.row === piece.row && h.col === piece.col,
      );
      const isProtected =
        protectionZones?.some((z) => z.row === piece.row && z.col === piece.col) || false;

      const useWizardImage = piece.type === 'wizard' && wizardHatImage;
      const useAssassinImage = piece.type === 'assassin' && assassinLogoImage;

      // === 巫師圖片（只畫圖，不加外框光） ===
      if (useWizardImage && wizardHatImage) {
        const displaySize = 30;
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

          // 👉 只畫一次，不加 outline / glow
          ctx.drawImage(
            tempCanvas,
            node.x - displaySize / 2,
            node.y - displaySize / 2,
            displaySize,
            displaySize,
          );
        }

        ctx.restore();
      }
      // === 刺客圖片（只畫圖，不加外框光） ===
      else if (useAssassinImage && assassinLogoImage) {
        const displaySize = 28;
        const highResSize = 128;

        ctx.save();

        // 自己視角看到潛行刺客 → 半透明
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

          // 👉 同樣只畫一次，不加 outline / glow
          ctx.drawImage(
            tempCanvas,
            node.x - displaySize / 2,
            node.y - displaySize / 2,
            displaySize,
            displaySize,
          );
        }

        ctx.restore();
      }
      // === 其他棋子：維持原本 emoji（如果你已經改成圖片，可以自己換掉這段） ===
      else {
        const symbol = getPieceSymbol(piece.type, piece.side);

        // 這裡如果也不想要外框，可以直接把 strokeText 拔掉，只留 fillText
        ctx.lineWidth = 0; // 不要粗框
        ctx.strokeStyle = 'transparent';
        // ctx.strokeText(symbol, node.x, node.y); // <- 不再描邊

        if (piece.side === 'white') {
          ctx.fillStyle = '#fff';
        } else if (piece.side === 'black') {
          ctx.fillStyle = '#000';
        } else {
          ctx.fillStyle = '#a855f7';
        }
        ctx.fillText(symbol, node.x, node.y);
      }
    });

    // --- Guard preview glow (這個是守護預覽，不是棋子外框，可保留) ---
    if (guardPreview) {
      const drawGuardGlow = (
        row: number,
        col: number,
        color: string,
        radius: number,
      ) => {
        const node = allNodes.find((n) => n.row === row && n.col === col);
        if (!node) return;

        const gradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          radius,
        );
        gradient.addColorStop(0, color.replace('0.9', '0.0'));
        gradient.addColorStop(0.4, color);
        gradient.addColorStop(1, color.replace('0.9', '0'));

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
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
  }, [
    rows,
    allNodes,
    pieces,
    selectedPieceIndex,
    highlights,
    hoveredNode,
    burnMarks,
    holyLights,
    wizardHatImage,
    assassinLogoImage,
    protectionZones,
    viewerSide,
    observing,
    guardPreview,
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
    if (!found) {
      setHoveredNode(null);
    }
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
