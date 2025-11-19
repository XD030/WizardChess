import type { Piece, PieceType, Side, NodePosition, MoveHighlight } from '@shared/schema';

// Chess piece symbols (white/black versions)
export const PIECE_SYMBOLS: Record<PieceType, { white: string; black: string }> = {
  wizard: { white: '♕', black: '♛' },      // Queen
  apprentice: { white: '♙', black: '♟' },  // Pawn
  dragon: { white: '♖', black: '♜' },      // Rook
  ranger: { white: '♘', black: '♞' },      // Knight
  paladin: { white: '♗', black: '♝' },     // Bishop
  assassin: { white: '♘', black: '♞' },    // Knight (alternative)
  bard: { white: '♔', black: '♚' },        // King
};

export function getPieceSymbol(type: PieceType, side: Side): string {
  if (side === 'neutral') return PIECE_SYMBOLS[type].white;
  return PIECE_SYMBOLS[type][side];
}

export const PIECE_CHINESE: Record<PieceType, string> = {
  wizard: '巫師',
  apprentice: '學徒',
  dragon: '龍',
  ranger: '遊俠',
  paladin: '聖騎士',
  assassin: '刺客',
  bard: '吟遊詩人',
};

export const SIDE_CHINESE: Record<Side, string> = {
  white: '白方',
  black: '黑方',
  neutral: '中立',
};

export const PIECE_DESCRIPTIONS: Record<PieceType, { name: string; move: string[]; ability: string[] }> = {
  wizard: {
    name: '《巫師》',
    move: ['沿節點連線移動 1 節點。'],
    ability: [
      '導線是指能跟另一棋子連結且中間無其他節點，可轉換方向。',
      '可透過己方學徒或吟遊詩人建立導線，若導線能連接至敵方棋子，即可擊殺該棋子，距離不限，遇第一個敵方棋子為止。',
      '可與任意己方學徒無距離換位。',
    ],
  },
  apprentice: {
    name: '《學徒》',
    move: ['僅能朝敵方方向，沿節點連線移動 1 節點。'],
    ability: [
      '可與相鄰己方棋子交換位置。',
      '為巫師導線的導體，可傳遞導線至其他學徒或吟遊詩人。',
    ],
  },
  dragon: {
    name: '《龍》',
    move: ['沿任意直線方向前進，距離不限，不可轉換方向或穿越其他棋子。'],
    ability: [
      '碰到潛行刺客會擊殺。',
      '經過的節點留下灼痕。',
      '灼痕雙方都無法停留，可穿越。',
    ],
  },
  ranger: {
    name: '《遊俠》',
    move: ['像跳棋一樣移動，可以連跳最多兩次，跳過的棋子不受影響。', '若無棋子可跳則改為沿節點連線移動 1 節點。'],
    ability: ['落點若有敵人則擊殺。', '無法跳過或穿越聖光。'],
  },
  paladin: {
    name: '《聖騎士》',
    move: ['沿節點連線移動 1 節點（之後補完）'],
    ability: ['守護與聖光效果將之後加入。'],
  },
  assassin: {
    name: '《刺客》',
    move: ['沿平行四邊形對角移動（之後補完）。'],
    ability: ['潛行與顯形機制之後加入。'],
  },
  bard: {
    name: '《吟遊詩人》',
    move: ['無法主動移動，只能換位（之後補完）。'],
    ability: ['可作為巫師導線的一部分。'],
  },
};

// Board geometry
export const N = 8;
export const STEP = 40;
export const VSTEP = STEP * 0.5;
export const NODE_RADIUS = 4;

