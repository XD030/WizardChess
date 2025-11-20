import { useEffect, useRef, useState } from 'react';
import type { Piece, MoveHighlight, NodePosition, BurnMark } from '@shared/schema';
import { getPieceSymbol, buildRows, buildAllNodes, buildAdjacency, NODE_RADIUS, getPieceAt, getNodeCoordinate } from '@/lib/gameLogic';
import wizardMoonImg from '@assets/wizard_moon.png';
import assassinLogoImg from '@assets/assassin_logo.png';

interface GameBoardProps {
  pieces: Piece[];
  selectedPieceIndex: number;
  highlights: MoveHighlight[];
  currentPlayer: 'white' | 'black';
  onNodeClick: (row: number, col: number) => void;
  burnMarks: BurnMark[];
}

// Helper function to check if a piece should be visible to current player
function isPieceVisible(piece: Piece, currentPlayer: 'white' | 'black'): boolean {
  // Stealthed assassins are only visible to their own side
  if (piece.type === 'assassin' && piece.stealthed) {
    return piece.side === currentPlayer;
  }
  return true;
}

export default function GameBoard({ pieces, selectedPieceIndex, highlights, currentPlayer, onNodeClick, burnMarks }: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<{ row: number; col: number } | null>(null);
  const [rows, setRows] = useState<{ x: number; y: number }[][]>([]);
  const [allNodes, setAllNodes] = useState<NodePosition[]>([]);
  const [wizardHatImage, setWizardHatImage] = useState<HTMLImageElement | null>(null);
  const [assassinLogoImage, setAssassinLogoImage] = useState<HTMLImageElement | null>(null);

  const LOGICAL_SIZE = 700;

  // Load wizard moon image
  useEffect(() => {
    const wizardImg = new Image();
    wizardImg.src = wizardMoonImg;
    wizardImg.onload = () => setWizardHatImage(wizardImg);

    const assassinImg = new Image();
    assassinImg.src = assassinLogoImg;
    assassinImg.onload = () => setAssassinLogoImage(assassinImg);
  }, []);

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

    // Draw triangular cells
    const adjacency = buildAdjacency(rows);
    
    // Draw upward triangles (black) and downward triangles (white)
    for (let r = 0; r < rows.length - 1; r++) {
      const rowA = rows[r];
      const rowB = rows[r + 1];
      
      if (rowB.length === rowA.length + 1) {
        // Expanding rows - draw both black (upward) and white (downward) triangles
        for (let c = 0; c < rowA.length; c++) {
          const p1 = rowA[c];
          const p2 = { x: rowB[c].x, y: rowB[c].y };
          const p3 = { x: rowB[c + 1].x, y: rowB[c + 1].y };
          
          // Upward triangle (black) - apex at top
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
        
        // Also draw white triangles for the same region
        for (let c = 0; c < rowA.length - 1; c++) {
          const p1 = rowA[c];
          const p2 = rowA[c + 1];
          const p3 = { x: rowB[c + 1].x, y: rowB[c + 1].y };
          
          // Downward triangle (white) - apex at bottom
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
        // Contracting rows - draw both white (downward) and black (upward) triangles
        for (let c = 0; c < rowB.length; c++) {
          const p1 = rowB[c];
          const p2 = { x: rowA[c].x, y: rowA[c].y };
          const p3 = { x: rowA[c + 1].x, y: rowA[c + 1].y };
          
          // Downward triangle (white) - apex at bottom
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
        
        // Also draw black triangles for the same region
        for (let c = 0; c < rowB.length - 1; c++) {
          const p1 = rowB[c];
          const p2 = rowB[c + 1];
          const p3 = { x: rowA[c + 1].x, y: rowA[c + 1].y };
          
          // Upward triangle (black) - apex at top
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

    // Draw connections
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

    // Draw burn marks
    burnMarks.forEach((mark) => {
      const node = allNodes.find((n) => n.row === mark.row && n.col === mark.col);
      if (!node) return;
      
      // Draw a flame effect - orange glowing circle
      const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 14);
      gradient.addColorStop(0, 'rgba(255, 140, 0, 0.8)'); // Orange center
      gradient.addColorStop(0.5, 'rgba(255, 69, 0, 0.6)'); // Red-orange
      gradient.addColorStop(1, 'rgba(255, 69, 0, 0)'); // Transparent edge
      
      ctx.beginPath();
      ctx.arc(node.x, node.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Add a small red dot in the center
      ctx.beginPath();
      ctx.arc(node.x, node.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4500';
      ctx.fill();
    });

    // Draw move highlights (only for empty squares)
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

    // Draw coordinate labels
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    
    // Row labels (A-I) on the right side, rows 0-8
    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    
    rowLabels.forEach((label, rowIdx) => {
      if (rowIdx < rows.length && rowIdx <= 8) {
        const rightNode = rows[rowIdx][rows[rowIdx].length - 1];
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, rightNode.x + 10, rightNode.y - 5);
      }
    });
    
    // Column labels (1-9) on the left side, rows 0-8
    const colLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    
    colLabels.forEach((label, rowIdx) => {
      if (rowIdx < rows.length && rowIdx <= 8) {
        const leftNode = rows[rowIdx][0];
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, leftNode.x - 10, leftNode.y - 5);
      }
    });

    // Draw pieces
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px serif';

    pieces.forEach((piece, idx) => {
      // Skip drawing enemy stealthed assassins
      if (!isPieceVisible(piece, currentPlayer)) {
        return;
      }
      
      const node = allNodes.find((n) => n.row === piece.row && n.col === piece.col);
      if (!node) return;

      // Check if this piece is a swap or attack target
      const swapHighlight = highlights.find((h) => h.type === 'swap' && h.row === piece.row && h.col === piece.col);
      const attackHighlight = highlights.find((h) => h.type === 'attack' && h.row === piece.row && h.col === piece.col);

      // Determine if we should use image or symbol
      const useWizardImage = piece.type === 'wizard' && wizardHatImage;
      const useAssassinImage = piece.type === 'assassin' && assassinLogoImage;
      
      if (useWizardImage) {
        // Draw wizard moon image with high quality
        const displaySize = 30; // Smaller size for wizard
        const highResSize = 128; // Use higher resolution for better quality
        ctx.save();
        
        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Create high-res temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = highResSize;
        tempCanvas.height = highResSize;
        const tempCtx = tempCanvas.getContext('2d', { alpha: true });
        
        if (tempCtx) {
          tempCtx.imageSmoothingEnabled = true;
          tempCtx.imageSmoothingQuality = 'high';
          
          // Draw image at high resolution
          tempCtx.drawImage(wizardHatImage, 0, 0, highResSize, highResSize);
          
          // Get image data and process
          const imageData = tempCtx.getImageData(0, 0, highResSize, highResSize);
          const data = imageData.data;
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const alpha = data[i + 3];
            
            // Remove light gray/white pixels (anti-aliasing artifacts)
            // Only keep dark pixels (the actual moon shape)
            if (alpha > 0) {
              // If pixel is too light (gray/white edge), make it transparent
              const brightness = (r + g + b) / 3;
              if (brightness > 50) {
                data[i + 3] = 0; // Make transparent
              } else {
                // Apply color based on piece side
                if (piece.side === 'white') {
                  // White moon - invert to white
                  data[i] = 255 - data[i];
                  data[i + 1] = 255 - data[i + 1];
                  data[i + 2] = 255 - data[i + 2];
                } else if (piece.side === 'neutral') {
                  // Purple moon
                  data[i] = Math.min(255, data[i] * 0.6 + 168);
                  data[i + 1] = Math.min(255, data[i + 1] * 0.3 + 85);
                  data[i + 2] = Math.min(255, data[i + 2] * 0.6 + 247);
                } else {
                  // Black moon - force pure black
                  data[i] = 0;
                  data[i + 1] = 0;
                  data[i + 2] = 0;
                }
              }
            }
          }
          
          tempCtx.putImageData(imageData, 0, 0);
          
          // Determine outline color and width
          let outlineColor = null;
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
          } else if (piece.side === 'black') {
            // Black moon gets white outline in normal state
            outlineColor = '#fff';
            outlineWidth = 1;
          }
          // White and neutral moons have no outline in normal state
          
          // Draw fine outline
          if (outlineColor && outlineWidth > 0) {
            ctx.save();
            
            // Use shadow for subtle outline
            ctx.shadowColor = outlineColor;
            ctx.shadowBlur = 0;
            
            const offsets = [
              [-0.8, -0.8], [0, -0.8], [0.8, -0.8],
              [-0.8, 0],                [0.8, 0],
              [-0.8, 0.8],  [0, 0.8],   [0.8, 0.8]
            ];
            
            offsets.forEach(([dx, dy]) => {
              ctx.shadowOffsetX = dx;
              ctx.shadowOffsetY = dy;
              ctx.drawImage(tempCanvas, node.x - displaySize / 2, node.y - displaySize / 2, displaySize, displaySize);
            });
            
            ctx.restore();
          }
          
          // Draw main image on top
          ctx.drawImage(tempCanvas, node.x - displaySize / 2, node.y - displaySize / 2, displaySize, displaySize);
        }
        
        ctx.restore();
      } else if (useAssassinImage) {
        // Draw assassin logo - remove white background, keep only dark pattern
        const displaySize = 28;
        const highResSize = 128;
        ctx.save();
        
        // Apply transparency for stealthed assassins (visible to own side only)
        if (piece.stealthed && piece.side === currentPlayer) {
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
            
            // Remove white/light background - only keep dark pixels
            if (brightness > 128) {
              // Make light pixels transparent
              data[i + 3] = 0;
            } else {
              // Keep dark pixels and colorize based on side
              if (piece.side === 'white') {
                // White assassin - make it white
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
              } else {
                // Black assassin - keep it black
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
              }
            }
          }
          
          tempCtx.putImageData(imageData, 0, 0);
          
          // Determine outline color and width
          let outlineColor = null;
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
          } else if (piece.stealthed && piece.side === currentPlayer) {
            // Different purple shades for black vs white stealthed assassins
            if (piece.side === 'black') {
              outlineColor = '#f0abfc'; // Brighter pink-purple for black assassins
            } else {
              outlineColor = '#c084fc'; // Bright purple for white assassins
            }
            outlineWidth = 2.5;
          } else if (piece.side === 'black') {
            outlineColor = '#fff';
            outlineWidth = 1;
          } else if (piece.side === 'white') {
            outlineColor = '#000';
            outlineWidth = 1;
          }
          
          // Draw outline if needed
          if (outlineColor && outlineWidth > 0) {
            ctx.save();
            ctx.shadowColor = outlineColor;
            ctx.shadowBlur = 0;
            
            const offsets = [
              [-0.8, -0.8], [0, -0.8], [0.8, -0.8],
              [-0.8, 0],                [0.8, 0],
              [-0.8, 0.8],  [0, 0.8],   [0.8, 0.8]
            ];
            
            offsets.forEach(([dx, dy]) => {
              ctx.shadowOffsetX = dx;
              ctx.shadowOffsetY = dy;
              ctx.drawImage(tempCanvas, node.x - displaySize / 2, node.y - displaySize / 2, displaySize, displaySize);
            });
            
            ctx.restore();
          }
          
          // Draw main image
          ctx.drawImage(tempCanvas, node.x - displaySize / 2, node.y - displaySize / 2, displaySize, displaySize);
        }
        
        ctx.restore();
      } else {
        // Draw chess symbol for other pieces
        const symbol = getPieceSymbol(piece.type, piece.side);
        
        // Determine outline color based on highlight state
        let outlineColor = '#000';
        let outlineWidth = 1.2;
        
        if (idx === selectedPieceIndex) {
          outlineColor = '#fbbf24';
          outlineWidth = 2.5;
        } else if (swapHighlight) {
          outlineColor = '#3b82f6';
          outlineWidth = 2.5;
        } else if (attackHighlight) {
          outlineColor = '#ef4444';
          outlineWidth = 2.5;
        } else {
          if (piece.side === 'white') {
            outlineColor = '#000';
          } else if (piece.side === 'black') {
            outlineColor = '#fff';
          } else {
            outlineColor = '#000';
          }
        }
        
        // Draw piece with appropriate color
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = outlineWidth;
        ctx.strokeText(symbol, node.x, node.y);
        
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
  }, [rows, allNodes, pieces, selectedPieceIndex, highlights, hoveredNode, burnMarks, wizardHatImage, assassinLogoImage]);

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
        綠=移動、藍=換位、紅=攻擊
      </p>
    </div>
  );
}
