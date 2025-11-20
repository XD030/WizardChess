import type { Piece, PieceType, Side, NodePosition, MoveHighlight, HolyLight, BurnMark } from '@shared/schema';

// Chess piece symbols (white/black versions)
export const PIECE_SYMBOLS: Record<PieceType, { white: string; black: string }> = {
  wizard: { white: '♕', black: '♛' },      // Queen
  apprentice: { white: '♙', black: '♟' },  // Pawn
  dragon: { white: '♖', black: '♜' },      // Rook
  ranger: { white: '♘', black: '♞' },      // Knight
  paladin: { white: '♗', black: '♝' },     // Bishop
  assassin: { white: '♘', black: '♞' },    // Knight (alternative)
  bard: { white: '♔', black: '♚' },        // King
  griffin: { white: '♖', black: '♜' },     // Rook (alternative)
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
  griffin: '獅鷲',
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
    move: [
      '沿節點連線移動 1 節點。',
      '可攻擊相鄰的敵方棋子。',
    ],
    ability: [
      '炮攻擊：沿棋盤直線（file、rank 或對角線）找到第一個棋子（無視距離），跳過該棋子，繼續搜索第一個敵方棋子並攻擊。',
      '可跳過任何棋子（己方、敵方、中立），但不能跳過未激活的吟遊詩人。',
      '類似象棋的炮，隔山打牛。',
    ],
  },
  paladin: {
    name: '《聖騎士》',
    move: ['沿節點連線移動 1 節點（之後補完）'],
    ability: ['守護與聖光效果將之後加入。'],
  },
  assassin: {
    name: '《刺客》',
    move: ['沿相鄰黑白三角形組成的平行四邊形對角點移動。'],
    ability: [
      '黑方刺客：白→黑潛行，黑→白現形。',
      '白方刺客：黑→白潛行，白→黑現形。',
      '潛行時敵方看不見其位置，可被龍或獅鷲踩殺。',
      '不論潛行與否，落點若有敵人即擊殺。',
      '若進入或停留在聖騎士守護區或交換位置，立即現形。',
    ],
  },
  bard: {
    name: '《吟遊詩人》',
    move: [
      '以跳棋方式移動：可跳過任何棋子（敵我皆可）抵達其後方的空位。',
      '可連續跳多次，落點必須是空位。',
      '也可以單步移動到相鄰節點（無論空位或敵方棋子）。'
    ],
    ability: [
      '無法被擊殺：任何攻擊都無效。',
      '激活機制：當任意棋子被吃掉時，所有吟遊詩人被激活（可移動）。',
      '強制交換：移動後必須與己方棋子（除吟遊詩人和龍外）交換位置。',
      '可作為巫師導線的一部分。'
    ],
  },
  griffin: {
    name: '《獅鷲》',
    move: [
      '沿橫向直線方向（rank 恆定）前進，距離不限，不可轉換方向或穿越其他棋子。',
      '或者沿對角線方向（file 和 rank 同時增減）移動 1 節點。',
    ],
    ability: ['碰到潛行刺客會擊殺。'],
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

// Determine if a node is on a black or white triangle
// Black triangles: upward pointing (apex at top)
// White triangles: downward pointing (apex at bottom)
export function isBlackTriangle(row: number, col: number): boolean {
  // Diamond board has a checkerboard pattern of black and white triangles
  // Black triangles: (row + col) is odd
  // White triangles: (row + col) is even
  // This creates a consistent alternating pattern across the entire board
  return (row + col) % 2 === 1;
}

// Update assassin stealth state based on movement direction only
// Should be called whenever an assassin moves to a new position
// Rule: Use rotated coordinate system (file x, rank y)
// Black assassin:
// - If Δx + Δy = 1: Enter stealth (moving into black triangle, white→black)
// - If Δx + Δy = -1: Reveal (moving into white triangle, black→white)
// White assassin (opposite):
// - If Δx + Δy = -1: Enter stealth (moving into white triangle, black→white)
// - If Δx + Δy = 1: Reveal (moving into black triangle, white→black)
// - Otherwise: Maintain current state
// Note: Protection zone reveals are handled separately via revealAssassinsInProtectionZones
export function updateAssassinStealth(
  piece: Piece,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number
): Piece {
  if (piece.type !== 'assassin') {
    return piece;
  }
  
  // Get rotated coordinates (file x, rank y)
  const fromCoords = getRotatedCoords(fromRow, fromCol);
  const toCoords = getRotatedCoords(toRow, toCol);
  
  // Calculate movement delta
  const deltaX = toCoords.x - fromCoords.x;
  const deltaY = toCoords.y - fromCoords.y;
  const deltaSum = deltaX + deltaY;
  
  // White assassin has opposite stealth logic
  if (piece.side === 'white') {
    // Δx + Δy = -1: Enter stealth (black→white)
    if (deltaSum === -1) {
      return { ...piece, stealthed: true };
    }
    
    // Δx + Δy = 1: Reveal (white→black)
    if (deltaSum === 1) {
      return { ...piece, stealthed: false };
    }
  } else {
    // Black assassin uses normal logic
    // Δx + Δy = 1: Enter stealth (white→black)
    if (deltaSum === 1) {
      return { ...piece, stealthed: true };
    }
    
    // Δx + Δy = -1: Reveal (black→white)
    if (deltaSum === -1) {
      return { ...piece, stealthed: false };
    }
  }
  
  // Otherwise: Maintain current state
  return piece;
}

// Check if a position has an enemy holy light that blocks the piece
// Holy lights only allow the creating side to pass through/stop
export function hasEnemyHolyLight(
  row: number,
  col: number,
  pieceSide: Side,
  holyLights: HolyLight[]
): boolean {
  return holyLights.some(light => 
    light.row === row && 
    light.col === col && 
    light.createdBy !== pieceSide &&
    light.createdBy !== 'neutral'
  );
}

// Check if a piece can occupy a node (considering holy lights)
export function canOccupyNode(
  row: number,
  col: number,
  pieceSide: Side,
  holyLights: HolyLight[],
  burnMarks: { row: number; col: number }[] = []
): boolean {
  // Cannot occupy positions with burn marks
  const hasBurnMark = burnMarks.some(b => b.row === row && b.col === col);
  if (hasBurnMark) {
    console.log(`🔥 Burn mark blocking position (${row}, ${col}). BurnMarks:`, burnMarks);
    return false;
  }
  
  return !hasEnemyHolyLight(row, col, pieceSide, holyLights);
}

// Filter move highlights to remove positions blocked by enemy holy lights and burn marks
export function filterHighlightsForHolyLight(
  piece: Piece,
  highlights: MoveHighlight[],
  holyLights: HolyLight[],
  burnMarks: { row: number; col: number }[] = []
): MoveHighlight[] {
  return highlights.filter(h => canOccupyNode(h.row, h.col, piece.side, holyLights, burnMarks));
}

// Reveal stealthed assassins in a specific protection zone
// Used when a paladin is selected to reveal only the enemy assassins in that paladin's protection zone
export function revealAssassinsInSpecificZone(
  pieces: Piece[],
  protectionZone: { row: number; col: number }[],
  paladinSide: Side
): Piece[] {
  const enemySide = paladinSide === 'white' ? 'black' : 'white';
  
  return pieces.map((piece) => {
    if (piece.type === 'assassin' && piece.stealthed && piece.side === enemySide) {
      const isInZone = protectionZone.some(zone => zone.row === piece.row && zone.col === piece.col);
      if (isInZone) {
        return { ...piece, stealthed: false };
      }
    }
    return piece;
  });
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
    { type: 'griffin', row: 12, col: 2 },
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
    const piece: Piece = { ...p, side: 'white' };
    // Initialize stealthed to false for assassins
    if (p.type === 'assassin') {
      piece.stealthed = false;
    }
    // Initialize activated to false for bards
    if (p.type === 'bard') {
      piece.activated = false;
    }
    pieces.push(piece);
  }

  // Black pieces (mirrored)
  for (const p of whiteBasePieces) {
    const piece: Piece = {
      type: p.type,
      side: 'black',
      row: 2 * N - p.row,
      col: p.col,
    };
    // Initialize stealthed to false for assassins
    if (p.type === 'assassin') {
      piece.stealthed = false;
    }
    // Initialize activated to false for bards
    if (p.type === 'bard') {
      piece.activated = false;
    }
    pieces.push(piece);
  }

  // Bard (neutral, center)
  pieces.push({
    type: 'bard',
    side: 'neutral',
    row: 8,
    col: 4,
    activated: false,
  });

  return pieces;
}

