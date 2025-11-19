import { useEffect, useRef, useState } from 'react';
import type { Piece, MoveHighlight, NodePosition } from '@shared/schema';
import { PIECE_EMOJI, buildRows, buildAllNodes, buildAdjacency, NODE_RADIUS, getPieceAt } from '@/lib/gameLogic';

interface GameBoardProps {
  pieces: Piece[];
  selectedPieceIndex: number;
  highlights: MoveHighlight[];
  currentPlayer: 'white' | 'black';
  onNodeClick: (row: number, col: number) => void;
}

export default function GameBoard({ pieces, selectedPieceIndex, highlights, currentPlayer, onNodeClick }: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<{ row: number; col: number } | null>(null);
  const [rows, setRows] = useState<{ x: number; y: number }[][]>([]);
  const [allNodes, setAllNodes] = useState<NodePosition[]>([]);

  const LOGICAL_SIZE = 700;

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    // Draw gradient background
    const gradient = ctx.createRadialGradient(
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE / 2,
      0,
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE / 2,
      LOGICAL_SIZE * 0.7
    );
    gradient.addColorStop(0, 'hsl(222, 47%, 7%)');
    gradient.addColorStop(1, 'hsl(222, 47%, 4%)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    // Draw connections
    const adjacency = buildAdjacency(rows);
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

    // Draw nodes
    allNodes.forEach((node) => {
      const isHovered = hoveredNode?.row === node.row && hoveredNode?.col === node.col;
      ctx.beginPath();
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.2)';
      ctx.fill();
    });

    // Draw highlights
    highlights.forEach((h) => {
      const node = allNodes.find((n) => n.row === h.row && n.col === h.col);
      if (!node) return;

      const isHovered = hoveredNode?.row === h.row && hoveredNode?.col === h.col;
      const opacity = isHovered ? 0.7 : 0.5;

      ctx.beginPath();
      ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
      
      if (h.type === 'move') {
        ctx.fillStyle = `rgba(16, 185, 129, ${opacity})`;
      } else if (h.type === 'swap') {
        ctx.fillStyle = `rgba(251, 191, 36, ${opacity})`;
      } else {
        // Attack - use brighter red with higher opacity
        ctx.fillStyle = `rgba(239, 68, 68, ${opacity + 0.1})`;
      }
      ctx.fill();
      
      // Add outline for attack targets to make them more visible
      if (h.type === 'attack') {
        ctx.strokeStyle = `rgba(239, 68, 68, ${opacity + 0.3})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw pieces
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '32px sans-serif';

    pieces.forEach((piece, idx) => {
      const node = allNodes.find((n) => n.row === piece.row && n.col === piece.col);
      if (!node) return;

      // Background circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
      if (piece.side === 'white') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      } else if (piece.side === 'black') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      } else {
        ctx.fillStyle = 'rgba(124, 58, 237, 0.2)';
      }
      ctx.fill();

      // Selection ring
      if (idx === selectedPieceIndex) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Emoji
      ctx.fillStyle = '#fff';
      ctx.fillText(PIECE_EMOJI[piece.type], node.x, node.y);
    });
  }, [rows, allNodes, pieces, selectedPieceIndex, highlights, hoveredNode]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * LOGICAL_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * LOGICAL_SIZE;

    // Find clicked node
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
        綠=移動、黃=換位、紅=攻擊
      </p>
    </div>
  );
}
