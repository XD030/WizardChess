import type {
  Piece,
  PieceType,
  Side,
  NodePosition,
  MoveHighlight,
  HolyLight,
  BurnMark,
} from '@shared/schema';


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

export const PIECE_DESCRIPTIONS: Record<
  PieceType,
  { name: string; move: string[]; ability: string[] }
> = {
  wizard: {
    name: '《巫師》',
    move: ['沿節點連線移動 1 節點'],
    ability: [
      '範例：巫師→空格→導體（可轉換方向）→導體→敵人',
      '導線：只能由巫師當作起始點，中間導體，最後要是導體接敵人',
      '導線是每回合自動形成，遇到分支就會停止',
      '導線射擊不會使巫師移動，會在敵方回合結束才發動（施法時間）',
    ],
  },
  apprentice: {
    name: '《學徒》',
    move: ['僅能朝敵方方向，沿節點連線移動 1 節點',
           '能與己方巫師交換位置 1 次',
          ],
    ability: [
      '導體：導體間最多能空 1 空格連接（需為一直線），不能有其他棋子，能轉換方向',
    ],
  },
  dragon: {
    name: '《龍》',
    move: ['沿任意直線方向前進，距離不限',
           '不可轉換方向或穿越其他棋子，碰到潛行刺客會擊殺並停下',
          ],
    ability: [
      '灼痕：雙方都無法停留，可穿越，經過的節點留下灼痕，直到下次該龍移動前都會存在，死亡時消失',
    ],
  },
  ranger: {
    name: '《遊俠》',
    move: ['象棋的砲，若無棋子可跳則改為沿節點連線移動 1 節點',
           '落點有敵人才能跳過去擊殺',
           '無法將潛行刺客和聖光當做跳板',
          ],
    ability: [
      '無',
    ],
  },
  paladin: {
    name: '《聖騎士》',
    move: ['沿節點連線移動 1 節點，能消除灼痕'],
    ability: [
      '守護區：相鄰節點為守護區，潛行敵方刺客在內會立即現形，不會有灼痕',
      '當守護區內的己方棋子受到攻擊時，玩家可選擇是否守護',
      '若守護，會與該棋子交換位置並死亡，在該旗子位置留下 HoLy liGhT',
      '若聖騎士同時守護同一節點，玩家能自行做選擇',
      'HoLy liGhT：只有友方能停留穿越，敵方無法停留穿越',
    ],
  },
  assassin: {
    name: '《刺客》',
    move: ['沿相鄰平行四邊形對角點移動'],
    ability: [
      '潛行：敵方看不見其位置，直到敵方回合結束，可被踩殺',
      '往敵方方向移動 → 潛行',
      '往己方方向移動 → 現形',
      '若在守護區內、交換位置或擊殺敵方棋子，會立即現形',
    ],
  },
  bard: {
    name: '《吟遊詩人》',
    move: [
      '沿節點連線移動 1 節點',
      '跳棋移動方式直線跳躍 1 次',
      '移動後必須跟己方棋子交換位置，龍跟巫師除外',
    ],
    ability: [
      '導體：導體間最多能空 1 空格連接（需為一直線），不能有其他棋子，能轉換方向',
      '黃金鎮魂曲：位於棋盤正中央，當第 1 枚棋子被擊殺時才可使用，未被激活時該點無法停留或穿越',
      '無法被擊殺',
      '若落點至敵方潛行刺客會與其交換位置',
    ],
  },
  griffin: {
    name: '《獅鷲》',
    move: [
      '或者沿對角線方向前後移動 1 節點。',
      '沿橫向直線方向前進，距離不限，不可轉換方向或穿越其他棋子',
    ],
    ability: ['無'],
  },
};

// Board geometry
export const N = 8;
export const STEP = 40;
export const VSTEP = STEP * 0.5;
export const NODE_RADIUS = 5;

export function buildRows(
  W: number,
  H: number,
): { x: number; y: number }[][] {
  const CX = W / 2;
  const CY = H / 2;
  const rows: { x: number; y: number }[][] = [];

  for (let i = 0; i <= 2 * N; i++) {
    const level = i;
    const count = level <= N ? level + 1 : 2 * N + 1 - level;
    const y = (level - N) * VSTEP;
    const xStart = (-(count - 1) * STEP) / 2;

    const row: { x: number; y: number }[] = [];
    for (let j = 0; j < count; j++) {
      const x = xStart + j * STEP;
      row.push({ x: CX + x, y: CY + y });
    }
    rows.push(row);
  }

  return rows;
}