export function getPieceAt(pieces: Piece[], row: number, col: number): number {
  return pieces.findIndex((p) => p.row === row && p.col === col);
}

// Get visible piece at position (ignoring stealthed enemy assassins)
// currentPieceSide: the side of the piece that is looking
export function getVisiblePieceAt(pieces: Piece[], row: number, col: number, currentPieceSide: Side): number {
  return pieces.findIndex((p) => {
    if (p.row !== row || p.col !== col) return false;
    
    // If it's a stealthed assassin from the enemy side, it's not visible
    if (p.type === 'assassin' && p.stealthed && p.side !== currentPieceSide && p.side !== 'neutral') {
      return false;
    }
    
    return true;
  });
}

export function calculateWizardMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = []
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  
  if (nodeIdx === -1) return highlights;

  // 1-step moves
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPiece = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);
    // Cannot move to positions with enemy holy light or burn marks
    if (targetPiece === -1 && canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks)) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    }
  }

  // Swap with apprentices (holy light doesn't affect swapping since both pieces move simultaneously)
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
      const targetPieceIdx = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);

      if (targetPieceIdx === -1) continue;

      const targetPiece = pieces[targetPieceIdx];

      // Cannot attack pieces on enemy holy light, and cannot attack bards
      if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard') {
        if (!hasEnemyHolyLight(adjNode.row, adjNode.col, piece.side, holyLights)) {
          highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
        }
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
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = []
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
    
    const targetPieceIdx = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);
    if (targetPieceIdx === -1 && canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks)) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else if (targetPieceIdx !== -1) {
      // Can attack enemy pieces in forward direction (if not on enemy holy light or burn marks), but not bards
      const targetPiece = pieces[targetPieceIdx];
      if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard' &&
          canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks)) {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  // Swap with adjacent friendly pieces (holy light doesn't affect swapping)
  // For swapping, we need to see ALL pieces including stealthed assassins
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);
    
    if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (targetPiece.side === piece.side) {
        highlights.push({ type: 'swap', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  return highlights;
}

// Calculate ranger moves - similar to Chinese Chess Cannon (炮)
// Can jump over exactly one piece to attack an enemy piece
export function calculateRangerMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = []
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  
  if (nodeIdx === -1) return highlights;

  // Ranger can move 1 step to adjacent empty nodes
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);
    
    if (targetPieceIdx === -1 && canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks)) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else if (targetPieceIdx !== -1) {
      // Can attack adjacent enemy directly (if not on enemy holy light or burn marks), but not bards
      const targetPiece = pieces[targetPieceIdx];
      if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard' &&
          canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks)) {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  // Cannon-style jump attack: jump over exactly one piece (at any distance) to attack enemy
  // For each direction, find the first piece along the line, jump over it, and search for enemy
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    
    // Define the direction based on this adjacent node
    const direction = { from: nodeIdx, to: adjIdx };
    
    // Search along this direction to find the first piece (at any distance)
    let currentIdx = nodeIdx;
    let nextIdx = adjIdx;
    let foundPieceToJumpIdx = -1;
    
    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];
      const pieceAtNext = getVisiblePieceAt(pieces, nextNode.row, nextNode.col, piece.side);
      
      // Found the first piece in this direction
      if (pieceAtNext !== -1) {
        const foundPiece = pieces[pieceAtNext];
        
        // Check if we can jump over this piece
        // Cannot jump over unactivated bards
        if (foundPiece.type === 'bard' && !foundPiece.activated) {
          // Can't jump over this piece, stop searching in this direction
          break;
        }
        
        // Found a piece we can jump over
        foundPieceToJumpIdx = nextIdx;
        break;
      }
      
      // Continue searching in the same direction
      currentIdx = nextIdx;
      nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
    }
    
    // If we found a piece to jump over, continue searching for enemy after it
    if (foundPieceToJumpIdx !== -1) {
      currentIdx = foundPieceToJumpIdx;
      nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
      
      while (nextIdx !== -1) {
        const nextNode = allNodes[nextIdx];
        const pieceAtNext = getVisiblePieceAt(pieces, nextNode.row, nextNode.col, piece.side);
        
        // Found a piece - check if it's an enemy (and not on enemy holy light), and not a bard
        if (pieceAtNext !== -1) {
          const targetPiece = pieces[pieceAtNext];
          if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard' &&
              canOccupyNode(nextNode.row, nextNode.col, piece.side, holyLights)) {
            highlights.push({ type: 'attack', row: nextNode.row, col: nextNode.col });
          }
          // Stop searching in this direction (found a piece)
          break;
        }
        
        // Continue searching in the same direction
        currentIdx = nextIdx;
        nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
      }
    }
  }

  return highlights;
}