export function buildRows(W: number, H: number): { x: number; y: number }[][] {
  const CX = W / 2;
  const CY = H / 2;
  const rows: { x: number; y: number }[][] = [];

  for (let i = 0; i <= 2 * N; i++) {
    const level = i;
    const count = level <= N ? level + 1 : 2 * N + 1 - level;
    const y = (level - N) * VSTEP;
    const xStart = -(count - 1) * STEP / 2;

    const row: { x: number; y: number }[] = [];
    for (let j = 0; j < count; j++) {
      const x = xStart + j * STEP;
      row.push({ x: CX + x, y: CY + y });
    }
    rows.push(row);
  }

  return rows;
}

export function buildAllNodes(rows: { x: number; y: number }[][]): NodePosition[] {
  const allNodes: NodePosition[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    for (let ci = 0; ci < rows[ri].length; ci++) {
      const p = rows[ri][ci];
      allNodes.push({ x: p.x, y: p.y, row: ri, col: ci });
    }
  }
  return allNodes;
}

// Get coordinate label for a node
// Treat the diamond as a rotated 9×9 square
// Files A-I (x-axis): diagonal columns from bottom-left to top-right
// Ranks 1-9 (y-axis): diagonal rows from top-left to bottom-right
export function getNodeCoordinate(row: number, col: number): string {
  // Transform (row, col) to rotated square coordinates (x, y)
  let x: number;
  let y: number;
  
  if (row <= 8) {
    // Upper half: expanding rows
    x = col;
    y = row - col;
  } else {
    // Lower half: contracting rows
    const offset = row - 8;
    x = col + offset;
    y = 8 - col;
  }
  
  // File letter: A-I (x: 0-8)
  const file = String.fromCharCode(65 + x);
  // Rank number: 1-9 (y: 0-8, but we want 1-9)
  const rank = y + 1;
  
  return `${file}${rank}`;
}

export function buildAdjacency(rows: { x: number; y: number }[][]): number[][] {
  const rcToIndex: Record<string, number> = {};
  let idx = 0;
  for (let ri = 0; ri < rows.length; ri++) {
    for (let ci = 0; ci < rows[ri].length; ci++) {
      rcToIndex[`${ri},${ci}`] = idx++;
    }
  }

  const adjacency: number[][] = new Array(idx).fill(0).map(() => []);

  const connectAdj = (r1: number, c1: number, r2: number, c2: number) => {
    const i1 = rcToIndex[`${r1},${c1}`];
    const i2 = rcToIndex[`${r2},${c2}`];
    if (i1 === undefined || i2 === undefined) return;
    adjacency[i1].push(i2);
    adjacency[i2].push(i1);
  };

  // Same row connections
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length - 1; c++) {
      connectAdj(r, c, r, c + 1);
    }
  }

  // Cross-row connections
  for (let r = 0; r < rows.length - 1; r++) {
    const rowA = rows[r];
    const rowB = rows[r + 1];

    if (rowB.length === rowA.length + 1) {
      for (let c = 0; c < rowA.length; c++) {
        connectAdj(r, c, r + 1, c);
        connectAdj(r, c, r + 1, c + 1);
      }
    } else if (rowA.length === rowB.length + 1) {
      for (let c = 0; c < rowB.length; c++) {
        connectAdj(r + 1, c, r, c);
        connectAdj(r + 1, c, r, c + 1);
      }
    }
  }

  return adjacency;
}

export function getInitialPieces(): Piece[] {
  const whiteBasePieces: Pick<Piece, 'type' | 'row' | 'col'>[] = [
    { type: 'wizard', row: 16, col: 0 },
    { type: 'dragon', row: 14, col: 1 },
    { type: 'ranger', row: 13, col: 0 },
    { type: 'ranger', row: 13, col: 3 },
    { type: 'paladin', row: 13, col: 1 },
    { type: 'paladin', row: 13, col: 2 },
    { type: 'assassin', row: 12, col: 1 },
    { type: 'assassin', row: 12, col: 3 },
    { type: 'apprentice', row: 10, col: 0 },
    { type: 'apprentice', row: 10, col: 1 },
    { type: 'apprentice', row: 10, col: 2 },
    { type: 'apprentice', row: 10, col: 3 },
    { type: 'apprentice', row: 10, col: 4 },
    { type: 'apprentice', row: 10, col: 5 },
    { type: 'apprentice', row: 10, col: 6 },
  ];

  const pieces: Piece[] = [];

  // White pieces
  for (const p of whiteBasePieces) {
    pieces.push({ ...p, side: 'white' });
  }

  // Black pieces (mirrored)
  for (const p of whiteBasePieces) {
    pieces.push({
      type: p.type,
      side: 'black',
      row: 2 * N - p.row,
      col: p.col,
    });
  }

  // Bard (neutral, center)
  pieces.push({
    type: 'bard',
    side: 'neutral',
    row: 8,
    col: 4,
  });

  return pieces;
}