export function buildAllNodes(
  rows: { x: number; y: number }[][],
): NodePosition[] {
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

  const file = String.fromCharCode(65 + x);
  const rank = y + 1;

  return `${file}${rank}`;
}

// Determine if a node is on a black or white triangle
export function isBlackTriangle(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

// ---- Assassin stealth ----

function getRotatedCoords(row: number, col: number): { x: number; y: number } {
  if (row <= 8) {
    const x = col;
    const y = row - col;
    return { x, y };
  } else {
    const offset = row - 8;
    const x = col + offset;
    const y = 8 - col;
    return { x, y };
  }
}

export function updateAssassinStealth(
  piece: Piece,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
): Piece {
  if (piece.type !== 'assassin') return piece;

  const fromCoords = getRotatedCoords(fromRow, fromCol);
  const toCoords = getRotatedCoords(toRow, toCol);

  const deltaX = toCoords.x - fromCoords.x;
  const deltaY = toCoords.y - fromCoords.y;
  const deltaSum = deltaX + deltaY;

  if (piece.side === 'white') {
    if (deltaSum === -1) {
      return { ...piece, stealthed: true };
    }
    if (deltaSum === 1) {
      return { ...piece, stealthed: false };
    }
  } else {
    if (deltaSum === 1) {
      return { ...piece, stealthed: true };
    }
    if (deltaSum === -1) {
      return { ...piece, stealthed: false };
    }
  }

  return piece;
}

// ---- Holy light / burn mark helpers ----

export function hasEnemyHolyLight(
  row: number,
  col: number,
  pieceSide: Side,
  holyLights: HolyLight[] | HolyLight | undefined,
): boolean {
  // 確保一定是陣列
  const list: HolyLight[] = Array.isArray(holyLights)
    ? holyLights
    : holyLights
    ? [holyLights]
    : [];

  return list.some(
    (light) =>
      light &&
      light.row === row &&
      light.col === col &&
      light.createdBy !== pieceSide &&
      light.createdBy !== 'neutral',
  );
}


export function canOccupyNode(
  row: number,
  col: number,
  pieceSide: Side,
  holyLights: HolyLight[] | HolyLight | undefined,
  burnMarks: { row: number; col: number }[] | { row: number; col: number } | undefined = [],
): boolean {
  const burnList: { row: number; col: number }[] = Array.isArray(burnMarks)
    ? burnMarks
    : burnMarks
    ? [burnMarks]
    : [];

  const hasBurnMark = burnList.some(
    (b) => b && b.row === row && b.col === col,
  );
  if (hasBurnMark) {
    console.log(
      `🔥 Burn mark blocking position (${row}, ${col}). BurnMarks:`,
      burnList,
    );
    return false;
  }

  // 這裡會呼叫上面的防呆版 hasEnemyHolyLight
  return !hasEnemyHolyLight(row, col, pieceSide, holyLights);
}


export function filterHighlightsForHolyLight(
  piece: Piece,
  highlights: MoveHighlight[],
  holyLights: HolyLight[],
  burnMarks: { row: number; col: number }[] = [],
): MoveHighlight[] {
  return highlights.filter((h) =>
    canOccupyNode(h.row, h.col, piece.side, holyLights, burnMarks),
  );
}

// ---- Assassin reveal in paladin zone ----

export function revealAssassinsInSpecificZone(
  pieces: Piece[],
  protectionZone: { row: number; col: number }[],
  paladinSide: Side,
): Piece[] {
  const enemySide = paladinSide === 'white' ? 'black' : 'white';

  return pieces.map((piece) => {
    if (
      piece.type === 'assassin' &&
      piece.stealthed &&
      piece.side === enemySide
    ) {
      const isInZone = protectionZone.some(
        (zone) => zone.row === piece.row && zone.col === piece.col,
      );
      if (isInZone) {
        return { ...piece, stealthed: false };
      }
    }
    return piece;
  });
}

// ---- Adjacency ----

export function buildAdjacency(
  rows: { x: number; y: number }[][],
): number[][] {
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

// ---- Initial pieces ----

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
    if (p.type === 'assassin') {
      piece.stealthed = false;
    }
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
    if (p.type === 'assassin') {
      piece.stealthed = false;
    }
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

// ---- Piece lookup ----

export function getPieceAt(
  pieces: Piece[],
  row: number,
  col: number,
): number {
  return pieces.findIndex((p) => p.row === row && p.col === col);
}

// Visible piece (ignoring enemy stealthed assassins)
export function getVisiblePieceAt(
  pieces: Piece[],
  row: number,
  col: number,
  currentPieceSide: Side,
): number {
  return pieces.findIndex((p) => {
    if (p.row !== row || p.col !== col) return false;
    if (
      p.type === 'assassin' &&
      p.stealthed &&
      p.side !== currentPieceSide &&
      p.side !== 'neutral'
    ) {
      return false;
    }
    return true;
  });
}

// ---- Wizard ----

export function calculateWizardMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = [],
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex(
    (n) => n.row === piece.row && n.col === piece.col,
  );
  if (nodeIdx === -1) return highlights;

  // 1-step moves
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(
      pieces,
      adjNode.row,
      adjNode.col,
      piece.side,
    );
    if (
      targetPieceIdx === -1 &&
      canOccupyNode(
        adjNode.row,
        adjNode.col,
        piece.side,
        holyLights,
        burnMarks,
      )
    ) {
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

  // Line-of-sight attacks
  const visited = new Set<number>();
  const queue: { nodeIdx: number; path: number[] }[] = [
    { nodeIdx, path: [nodeIdx] },
  ];
  visited.add(nodeIdx);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const adjIdx of adjacency[current.nodeIdx]) {
      if (visited.has(adjIdx)) continue;

      const adjNode = allNodes[adjIdx];
      const targetPieceIdx = getVisiblePieceAt(
        pieces,
        adjNode.row,
        adjNode.col,
        piece.side,
      );

      if (targetPieceIdx === -1) continue;

      const targetPiece = pieces[targetPieceIdx];

      if (
        targetPiece.side !== piece.side &&
        targetPiece.side !== 'neutral' &&
        targetPiece.type !== 'bard'
      ) {
        if (
          !hasEnemyHolyLight(adjNode.row, adjNode.col, piece.side, holyLights)
        ) {
          highlights.push({
            type: 'attack',
            row: adjNode.row,
            col: adjNode.col,
          });
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

// ---- Apprentice ----

export function calculateApprenticeMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = [],
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex(
    (n) => n.row === piece.row && n.col === piece.col,
  );
  if (nodeIdx === -1) return highlights;

  // forward 1-step moves
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];

    const isValidDirection =
      piece.side === 'white' ? adjNode.row < piece.row : adjNode.row > piece.row;
    if (!isValidDirection) continue;

    const targetPieceIdx = getVisiblePieceAt(
      pieces,
      adjNode.row,
      adjNode.col,
      piece.side,
    );
    if (
      targetPieceIdx === -1 &&
      canOccupyNode(
        adjNode.row,
        adjNode.col,
        piece.side,
        holyLights,
        burnMarks,
      )
    ) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (
        targetPiece.side !== piece.side &&
        targetPiece.side !== 'neutral' &&
        targetPiece.type !== 'bard' &&
        canOccupyNode(
          adjNode.row,
          adjNode.col,
          piece.side,
          holyLights,
          burnMarks,
        )
      ) {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  // swap with adjacent friendly pieces
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(
      pieces,
      adjNode.row,
      adjNode.col,
      piece.side,
    );
    if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (targetPiece.side === piece.side) {
        highlights.push({ type: 'swap', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  return highlights;
}

// ---- Ranger ----

export function calculateRangerMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = [],
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex(
    (n) => n.row === piece.row && n.col === piece.col,
  );
  if (nodeIdx === -1) return highlights;

  // 1-step move / attack
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(
      pieces,
      adjNode.row,
      adjNode.col,
      piece.side,
    );

    if (
      targetPieceIdx === -1 &&
      canOccupyNode(
        adjNode.row,
        adjNode.col,
        piece.side,
        holyLights,
        burnMarks,
      )
    ) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (
        targetPiece.side !== piece.side &&
        targetPiece.side !== 'neutral' &&
        targetPiece.type !== 'bard' &&
        canOccupyNode(
          adjNode.row,
          adjNode.col,
          piece.side,
          holyLights,
          burnMarks,
        )
      ) {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  // cannon-style jump attack
  for (const adjIdx of adjacency[nodeIdx]) {
    const direction = { from: nodeIdx, to: adjIdx };

    type RayPiece = { nodeIdx: number; piece: Piece };

    const rayPieces: RayPiece[] = [];
    let currentIdx = nodeIdx;

    while (true) {
      currentIdx = findNextInDirection(
        currentIdx,
        direction,
        adjacency,
        allNodes,
      );
      if (currentIdx === -1) break;

      const node = allNodes[currentIdx];

      const pieceIdxOnNode = pieces.findIndex(
        (p) => p.row === node.row && p.col === node.col,
      );
      if (pieceIdxOnNode === -1) continue;

      const p = pieces[pieceIdxOnNode];

      // 潛行刺客完全透明
      if (p.type === 'assassin' && p.stealthed) continue;

      rayPieces.push({ nodeIdx: currentIdx, piece: p });
      if (rayPieces.length >= 2) break;
    }

    if (rayPieces.length < 2) continue;

    const jump = rayPieces[0];
    const target = rayPieces[1];

    // 未啟動吟遊詩人不能當踏板
    if (jump.piece.type === 'bard' && !jump.piece.activated) {
      continue;
    }

    if (
      target.piece.side !== piece.side &&
      target.piece.side !== 'neutral' &&
      target.piece.type !== 'bard'
    ) {
      const targetNode = allNodes[target.nodeIdx];
      if (
        canOccupyNode(
          targetNode.row,
          targetNode.col,
          piece.side,
          holyLights,
          burnMarks,
        )
      ) {
        highlights.push({
          type: 'attack',
          row: targetNode.row,
          col: targetNode.col,
        });
      }
    }
  }

  return highlights;
}

// ---- Griffin ----

export function calculateGriffinMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = [],
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex(
    (n) => n.row === piece.row && n.col === piece.col,
  );
  if (nodeIdx === -1) return highlights;

  const currentCoords = getRotatedCoords(piece.row, piece.col);

  // Part 1: unlimited horizontal (same row)
  for (const firstAdjIdx of adjacency[nodeIdx]) {
    const firstAdjNode = allNodes[firstAdjIdx];
    if (firstAdjNode.row !== piece.row) continue;

    const direction = { from: nodeIdx, to: firstAdjIdx };
    let currentIdx = nodeIdx;
    let nextIdx = firstAdjIdx;

    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];

      if (
        !canOccupyNode(
          nextNode.row,
          nextNode.col,
          piece.side,
          holyLights,
          burnMarks,
        )
      ) {
        break;
      }

      const targetPieceIdx = getVisiblePieceAt(
        pieces,
        nextNode.row,
        nextNode.col,
        piece.side,
      );

      if (targetPieceIdx !== -1) {
        const targetPiece = pieces[targetPieceIdx];
        if (
          targetPiece.side !== piece.side &&
          targetPiece.side !== 'neutral' &&
          targetPiece.type !== 'bard'
        ) {
          highlights.push({
            type: 'attack',
            row: nextNode.row,
            col: nextNode.col,
          });
        }
        break;
      }

      highlights.push({ type: 'move', row: nextNode.row, col: nextNode.col });
      currentIdx = nextIdx;
      nextIdx = findNextInDirection(
        currentIdx,
        direction,
        adjacency,
        allNodes,
      );
    }
  }

  // Part 2: single-step diagonals (x±1,y±1)
  for (const direction of [-1, 1]) {
    const targetX = currentCoords.x + direction;
    const targetY = currentCoords.y + direction;

    let targetNode: NodePosition | null = null;
    for (const node of allNodes) {
      const nodeCoords = getRotatedCoords(node.row, node.col);
      if (nodeCoords.x === targetX && nodeCoords.y === targetY) {
        targetNode = node;
        break;
      }
    }

    if (
      targetNode &&
      canOccupyNode(
        targetNode.row,
        targetNode.col,
        piece.side,
        holyLights,
        burnMarks,
      )
    ) {
      const targetPieceIdx = getVisiblePieceAt(
        pieces,
        targetNode.row,
        targetNode.col,
        piece.side,
      );
      if (targetPieceIdx === -1) {
        highlights.push({
          type: 'move',
          row: targetNode.row,
          col: targetNode.col,
        });
      } else {
        const targetPiece = pieces[targetPieceIdx];
        if (
          targetPiece.side !== piece.side &&
          targetPiece.side !== 'neutral' &&
          targetPiece.type !== 'bard'
        ) {
          highlights.push({
            type: 'attack',
            row: targetNode.row,
            col: targetNode.col,
          });
        }
      }
    }
  }

  return highlights;
}

// ---- Assassin ----

export function calculateAssassinMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = [],
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex(
    (n) => n.row === piece.row && n.col === piece.col,
  );
  if (nodeIdx === -1) return highlights;

  const adjacent = adjacency[nodeIdx];

  for (let i = 0; i < adjacent.length; i++) {
    for (let j = i + 1; j < adjacent.length; j++) {
      const adj1Idx = adjacent[i];
      const adj2Idx = adjacent[j];
      const adj1 = allNodes[adj1Idx];
      const adj2 = allNodes[adj2Idx];

      if (adjacency[adj1Idx].includes(adj2Idx)) {
        if (adj1.row === adj2.row) continue;

        const targetRow = adj1.row + adj2.row - piece.row;
        const targetCol = adj1.col + adj2.col - piece.col;

        const targetIdx = allNodes.findIndex(
          (n) => n.row === targetRow && n.col === targetCol,
        );
        if (targetIdx !== -1) {
          if (
            adjacency[adj1Idx].includes(targetIdx) &&
            adjacency[adj2Idx].includes(targetIdx)
          ) {
            const targetNode = allNodes[targetIdx];

            const adj1Blocked = hasEnemyHolyLight(
              adj1.row,
              adj1.col,
              piece.side,
              holyLights,
            );
            const adj2Blocked = hasEnemyHolyLight(
              adj2.row,
              adj2.col,
              piece.side,
              holyLights,
            );
            const targetBlocked = hasEnemyHolyLight(
              targetNode.row,
              targetNode.col,
              piece.side,
              holyLights,
            );

            if (!adj1Blocked && !adj2Blocked && !targetBlocked) {
              const targetPieceIdx = getVisiblePieceAt(
                pieces,
                targetNode.row,
                targetNode.col,
                piece.side,
              );

              if (targetPieceIdx === -1) {
                highlights.push({
                  type: 'move',
                  row: targetNode.row,
                  col: targetNode.col,
                });
              } else {
                const targetPiece = pieces[targetPieceIdx];
                if (
                  targetPiece.side !== piece.side &&
                  targetPiece.side !== 'neutral' &&
                  targetPiece.type !== 'bard'
                ) {
                  highlights.push({
                    type: 'attack',
                    row: targetNode.row,
                    col: targetNode.col,
                  });
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

// ---- Paladin ----

export function calculatePaladinMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = [],
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];
  const nodeIdx = allNodes.findIndex(
    (n) => n.row === piece.row && n.col === piece.col,
  );
  if (nodeIdx === -1) return highlights;

  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(
      pieces,
      adjNode.row,
      adjNode.col,
      piece.side,
    );

    if (
      targetPieceIdx === -1 &&
      canOccupyNode(
        adjNode.row,
        adjNode.col,
        piece.side,
        holyLights,
        burnMarks,
      )
    ) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (
        targetPiece.side !== piece.side &&
        targetPiece.side !== 'neutral' &&
        targetPiece.type !== 'bard' &&
        canOccupyNode(
          adjNode.row,
          adjNode.col,
          piece.side,
          holyLights,
          burnMarks,
        )
      ) {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  return highlights;
}

export function calculatePaladinProtectionZone(
  paladin: Piece,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
): { row: number; col: number }[] {
  const protectionZone: { row: number; col: number }[] = [];

  const paladinIdx = allNodes.findIndex(
    (n) => n.row === paladin.row && n.col === paladin.col,
  );
  if (paladinIdx === -1) return protectionZone;

  protectionZone.push({ row: paladin.row, col: paladin.col });

  for (const adjIdx of adjacency[paladinIdx]) {
    const adjNode = allNodes[adjIdx];
    protectionZone.push({ row: adjNode.row, col: adjNode.col });
  }

  return protectionZone;
}

export function getAllProtectionZones(
  pieces: Piece[],
  side: 'white' | 'black',
  adjacency: number[][],
  allNodes: NodePosition[],
): { row: number; col: number }[] {
  const allZones: { row: number; col: number }[] = [];
  const zoneSet = new Set<string>();

  pieces.forEach((piece) => {
    if (piece.type === 'paladin' && piece.side === side) {
      const zones = calculatePaladinProtectionZone(
        piece,
        pieces,
        adjacency,
        allNodes,
      );
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

export function isInProtectionZone(
  row: number,
  col: number,
  pieces: Piece[],
  protectingSide: 'white' | 'black',
  adjacency: number[][],
  allNodes: NodePosition[],
): boolean {
  const zones = getAllProtectionZones(
    pieces,
    protectingSide,
    adjacency,
    allNodes,
  );
  return zones.some((zone) => zone.row === row && zone.col === col);
}

export function findGuardingPaladins(
  targetRow: number,
  targetCol: number,
  pieces: Piece[],
  side: 'white' | 'black',
  adjacency: number[][],
  allNodes: NodePosition[],
): number[] {
  const guardingPaladinIndices: number[] = [];

  pieces.forEach((piece, idx) => {
    if (piece.type === 'paladin' && piece.side === side) {
      if (piece.row === targetRow && piece.col === targetCol) return;

      const zones = calculatePaladinProtectionZone(
        piece,
        pieces,
        adjacency,
        allNodes,
      );
      const canGuard = zones.some(
        (zone) => zone.row === targetRow && zone.col === targetCol,
      );
      if (canGuard) {
        guardingPaladinIndices.push(idx);
      }
    }
  });

  return guardingPaladinIndices;
}

// ---- Bard helper: jump target ----

function findJumpTarget(
  fromIdx: number,
  overIdx: number,
  adjacency: number[][],
  allNodes: NodePosition[],
): number {
  const fromNode = allNodes[fromIdx];
  const overNode = allNodes[overIdx];

  const dRow = overNode.row - fromNode.row;
  const dCol = overNode.col - fromNode.col;

  const landRow = overNode.row + dRow;
  const landCol = overNode.col + dCol;

  for (const adjIdx of adjacency[overIdx]) {
    const adjNode = allNodes[adjIdx];
    if (adjNode.row === landRow && adjNode.col === landCol) {
      return adjIdx;
    }
  }

  return -1;
}

// ---- Dragon ----

export function calculateDragonMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  burnMarks: { row: number; col: number }[],
  holyLights: HolyLight[] = [],
): {
  highlights: MoveHighlight[];
  pathNodes: { row: number; col: number }[];
} {
  console.log(`🐉 Dragon calculateMoves called with burnMarks:`, burnMarks);
  const highlights: MoveHighlight[] = [];
  const pathNodes: { row: number; col: number }[] = [];

  const nodeIdx = allNodes.findIndex(
    (n) => n.row === piece.row && n.col === piece.col,
  );
  if (nodeIdx === -1) return { highlights, pathNodes };

  for (const firstAdjIdx of adjacency[nodeIdx]) {
    const direction = { from: nodeIdx, to: firstAdjIdx };
    let currentIdx = nodeIdx;
    let nextIdx = firstAdjIdx;

    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];

      if (
        !canOccupyNode(
          nextNode.row,
          nextNode.col,
          piece.side,
          holyLights,
          burnMarks,
        )
      ) {
        break;
      }

      const targetPieceIdx = getVisiblePieceAt(
        pieces,
        nextNode.row,
        nextNode.col,
        piece.side,
      );
      const hasBurnMark = burnMarks.some(
        (b) => b.row === nextNode.row && b.col === nextNode.col,
      );

      if (targetPieceIdx !== -1) {
        const targetPiece = pieces[targetPieceIdx];

        if (
          targetPiece.side !== piece.side &&
          targetPiece.side !== 'neutral' &&
          targetPiece.type !== 'bard'
        ) {
          highlights.push({
            type: 'attack',
            row: nextNode.row,
            col: nextNode.col,
          });
        }
        break;
      }

      if (hasBurnMark) {
        currentIdx = nextIdx;
        nextIdx = findNextInDirection(
          currentIdx,
          direction,
          adjacency,
          allNodes,
        );
        continue;
      }

      highlights.push({ type: 'move', row: nextNode.row, col: nextNode.col });
      currentIdx = nextIdx;
      nextIdx = findNextInDirection(
        currentIdx,
        direction,
        adjacency,
        allNodes,
      );
    }
  }

  return { highlights, pathNodes };
}

export function calculateDragonPath(
  startRow: number,
  startCol: number,
  targetRow: number,
  targetCol: number,
  adjacency: number[][],
  allNodes: NodePosition[],
): { row: number; col: number }[] {
  const path: { row: number; col: number }[] = [];

  const startIdx = allNodes.findIndex(
    (n) => n.row === startRow && n.col === startCol,
  );
  const targetIdx = allNodes.findIndex(
    (n) => n.row === targetRow && n.col === targetCol,
  );
  if (startIdx === -1 || targetIdx === -1) return path;

  for (const firstAdjIdx of adjacency[startIdx]) {
    const direction = { from: startIdx, to: firstAdjIdx };
    let currentIdx = startIdx;
    let nextIdx = firstAdjIdx;
    const currentPath: { row: number; col: number }[] = [];

    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];
      currentPath.push({ row: nextNode.row, col: nextNode.col });

      if (nextNode.row === targetRow && nextNode.col === targetCol) {
        return currentPath;
      }

      currentIdx = nextIdx;
      nextIdx = findNextInDirection(
        currentIdx,
        direction,
        adjacency,
        allNodes,
      );
    }
  }

  return path;
}

// ---- Rotated coordinates / direction ----

function toRotatedSquare(row: number, col: number): { x: number; y: number } {
  if (row <= 8) {
    return { x: col, y: row - col };
  } else {
    const offset = row - 8;
    return { x: col + offset, y: 8 - col };
  }
}

function findNextInDirection(
  currentIdx: number,
  direction: { from: number; to: number },
  adjacency: number[][],
  allNodes: NodePosition[],
): number {
  const fromNode = allNodes[direction.from];
  const toNode = allNodes[direction.to];
  const currentNode = allNodes[currentIdx];

  const fromXY = toRotatedSquare(fromNode.row, fromNode.col);
  const toXY = toRotatedSquare(toNode.row, toNode.col);
  const currentXY = toRotatedSquare(currentNode.row, currentNode.col);

  let lineType: 'x' | 'y' | 'diagonal' | null = null;
  let dirSign = 0;

  if (fromXY.x === toXY.x) {
    lineType = 'x';
    dirSign = toXY.y > fromXY.y ? 1 : -1;
  } else if (fromXY.y === toXY.y) {
    lineType = 'y';
    dirSign = toXY.x > fromXY.x ? 1 : -1;
  } else if (fromXY.x + fromXY.y === toXY.x + toXY.y) {
    lineType = 'diagonal';
    dirSign = toXY.x > fromXY.x ? 1 : -1;
  }

  if (!lineType) return -1;

  for (const adjIdx of adjacency[currentIdx]) {
    const adjNode = allNodes[adjIdx];
    const adjXY = toRotatedSquare(adjNode.row, adjNode.col);

    if (lineType === 'x') {
      if (adjXY.x === currentXY.x && adjXY.y - currentXY.y === dirSign) {
        return adjIdx;
      }
    } else if (lineType === 'y') {
      if (adjXY.y === currentXY.y && adjXY.x - currentXY.x === dirSign) {
        return adjIdx;
      }
    } else if (lineType === 'diagonal') {
      if (
        adjXY.x + adjXY.y === currentXY.x + currentXY.y &&
        adjXY.x - currentXY.x === dirSign
      ) {
        return adjIdx;
      }
    }
  }

  return -1;
}

// ---- Bard ----
// 吟遊詩人：單步 + 直線跳「一次」，不能踩己方潛行刺客，
// 可以踩敵方潛行刺客（之後在 Game.tsx 處理交換＋現形）
export function calculateBardMoves(
  piece: Piece,
  pieceIndex: number,
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[],
  holyLights: HolyLight[] = [],
  burnMarks: { row: number; col: number }[] = [],
): MoveHighlight[] {
  const highlights: MoveHighlight[] = [];

  // 只有啟動後才可以移動
  if (!piece.activated) {
    return highlights;
  }

  const nodeIdx = allNodes.findIndex(
    (n) => n.row === piece.row && n.col === piece.col,
  );
  if (nodeIdx === -1) return highlights;

  const friendlySide: Side = piece.side;

  // ===== 1. 單步相鄰移動 =====
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];

    // 聖光 / 灼痕擋住就不能去
    if (
      !canOccupyNode(adjNode.row, adjNode.col, friendlySide, holyLights, burnMarks)
    ) {
      continue;
    }

    const targetPieceIdx = getPieceAt(pieces, adjNode.row, adjNode.col);

    if (targetPieceIdx === -1) {
      // 空格 → 可以走
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else {
      const targetPiece = pieces[targetPieceIdx];

      // 🚫 不能踩「己方潛行刺客」
      if (
        targetPiece.type === 'assassin' &&
        targetPiece.stealthed &&
        targetPiece.side === friendlySide
      ) {
        continue;
      }

      // ✅ 可以踩「敵方潛行刺客」
      if (
        targetPiece.type === 'assassin' &&
        targetPiece.stealthed &&
        targetPiece.side !== friendlySide
      ) {
        highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
      }
      // 其他棋子都不能單步踩上去
    }
  }

  // ===== 2. 直線跳一次 =====
  for (const firstJumpIdx of adjacency[nodeIdx]) {
    const firstJumpNode = allNodes[firstJumpIdx];
    const overPieceIdx = getPieceAt(pieces, firstJumpNode.row, firstJumpNode.col);

    // 第一格必須有棋
    if (overPieceIdx === -1) continue;

    const overPiece = pieces[overPieceIdx];

    // 未啟動吟遊詩人不能當跳板
    if (overPiece.type === 'bard' && !overPiece.activated) continue;

    // 潛行刺客不能當跳板（不論敵我）
    if (overPiece.type === 'assassin' && overPiece.stealthed) continue;

    // 方向向量（從 bard 指向第一個被跳過的棋）
    const dRow = firstJumpNode.row - piece.row;
    const dCol = firstJumpNode.col - piece.col;

    // 落點：被跳過棋子後面那一格
    const landingIdx = findNodeInDirection(
      firstJumpIdx,
      dRow,
      dCol,
      adjacency,
      allNodes,
    );
    if (landingIdx === -1) continue;

    const landingNode = allNodes[landingIdx];

    if (
      !canOccupyNode(
        landingNode.row,
        landingNode.col,
        friendlySide,
        holyLights,
        burnMarks,
      )
    ) {
      continue;
    }

    const landingPieceIdx = getPieceAt(
      pieces,
      landingNode.row,
      landingNode.col,
    );

    if (landingPieceIdx === -1) {
      // 落點是空格 → 可以跳到這格
      highlights.push({
        type: 'move',
        row: landingNode.row,
        col: landingNode.col,
      });
    } else {
      const landingPiece = pieces[landingPieceIdx];

      // 🚫 不能落在己方潛行刺客
      if (
        landingPiece.type === 'assassin' &&
        landingPiece.stealthed &&
        landingPiece.side === friendlySide
      ) {
        continue;
      }

      // ✅ 特例：落點是敵方潛行刺客 → 可以跳上去
      if (
        landingPiece.type === 'assassin' &&
        landingPiece.stealthed &&
        landingPiece.side !== friendlySide
      ) {
        highlights.push({
          type: 'move',
          row: landingNode.row,
          col: landingNode.col,
        });
      }
      // 其他情況都不能落在這格
    }
  }

  return highlights;
}

// helper: straight-line search used by bard jumping
function findNodeInDirection(
  fromIdx: number,
  dRow: number,
  dCol: number,
  adjacency: number[][],
  allNodes: NodePosition[],
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