// Helper function to get rotated square coordinates
function getRotatedCoords(row: number, col: number): { x: number; y: number } {
  let x: number;
  let y: number;
  
  if (row <= 8) {
    x = col;
    y = row - col;
  } else {
    const offset = row - 8;
    x = col + offset;
    y = 8 - col;
  }
  
  return { x, y };
}

// Calculate griffin moves
// Can move unlimited distance along two diagonal directions
export function calculateGriffinMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = []
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  
  if (nodeIdx === -1) return highlights;

  // Get rotated coordinates of current position
  const currentCoords = getRotatedCoords(piece.row, piece.col);

  // Part 1: Unlimited horizontal movement (y constant, same rank)
  for (const firstAdjIdx of adjacency[nodeIdx]) {
    const firstAdjNode = allNodes[firstAdjIdx];
    
    // Only consider horizontal direction (same row)
    if (firstAdjNode.row !== piece.row) {
      continue;
    }
    
    const direction = {
      from: nodeIdx,
      to: firstAdjIdx,
    };
    
    let currentIdx = nodeIdx;
    let nextIdx = firstAdjIdx;
    
    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];
      
      // Cannot pass through enemy holy light or burn marks
      if (!canOccupyNode(nextNode.row, nextNode.col, piece.side, holyLights, burnMarks)) {
        break;
      }
      
      const targetPieceIdx = getVisiblePieceAt(pieces, nextNode.row, nextNode.col, piece.side);
      
      if (targetPieceIdx !== -1) {
        const targetPiece = pieces[targetPieceIdx];
        if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard') {
          highlights.push({ type: 'attack', row: nextNode.row, col: nextNode.col });
        }
        break;
      }
      
      highlights.push({ type: 'move', row: nextNode.row, col: nextNode.col });
      currentIdx = nextIdx;
      nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
    }
  }

  // Part 2: Single-step diagonal movement (file and rank both change by ±1)
  // These diagonal nodes are NOT in adjacency, so we search for them by coordinates
  for (const direction of [-1, 1]) {
    const targetX = currentCoords.x + direction;
    const targetY = currentCoords.y + direction;
    
    // Find the node with these coordinates
    let targetNode = null;
    for (const node of allNodes) {
      const nodeCoords = getRotatedCoords(node.row, node.col);
      if (nodeCoords.x === targetX && nodeCoords.y === targetY) {
        targetNode = node;
        break;
      }
    }
    
    if (targetNode && canOccupyNode(targetNode.row, targetNode.col, piece.side, holyLights, burnMarks)) {
      const targetPieceIdx = getVisiblePieceAt(pieces, targetNode.row, targetNode.col, piece.side);
      
      if (targetPieceIdx === -1) {
        highlights.push({ type: 'move', row: targetNode.row, col: targetNode.col });
      } else {
        const targetPiece = pieces[targetPieceIdx];
        if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard') {
          highlights.push({ type: 'attack', row: targetNode.row, col: targetNode.col });
        }
      }
    }
  }

  return highlights;
}