export function getPieceAt(pieces: Piece[], row: number, col: number): number {
  return pieces.findIndex((p) => p.row === row && p.col === col);
}

export function calculateWizardMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[]
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  
  if (nodeIdx === -1) return highlights;

  // 1-step moves
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPiece = getPieceAt(pieces, adjNode.row, adjNode.col);
    if (targetPiece === -1) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    }
  }

  // Swap with apprentices
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.side === piece.side && p.type === 'apprentice') {
      highlights.push({ type: 'swap', row: p.row, col: p.col });
    }
  }

  // Line-of-sight attacks through apprentices/bard
  const visited = new Set<number>();
  const queue: { nodeIdx: number; path: number[] }[] = [{ nodeIdx, path: [nodeIdx] }];
  visited.add(nodeIdx);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const adjIdx of adjacency[current.nodeIdx]) {
      if (visited.has(adjIdx)) continue;

      const adjNode = allNodes[adjIdx];
      const targetPieceIdx = getPieceAt(pieces, adjNode.row, adjNode.col);

      if (targetPieceIdx === -1) continue;

      const targetPiece = pieces[targetPieceIdx];

      if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral') {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      } else if (
        targetPiece.side === piece.side &&
        (targetPiece.type === 'apprentice' || targetPiece.type === 'bard')
      ) {
        visited.add(adjIdx);
        queue.push({ nodeIdx: adjIdx, path: [...current.path, adjIdx] });
      }
    }
  }

  return highlights;
}

