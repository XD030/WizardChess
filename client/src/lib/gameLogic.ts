import type { Piece, PieceType, Side, NodePosition, MoveHighlight } from '@shared/schema';

export const PIECE_EMOJI: Record<PieceType, string> = {
  wizard: '🧙‍♂️',
  apprentice: '🧝',
  dragon: '🐉',
  ranger: '🏹',
  paladin: '🛡️',
  assassin: '🗡️',
  bard: '🎵',
};

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
    move: ['沿節點連線移動 1 節點。'],
    ability: ['可作為巫師導線的導體。'],
  },
  dragon: {
    name: '《龍》',
    move: ['沿直線前進，距離不限（之後補上灼痕效果）。'],
    ability: ['（之後補完）'],
  },
  ranger: {
    name: '《遊俠》',
    move: ['跳棋式移動或 1 節點移動（之後補完）。'],
    ability: ['落點若有敵人則擊殺。'],
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

  // 1-step moves to adjacent nodes
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPiece = getPieceAt(pieces, adjNode.row, adjNode.col);
    if (targetPiece === -1) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    }
  }

  return highlights;
}