// Calculate assassin moves - parallelogram diagonal moves
// Assassin can move along parallelogram diagonals formed by adjacent triangles
// Key: Exclude SQUARES (adj nodes in same row) but allow PARALLELOGRAMS
export function calculateAssassinMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = []
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  
  if (nodeIdx === -1) return highlights;

  const adjacent = adjacency[nodeIdx];
  
  // Iterate through all pairs of adjacent nodes
  for (let i = 0; i < adjacent.length; i++) {
    for (let j = i + 1; j < adjacent.length; j++) {
      const adj1Idx = adjacent[i];
      const adj2Idx = adjacent[j];
      const adj1 = allNodes[adj1Idx];
      const adj2 = allNodes[adj2Idx];
      
      // Check if adj1 and adj2 are also adjacent to each other (forming a triangle)
      if (adjacency[adj1Idx].includes(adj2Idx)) {
        // CRITICAL: Skip if the two adjacent nodes are in the same row
        // This indicates they form a SQUARE, not a parallelogram
        if (adj1.row === adj2.row) {
          continue; // Square diagonal - not allowed
        }
        
        // These three nodes form a triangle
        // The fourth corner of the parallelogram:
        const targetRow = adj1.row + adj2.row - piece.row;
        const targetCol = adj1.col + adj2.col - piece.col;
        
        // Find if this target exists in the board
        const targetIdx = allNodes.findIndex(n => n.row === targetRow && n.col === targetCol);
        if (targetIdx !== -1) {
          // Check if target is adjacent to both adj1 and adj2 (completing the parallelogram)
          if (adjacency[adj1Idx].includes(targetIdx) && adjacency[adj2Idx].includes(targetIdx)) {
            const targetNode = allNodes[targetIdx];
            
            // Check intermediate nodes (adj1 and adj2) for enemy holy lights
            // Assassin must traverse these nodes to reach the target
            const adj1Blocked = hasEnemyHolyLight(adj1.row, adj1.col, piece.side, holyLights);
            const adj2Blocked = hasEnemyHolyLight(adj2.row, adj2.col, piece.side, holyLights);
            const targetBlocked = hasEnemyHolyLight(targetNode.row, targetNode.col, piece.side, holyLights);
            
            // Can only move if no enemy holy lights block the path or destination
            if (!adj1Blocked && !adj2Blocked && !targetBlocked) {
              const targetPieceIdx = getVisiblePieceAt(pieces, targetNode.row, targetNode.col, piece.side);
              
              if (targetPieceIdx === -1) {
                highlights.push({ type: 'move', row: targetNode.row, col: targetNode.col });
              } else {
                const targetPiece = pieces[targetPieceIdx];
                if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard') {
                  highlights.push({ type: 'attack', row: targetNode.row, col: targetNode.col });
                }
              }
            }
          }
        }
      }
    }
  }

  return highlights;
}