export function calculateApprenticeMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[]
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  
  if (nodeIdx === -1) return highlights;

  // 1-step moves to adjacent nodes (only towards enemy direction)
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    
    // White pieces move towards smaller row numbers (up the board)
    // Black pieces move towards larger row numbers (down the board)
    const isValidDirection = piece.side === 'white' 
      ? adjNode.row < piece.row 
      : adjNode.row > piece.row;
    
    if (!isValidDirection) continue;
    
    const targetPieceIdx = getPieceAt(pieces, adjNode.row, adjNode.col);
    if (targetPieceIdx === -1) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else {
      // Can attack enemy pieces in forward direction
      const targetPiece = pieces[targetPieceIdx];
      if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral') {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  // Swap with adjacent friendly pieces
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getPieceAt(pieces, adjNode.row, adjNode.col);
    
    if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (targetPiece.side === piece.side) {
        highlights.push({ type: 'swap', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  return highlights;
}

// Calculate ranger moves - checker-style jumps up to 2 times
export function calculateRangerMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[]
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  
  if (nodeIdx === -1) return highlights;

  // Track visited positions to avoid infinite loops
  const visitedPositions = new Set<string>();
  visitedPositions.add(`${piece.row},${piece.col}`);

  // BFS to find all possible jump destinations (max 2 jumps)
  interface JumpState {
    nodeIdx: number;
    jumpsCount: number;
    path: number[]; // Path of node indices
  }

  const queue: JumpState[] = [{ nodeIdx, jumpsCount: 0, path: [nodeIdx] }];
  const jumpDestinations = new Map<string, JumpState>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentNode = allNodes[current.nodeIdx];

    // Try to jump in each direction
    for (const adjIdx of adjacency[current.nodeIdx]) {
      const adjNode = allNodes[adjIdx];
      const pieceAtAdj = getPieceAt(pieces, adjNode.row, adjNode.col);

      // If there's a piece at adjacent position, try to jump over it
      // Exception: Cannot jump over unactivated bards
      if (pieceAtAdj !== -1) {
        const adjacentPiece = pieces[pieceAtAdj];
        
        // Skip if it's an unactivated bard
        if (adjacentPiece.type === 'bard' && !adjacentPiece.activated) {
          continue;
        }
        
        // Find the node in the same direction after jumping
        const jumpTarget = findJumpTarget(current.nodeIdx, adjIdx, adjacency, allNodes);
        
        if (jumpTarget !== -1) {
          const jumpNode = allNodes[jumpTarget];
          const posKey = `${jumpNode.row},${jumpNode.col}`;
          
          // Check if jump destination is valid
          const pieceAtJump = getPieceAt(pieces, jumpNode.row, jumpNode.col);
          
          // Can only land on empty space or enemy piece
          if (pieceAtJump === -1 || (pieceAtJump !== -1 && pieces[pieceAtJump].side !== piece.side && pieces[pieceAtJump].side !== 'neutral')) {
            if (!visitedPositions.has(posKey)) {
              visitedPositions.add(posKey);
              const newState = {
                nodeIdx: jumpTarget,
                jumpsCount: current.jumpsCount + 1,
                path: [...current.path, jumpTarget]
              };

              // Record this as a valid jump destination
              if (!jumpDestinations.has(posKey) || jumpDestinations.get(posKey)!.jumpsCount > newState.jumpsCount) {
                jumpDestinations.set(posKey, newState);
              }

              // If we can still jump (less than 2 jumps), continue exploring
              if (newState.jumpsCount < 2 && pieceAtJump === -1) {
                queue.push(newState);
              }
            }
          }
        }
      }
    }
  }

  // Add jump destinations to highlights
  Array.from(jumpDestinations.entries()).forEach(([posKey, state]) => {
    const [row, col] = posKey.split(',').map(Number);
    const pieceAtDest = getPieceAt(pieces, row, col);
    
    if (pieceAtDest === -1) {
      highlights.push({ type: 'move', row, col });
    } else {
      // Enemy piece - can attack
      highlights.push({ type: 'attack', row, col });
    }
  });

  // If no jumps available, allow simple 1-step move to adjacent empty nodes
  if (jumpDestinations.size === 0) {
    for (const adjIdx of adjacency[nodeIdx]) {
      const adjNode = allNodes[adjIdx];
      const targetPieceIdx = getPieceAt(pieces, adjNode.row, adjNode.col);
      
      if (targetPieceIdx === -1) {
        highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
      } else {
        // Can attack enemy
        const targetPiece = pieces[targetPieceIdx];
        if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral') {
          highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
        }
      }
    }
  }

  return highlights;
}

// Helper function to find jump target node
function findJumpTarget(
  fromIdx: number,
  overIdx: number,
  adjacency: number[][],
  allNodes: NodePosition[]
): number {
  const fromNode = allNodes[fromIdx];
  const overNode = allNodes[overIdx];
  
  // Calculate direction vector
  const dRow = overNode.row - fromNode.row;
  const dCol = overNode.col - fromNode.col;
  
  // Expected landing position
  const landRow = overNode.row + dRow;
  const landCol = overNode.col + dCol;
  
  // Find landing node among adjacent nodes of overNode
  for (const adjIdx of adjacency[overIdx]) {
    const adjNode = allNodes[adjIdx];
    if (adjNode.row === landRow && adjNode.col === landCol) {
      return adjIdx;
    }
  }
  
  return -1; // No valid landing spot
}