// Calculate paladin moves - single step movement
export function calculatePaladinMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = []
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  
  if (nodeIdx === -1) return highlights;

  // Paladin moves 1 step along connections
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);
    
    if (targetPieceIdx === -1 && canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks)) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard' &&
          canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks)) {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  return highlights;
}

// Calculate paladin protection zones for a given paladin
// Protection zone: paladin's own position + all adjacent nodes (empty or occupied)
// Stealthed assassins are revealed when they move into any of these nodes
export function calculatePaladinProtectionZone(
  paladin: Piece,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[]
): { row: number; col: number }[] {
  const protectionZone: { row: number; col: number }[] = [];
  
  const paladinIdx = allNodes.findIndex((n) => n.row === paladin.row && n.col === paladin.col);
  if (paladinIdx === -1) return protectionZone;
  
  // Protection zone includes the paladin's own position
  // This is important for guard scenarios where the guarded piece swaps into the paladin's position
  protectionZone.push({ row: paladin.row, col: paladin.col });
  
  // Protection zone also includes ALL adjacent nodes (empty or occupied)
  // When stealthed assassins move into any of these nodes, they are revealed
  for (const adjIdx of adjacency[paladinIdx]) {
    const adjNode = allNodes[adjIdx];
    protectionZone.push({ row: adjNode.row, col: adjNode.col });
  }
  
  return protectionZone;
}

// Get all protection zones from all paladins of a given side
export function getAllProtectionZones(
  pieces: Piece[],
  side: 'white' | 'black',
  adjacency: number[][],
  allNodes: NodePosition[]
): { row: number; col: number }[] {
  const allZones: { row: number; col: number }[] = [];
  const zoneSet = new Set<string>();
  
  pieces.forEach((piece) => {
    if (piece.type === 'paladin' && piece.side === side) {
      const zones = calculatePaladinProtectionZone(piece, pieces, adjacency, allNodes);
      zones.forEach((zone) => {
        const key = `${zone.row},${zone.col}`;
        if (!zoneSet.has(key)) {
          zoneSet.add(key);
          allZones.push(zone);
        }
      });
    }
  });
  
  return allZones;
}

// Check if a position is in any protection zone
export function isInProtectionZone(
  row: number,
  col: number,
  pieces: Piece[],
  protectingSide: 'white' | 'black',
  adjacency: number[][],
  allNodes: NodePosition[]
): boolean {
  const zones = getAllProtectionZones(pieces, protectingSide, adjacency, allNodes);
  return zones.some(zone => zone.row === row && zone.col === col);
}