// Calculate dragon moves - straight lines in any direction
export function calculateDragonMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  burnMarks: { row: number; col: number }[]
): { highlights: MoveHighlight[]; pathNodes: { row: number; col: number }[] } {
  const highlights: MoveHighlight[] = [];
  // Don't record path nodes during move calculation - we'll calculate them when a move is selected
  const pathNodes: { row: number; col: number }[] = [];
  
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  if (nodeIdx === -1) return { highlights, pathNodes };

  // For each adjacent direction, follow the straight line
  for (const firstAdjIdx of adjacency[nodeIdx]) {
    const direction = {
      from: nodeIdx,
      to: firstAdjIdx,
    };
    
    let currentIdx = nodeIdx;
    let nextIdx = firstAdjIdx;
    
    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];
      const targetPieceIdx = getPieceAt(pieces, nextNode.row, nextNode.col);
      const hasBurnMark = burnMarks.some(b => b.row === nextNode.row && b.col === nextNode.col);
      
      // If there's a piece at this position
      if (targetPieceIdx !== -1) {
        const targetPiece = pieces[targetPieceIdx];
        
        // Can attack enemy pieces (including assassins)
        if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral') {
          highlights.push({ type: 'attack', row: nextNode.row, col: nextNode.col });
        }
        
        // Stop - cannot pass through pieces
        break;
      }
      
      // If there's a burn mark, can pass through but cannot stop
      if (hasBurnMark) {
        // Continue in the same direction
        currentIdx = nextIdx;
        nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
        continue;
      }
      
      // Empty space - can move here
      highlights.push({ type: 'move', row: nextNode.row, col: nextNode.col });
      
      // Continue in the same direction
      currentIdx = nextIdx;
      nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
    }
  }
  
  return { highlights, pathNodes };
}

// Calculate the path from dragon's current position to a target position
export function calculateDragonPath(
  startRow: number,
  startCol: number,
  targetRow: number,
  targetCol: number,
  adjacency: number[][],
  allNodes: NodePosition[]
): { row: number; col: number }[] {
  const path: { row: number; col: number }[] = [];
  
  const startIdx = allNodes.findIndex((n) => n.row === startRow && n.col === startCol);
  const targetIdx = allNodes.findIndex((n) => n.row === targetRow && n.col === targetCol);
  
  if (startIdx === -1 || targetIdx === -1) return path;
  
  // Find which direction from start leads to target
  for (const firstAdjIdx of adjacency[startIdx]) {
    const direction = {
      from: startIdx,
      to: firstAdjIdx,
    };
    
    let currentIdx = startIdx;
    let nextIdx = firstAdjIdx;
    const currentPath: { row: number; col: number }[] = [];
    
    // Follow this direction until we find target or reach the end
    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];
      currentPath.push({ row: nextNode.row, col: nextNode.col });
      
      // Found the target!
      if (nextNode.row === targetRow && nextNode.col === targetCol) {
        return currentPath;
      }
      
      // Continue in the same direction
      currentIdx = nextIdx;
      nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
    }
  }
  
  return path;
}

// Helper function to find the next node in the same direction
function findNextInDirection(
  currentIdx: number,
  direction: { from: number; to: number },
  adjacency: number[][],
  allNodes: NodePosition[]
): number {
  const currentNode = allNodes[currentIdx];
  const directionNode = allNodes[direction.to];
  const fromNode = allNodes[direction.from];
  
  // Calculate direction vector
  const dRow = directionNode.row - fromNode.row;
  const dCol = directionNode.col - fromNode.col;
  
  // Expected next position
  const nextRow = currentNode.row + dRow;
  const nextCol = currentNode.col + dCol;
  
  // Find node at expected position among adjacent nodes
  for (const adjIdx of adjacency[currentIdx]) {
    const adjNode = allNodes[adjIdx];
    if (adjNode.row === nextRow && adjNode.col === nextCol) {
      return adjIdx;
    }
  }
  
  return -1; // No valid next node in this direction
}