// Find all paladins that can guard a specific position
export function findGuardingPaladins(
  targetRow: number,
  targetCol: number,
  pieces: Piece[],
  side: 'white' | 'black',
  adjacency: number[][],
  allNodes: NodePosition[]
): number[] {
  const guardingPaladinIndices: number[] = [];
  
  pieces.forEach((piece, idx) => {
    if (piece.type === 'paladin' && piece.side === side) {
      // Paladin cannot guard itself
      if (piece.row === targetRow && piece.col === targetCol) {
        return;
      }
      
      const zones = calculatePaladinProtectionZone(piece, pieces, adjacency, allNodes);
      const canGuard = zones.some(zone => zone.row === targetRow && zone.col === targetCol);
      if (canGuard) {
        guardingPaladinIndices.push(idx);
      }
    }
  });
  
  return guardingPaladinIndices;
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
  burnMarks: { row: number; col: number }[],
  holyLights: HolyLight[] = []
): { highlights: MoveHighlight[]; pathNodes: { row: number; col: number }[] } {
  console.log(`🐉 Dragon calculateMoves called with burnMarks:`, burnMarks);
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
      
      // Cannot pass through enemy holy light or burn marks - stop immediately
      if (!canOccupyNode(nextNode.row, nextNode.col, piece.side, holyLights, burnMarks)) {
        break;
      }
      
      const targetPieceIdx = getVisiblePieceAt(pieces, nextNode.row, nextNode.col, piece.side);
      const hasBurnMark = burnMarks.some(b => b.row === nextNode.row && b.col === nextNode.col);
      
      // If there's a piece at this position
      if (targetPieceIdx !== -1) {
        const targetPiece = pieces[targetPieceIdx];
        
        // Can attack enemy pieces (including assassins), but not bards
        if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard') {
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

// Helper to find next node in a direction based on (dRow, dCol)
function findNodeInDirection(
  fromIdx: number,
  dRow: number,
  dCol: number,
  adjacency: number[][],
  allNodes: NodePosition[]
): number {
  const fromNode = allNodes[fromIdx];
  const targetRow = fromNode.row + dRow;
  const targetCol = fromNode.col + dCol;
  
  for (const adjIdx of adjacency[fromIdx]) {
    const adjNode = allNodes[adjIdx];
    if (adjNode.row === targetRow && adjNode.col === targetCol) {
      return adjIdx;
    }
  }
  
  return -1;
}

// Calculate bard moves - straight-line jumping
export function calculateBardMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = []
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  
  // Bard can only move when activated
  if (!piece.activated) {
    return highlights;
  }
  
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  if (nodeIdx === -1) return highlights;
  
  // Single-step adjacent moves
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    
    // Cannot pass through enemy holy light or burn marks
    if (!canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks)) {
      continue;
    }
    
    const targetPieceIdx = getPieceAt(pieces, adjNode.row, adjNode.col);
    
    // Landing spot must be empty
    if (targetPieceIdx === -1) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    }
  }
  
  // Straight-line jumping: explore each direction independently
  for (const firstJumpIdx of adjacency[nodeIdx]) {
    const firstJumpNode = allNodes[firstJumpIdx];
    const overPieceIdx = getPieceAt(pieces, firstJumpNode.row, firstJumpNode.col);
    
    // Must have a piece to jump over
    if (overPieceIdx === -1) continue;
    
    const overPiece = pieces[overPieceIdx];
    
    // Can jump over any piece (non-bard or activated bard)
    if (overPiece.type !== 'bard' || overPiece.activated) {
      // Calculate direction vector from start to first jumped piece
      const dRow = firstJumpNode.row - piece.row;
      const dCol = firstJumpNode.col - piece.col;
      
      // Continue jumping in this straight line direction
      let currentIdx = nodeIdx;
      const visited = new Set<number>([nodeIdx]);
      
      while (true) {
        // Find next piece in the same direction (piece to jump over)
        const nextOverIdx = findNodeInDirection(currentIdx, dRow, dCol, adjacency, allNodes);
        
        if (nextOverIdx === -1) break;
        if (visited.has(nextOverIdx)) break;
        
        const nextOverNode = allNodes[nextOverIdx];
        const nextOverPieceIdx = getPieceAt(pieces, nextOverNode.row, nextOverNode.col);
        
        // Must have a piece to jump over
        if (nextOverPieceIdx === -1) break;
        
        const nextOverPiece = pieces[nextOverPieceIdx];
        
        // Can only jump over non-bards or activated bards
        if (nextOverPiece.type === 'bard' && !nextOverPiece.activated) break;
        
        // Calculate landing position (one step further in same direction)
        const landingIdx = findNodeInDirection(nextOverIdx, dRow, dCol, adjacency, allNodes);
        
        if (landingIdx === -1) break;
        if (visited.has(landingIdx)) break;
        
        const landingNode = allNodes[landingIdx];
        
        // Cannot pass through enemy holy light or burn marks
        if (!canOccupyNode(landingNode.row, landingNode.col, piece.side, holyLights, burnMarks)) {
          break;
        }
        
        const landingPieceIdx = getPieceAt(pieces, landingNode.row, landingNode.col);
        
        // Landing spot must be empty
        if (landingPieceIdx === -1) {
          highlights.push({ type: 'move', row: landingNode.row, col: landingNode.col });
          visited.add(nextOverIdx);
          visited.add(landingIdx);
          currentIdx = landingIdx;
        } else {
          break;
        }
      }
    }
  }
  
  return highlights;
}

// Convert (row, col) to rotated square coordinates (x, y)
function toRotatedSquare(row: number, col: number): { x: number; y: number } {
  if (row <= 8) {
    // Upper half: expanding rows
    return { x: col, y: row - col };
  } else {
    // Lower half: contracting rows
    const offset = row - 8;
    return { x: col + offset, y: 8 - col };
  }
}

// Helper function to find the next node along a straight board line
// Board lines are defined by constant x, y, or (x+y) in rotated square coordinates
function findNextInDirection(
  currentIdx: number,
  direction: { from: number; to: number },
  adjacency: number[][],
  allNodes: NodePosition[]
): number {
  const fromNode = allNodes[direction.from];
  const toNode = allNodes[direction.to];
  const currentNode = allNodes[currentIdx];
  
  // Convert to rotated square coordinates
  const fromXY = toRotatedSquare(fromNode.row, fromNode.col);
  const toXY = toRotatedSquare(toNode.row, toNode.col);
  const currentXY = toRotatedSquare(currentNode.row, currentNode.col);
  
  // Determine which line family we're on and direction
  let lineType: 'x' | 'y' | 'diagonal' | null = null;
  let dirSign: number = 0; // +1 or -1
  
  if (fromXY.x === toXY.x) {
    // Constant x (vertical line in rotated square)
    lineType = 'x';
    dirSign = toXY.y > fromXY.y ? 1 : -1;
  } else if (fromXY.y === toXY.y) {
    // Constant y (horizontal line in rotated square)
    lineType = 'y';
    dirSign = toXY.x > fromXY.x ? 1 : -1;
  } else if (fromXY.x + fromXY.y === toXY.x + toXY.y) {
    // Constant (x+y) (diagonal line)
    lineType = 'diagonal';
    dirSign = toXY.x > fromXY.x ? 1 : -1; // Move along x direction
  }
  
  if (!lineType) return -1; // Not on a valid straight line
  
  // Find next node among adjacency that continues the line
  for (const adjIdx of adjacency[currentIdx]) {
    const adjNode = allNodes[adjIdx];
    const adjXY = toRotatedSquare(adjNode.row, adjNode.col);
    
    if (lineType === 'x') {
      // Must have same x, and y increases/decreases correctly
      if (adjXY.x === currentXY.x && (adjXY.y - currentXY.y) === dirSign) {
        return adjIdx;
      }
    } else if (lineType === 'y') {
      // Must have same y, and x increases/decreases correctly
      if (adjXY.y === currentXY.y && (adjXY.x - currentXY.x) === dirSign) {
        return adjIdx;
      }
    } else if (lineType === 'diagonal') {
      // Must have same (x+y), and x increases/decreases correctly
      if (adjXY.x + adjXY.y === currentXY.x + currentXY.y && (adjXY.x - currentXY.x) === dirSign) {
        return adjIdx;
      }
    }
  }
  
  return -1; // No valid next node in this direction
}
