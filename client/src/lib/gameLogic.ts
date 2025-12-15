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
      '導線射擊不會使巫師移動，會在敵方回合結束才發動（施法時間）',
    ],
  },
  apprentice: {
    name: '《學徒》',
    move: ['僅能朝敵方方向，沿節點連線移動 1 節點', '能與己方巫師交換位置 1 次'],
    ability: ['導體：導體間最多能空 1 空格連接（需為一直線），不能有其他棋子，能轉換方向'],
  },
  dragon: {
    name: '《龍》',
    move: [
      '沿任意直線方向前進，距離不限',
      '不可轉換方向或穿越其他棋子，碰到潛行刺客會擊殺並停下',
    ],
    ability: [
      '灼痕：雙方都無法停留，可穿越，經過的節點留下灼痕，直到下次該龍移動前都會存在，死亡時消失',
    ],
  },
  ranger: {
    name: '《遊俠》',
    move: [
      '象棋的砲，若無棋子可跳則改為沿節點連線移動 1 節點',
      '落點有敵人才能跳過去擊殺',
      '無法將潛行刺客和聖光當做跳板',
    ],
    ability: ['無'],
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
    move: ['或者沿對角線方向前後移動 1 節點。', '沿橫向直線方向前進，距離不限，不可轉換方向或穿越其他棋子'],
    ability: ['無'],
  },
};

// Board geometry
export const N = 8;
export const STEP = 40;
export const VSTEP = STEP * 0.5;
export const NODE_RADIUS = 5;

export function buildRows(W: number, H: number): { x: number; y: number }[][] {
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
export function getNodeCoordinate(row: number, col: number): string {
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

  const file = String.fromCharCode(65 + x);
  const rank = y + 1;
  return `${file}${rank}`;
}

// Determine if a node is on a black or white triangle
export function isBlackTriangle(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

// ---- Rotated coordinate helper (single source of truth) ----
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

// ---- Assassin stealth ----
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
    if (deltaSum === -1) return { ...piece, stealthed: true };
    if (deltaSum === 1) return { ...piece, stealthed: false };
  } else {
    if (deltaSum === 1) return { ...piece, stealthed: true };
    if (deltaSum === -1) return { ...piece, stealthed: false };
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
  const list: HolyLight[] = Array.isArray(holyLights) ? holyLights : holyLights ? [holyLights] : [];
  return list.some(
    (light) =>
      light &&
      light.row === row &&
      light.col === col &&
      light.createdBy !== pieceSide &&
      light.createdBy !== 'neutral',
  );
}

/**
 * ✅ 最新規則：
 * - 灼痕：所有棋子「可穿越」，但「只有聖騎士可停留」
 * - HolyLight：敵方「不可穿越、不可停留」
 *
 * allowBurnThrough=true：代表「路徑檢查可穿越灼痕」，但是否能停留仍由呼叫端/回傳 highlights 決定
 */
export function canOccupyNode(
  row: number,
  col: number,
  pieceSide: Side,
  holyLights: HolyLight[] | HolyLight | undefined,
  burnMarks: { row: number; col: number }[] | { row: number; col: number } | undefined = [],
  pieceType?: PieceType,
  allowBurnThrough: boolean = false,
): boolean {
  const burnList: { row: number; col: number }[] = Array.isArray(burnMarks)
    ? burnMarks
    : burnMarks
      ? [burnMarks]
      : [];

  const hasBurnMark = burnList.some((b) => b && b.row === row && b.col === col);

  // HolyLight：敵方不可穿越/不可停留
  if (hasEnemyHolyLight(row, col, pieceSide, holyLights)) return false;

  if (!hasBurnMark) return true;

  // 灼痕：只有聖騎士可停留
  if (pieceType === 'paladin') return true;

  // 灼痕：其他棋子可穿越（allowBurnThrough=true 用於射線/路徑）
  if (allowBurnThrough) return true;

  // 其他棋子不可停留
  return false;
}

export function filterHighlightsForHolyLight(
  piece: Piece,
  highlights: MoveHighlight[],
  holyLights: HolyLight[],
  burnMarks: { row: number; col: number }[] = [],
): MoveHighlight[] {
  return highlights.filter((h) => canOccupyNode(h.row, h.col, piece.side, holyLights, burnMarks, piece.type));
}

// ---- Assassin reveal in paladin zone ----
export function revealAssassinsInSpecificZone(
  pieces: Piece[],
  protectionZone: { row: number; col: number }[],
  paladinSide: Side,
): Piece[] {
  const enemySide = paladinSide === 'white' ? 'black' : 'white';

  return pieces.map((piece) => {
    if (piece.type === 'assassin' && piece.stealthed && piece.side === enemySide) {
      const isInZone = protectionZone.some((zone) => zone.row === piece.row && zone.col === piece.col);
      if (isInZone) return { ...piece, stealthed: false };
    }
    return piece;
  });
}

// ---- Adjacency ----
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

    if (p.type === 'assassin') piece.stealthed = false;
    if (p.type === 'bard') piece.activated = false;

    if (p.type === 'apprentice') piece.swapUsed = false;

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

    if (p.type === 'assassin') piece.stealthed = false;
    if (p.type === 'bard') piece.activated = false;

    if (p.type === 'apprentice') piece.swapUsed = false;

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
export function getPieceAt(pieces: Piece[], row: number, col: number): number {
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
    if (p.type === 'assassin' && p.stealthed && p.side !== currentPieceSide && p.side !== 'neutral') {
      return false;
    }
    return true;
  });
}

function hasAnyPieceAt(pieces: Piece[], row: number, col: number): boolean {
  // 物理佔位：stealth 也算棋子（不能穿過棋子）
  return pieces.some((p) => p.row === row && p.col === col);
}

// =====================================================
// ✅ Wizard beam（修正版：用「直線射線」+「導體可轉彎」）
//
// 你之前那版會算出亂彎路徑的原因：把導線當成一般 BFS 走格。
// 正確應該是：
// - 從巫師/導體出發，沿著 6 個方向做 ray-cast（保持同方向一路走）
// - 只能在「導體」處轉彎（apprentice / activated bard(同側或中立)）
// - 最後命中「第一個敵方棋子」（bard 不算）
// - HolyLight(敵方) 視為牆：射線不可穿越
// - 依照規則：「巫師必須經過至少 1 個導體」才可打到敵人
// =====================================================

export type BeamEdge = {
  from: { row: number; col: number };
  to: { row: number; col: number };
};

export type WizardBeamResult = {
  pathNodes: { row: number; col: number }[];
  pathEdges: BeamEdge[];
  target?: { row: number; col: number };
};

function isConductorForWizard(wizardSide: Side, p: Piece): boolean {
  // 己方學徒、已激活吟遊詩人（己方或中立）才是導體
  if (p.type === 'apprentice') return p.side === wizardSide;
  if (p.type === 'bard') return !!p.activated && (p.side === wizardSide || p.side === 'neutral');
  return false;
}

function isEnemyForWizard(wizardSide: Side, p: Piece): boolean {
  return p.side !== 'neutral' && p.side !== wizardSide;
}

function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  const da = Math.hypot(ax, ay);
  const db = Math.hypot(bx, by);
  if (da === 0 || db === 0) return Math.PI;
  const cos = (ax * bx + ay * by) / (da * db);
  const c = Math.max(-1, Math.min(1, cos));
  return Math.acos(c);
}

export function computeWizardBeam(
  wizard: Piece,
  pieces: Piece[],
  allNodes: NodePosition[],
  adjacency: number[][],
  holyLights: HolyLight[] = [],
): WizardBeamResult {
  const res: WizardBeamResult = { pathNodes: [], pathEdges: [] };
  if (wizard.type !== 'wizard') return res;

  const keyOf = (r: number, c: number) => `${r},${c}`;

  const nodeIdxByKey = new Map<string, number>();
  for (let i = 0; i < allNodes.length; i++) {
    nodeIdxByKey.set(keyOf(allNodes[i].row, allNodes[i].col), i);
  }

  const startIdx = nodeIdxByKey.get(keyOf(wizard.row, wizard.col));
  if (startIdx == null) return res;

  const pieceByKey = new Map<string, Piece>();
  for (const p of pieces) pieceByKey.set(keyOf(p.row, p.col), p);

  const wizardSide = wizard.side;
  const enemySide: Side = wizardSide === 'white' ? 'black' : 'white';

  // 導體集合（用 nodeIdx 當節點）
  const conductorIdxSet = new Set<number>();
  for (const p of pieces) {
    if (!isConductorForWizard(wizardSide, p)) continue;
    const idx = nodeIdxByKey.get(keyOf(p.row, p.col));
    if (idx != null) conductorIdxSet.add(idx);
  }

  // 允許射線穿越：灼痕不擋；棋子會擋（命中第一顆棋就停）
  // HolyLight：敵方視為牆（不可穿越）
  const blockedByEnemyHolyLight = (row: number, col: number) =>
    hasEnemyHolyLight(row, col, wizardSide, holyLights);

  // 從 fromIdx 走到 firstStepIdx 之後，保持方向一直射到碰到第一顆棋 or 被牆擋 or 出界
  // 回傳 hitIdx / hitPiece / line(包含 fromIdx->...->hitIdx)
  function castRay(fromIdx: number, firstStepIdx: number): { hitIdx: number; hitPiece: Piece; line: number[] } | null {
    const from = allNodes[fromIdx];
    const first = allNodes[firstStepIdx];

    // 牆：第一格就被敵方 HolyLight 擋
    if (blockedByEnemyHolyLight(first.row, first.col)) return null;

    const dirX = first.x - from.x;
    const dirY = first.y - from.y;

    const line: number[] = [fromIdx, firstStepIdx];

    // 第一步就撞到棋子
    const firstPiece = pieceByKey.get(keyOf(first.row, first.col));
    if (firstPiece) return { hitIdx: firstStepIdx, hitPiece: firstPiece, line };

    let prev = fromIdx;
    let cur = firstStepIdx;

    while (true) {
      const curNode = allNodes[cur];
      const neigh = adjacency[cur] ?? [];

      let best: number | null = null;
      let bestAngle = Infinity;

      for (const nxt of neigh) {
        if (nxt === prev) continue;
        const nxtNode = allNodes[nxt];
        const vx = nxtNode.x - curNode.x;
        const vy = nxtNode.y - curNode.y;
        const a = angleBetween(dirX, dirY, vx, vy);
        if (a < bestAngle) {
          bestAngle = a;
          best = nxt;
        }
      }

      // 角度太大表示離開直線（不再同方向）
      if (best == null || bestAngle > 0.35) break; // 約 20° 容忍（避免浮點誤差）

      const nextNode = allNodes[best];

      // 牆：敵方 HolyLight 擋住射線
      if (blockedByEnemyHolyLight(nextNode.row, nextNode.col)) break;

      prev = cur;
      cur = best;
      line.push(cur);

      const hit = pieceByKey.get(keyOf(nextNode.row, nextNode.col));
      if (hit) return { hitIdx: cur, hitPiece: hit, line };
    }

    return null;
  }

  // BFS 狀態：只能在導體上「停下並轉彎」
  // 且「巫師必須先到導體」之後才能命中敵人
  type StateKey = string; // `${nodeIdx}|${usedConductor}`
  const makeKey = (idx: number, used: boolean) => `${idx}|${used ? 1 : 0}`;

  const q: Array<{ idx: number; usedConductor: boolean }> = [{ idx: startIdx, usedConductor: false }];
  const seen = new Set<StateKey>([makeKey(startIdx, false)]);

  // prev map：用 stateKey 當 key，存上一個 stateKey + 這一跳的 line
  const prevState = new Map<StateKey, StateKey>();
  const prevLine = new Map<StateKey, number[]>(); // line nodeIdxs (含 from->hit)

  // 終點狀態
  let endStateKey: StateKey | null = null;
  let endTargetIdx: number | null = null;

  while (q.length > 0 && !endStateKey) {
    const cur = q.shift()!;
    const neigh = adjacency[cur.idx] ?? [];

    for (const stepIdx of neigh) {
      const ray = castRay(cur.idx, stepIdx);
      if (!ray) continue;

      const hit = ray.hitPiece;

      // bard 永遠不可被擊殺：視為阻擋（射線到此停止，但不算 target，也不能當導體）
      if (hit.type === 'bard') {
        continue;
      }

      // 命中敵人：需要「已經用過導體」才成立（巫師必須經過至少一個導體）
      if (hit.side === enemySide && isEnemyForWizard(wizardSide, hit)) {
        if (!cur.usedConductor) continue;

        endStateKey = makeKey(ray.hitIdx, true);
        endTargetIdx = ray.hitIdx;

        // 用 endStateKey 當作終點 state，記 prev
        const curKey = makeKey(cur.idx, cur.usedConductor);
        prevState.set(endStateKey, curKey);
        prevLine.set(endStateKey, ray.line);
        break;
      }

      // 命中導體：允許入隊（轉彎點）
      if (isConductorForWizard(wizardSide, hit)) {
        const nextUsed = true;
        const nextKey = makeKey(ray.hitIdx, nextUsed);
        if (seen.has(nextKey)) continue;

        seen.add(nextKey);
        const curKey = makeKey(cur.idx, cur.usedConductor);
        prevState.set(nextKey, curKey);
        prevLine.set(nextKey, ray.line);
        q.push({ idx: ray.hitIdx, usedConductor: nextUsed });
        continue;
      }

      // 命中其他己方棋：阻擋，不可穿越，也不入隊
    }
  }

  if (!endStateKey || endTargetIdx == null) return res;

  // 還原完整 nodeIdx path：把每一跳的 line 接起來
  const fullIdxs: number[] = [];
  let curKey = endStateKey;

  while (true) {
    const line = prevLine.get(curKey);
    const pkey = prevState.get(curKey);

    if (!line || !pkey) break;

    // line 是 [from ... to]，往前拼接時避免重複點
    if (fullIdxs.length === 0) {
      fullIdxs.unshift(...line);
    } else {
      fullIdxs.unshift(...line.slice(1));
    }

    curKey = pkey;
    if (curKey === makeKey(startIdx, false)) break;
  }

  // fullIdxs 可能沒把起點加進來（保險）
  if (fullIdxs[0] !== startIdx) fullIdxs.unshift(startIdx);

  const pathNodes = fullIdxs.map((i) => ({ row: allNodes[i].row, col: allNodes[i].col }));
  const pathEdges: BeamEdge[] = [];
  for (let i = 0; i < pathNodes.length - 1; i++) {
    pathEdges.push({ from: pathNodes[i], to: pathNodes[i + 1] });
  }

  res.pathNodes = pathNodes;
  res.pathEdges = pathEdges;
  res.target = { row: allNodes[endTargetIdx].row, col: allNodes[endTargetIdx].col };
  return res;
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
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  if (nodeIdx === -1) return highlights;

  // 1-step moves
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);
    if (
      targetPieceIdx === -1 &&
      canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks, piece.type)
    ) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    }
  }

  // Swap with apprentices（只顯示 swapUsed=false）
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.side === piece.side && p.type === 'apprentice') {
      if (p.swapUsed) continue;
      highlights.push({ type: 'swap', row: p.row, col: p.col });
    }
  }

  // ✅ New wizard beam target (修正：必須傳 adjacency)
  const beam = computeWizardBeam(piece, pieces, allNodes, adjacency, holyLights);
  if (beam.target) {
    highlights.push({ type: 'attack', row: beam.target.row, col: beam.target.col });
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
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  if (nodeIdx === -1) return highlights;

  // forward 1-step moves / attack
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];

    const isValidDirection = piece.side === 'white' ? adjNode.row < piece.row : adjNode.row > piece.row;
    if (!isValidDirection) continue;

    const targetPieceIdx = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);

    if (
      targetPieceIdx === -1 &&
      canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks, piece.type)
    ) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (
        targetPiece.side !== piece.side &&
        targetPiece.side !== 'neutral' &&
        targetPiece.type !== 'bard' &&
        canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks, piece.type)
      ) {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  // swap：每個學徒只能跟己方巫師交換一次
  if (!piece.swapUsed) {
    const wizard = pieces.find((p) => p.type === 'wizard' && p.side === piece.side);
    if (wizard) highlights.push({ type: 'swap', row: wizard.row, col: wizard.col });
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
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  if (nodeIdx === -1) return highlights;

  // 1-step
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);

    if (
      targetPieceIdx === -1 &&
      canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks, piece.type)
    ) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (
        targetPiece.side !== piece.side &&
        targetPiece.side !== 'neutral' &&
        targetPiece.type !== 'bard' &&
        canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks, piece.type)
      ) {
        highlights.push({ type: 'attack', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  // 炮
  for (const adjIdx of adjacency[nodeIdx]) {
    const direction = { from: nodeIdx, to: adjIdx };

    type RayPiece = { nodeIdx: number; piece: Piece };

    const rayPieces: RayPiece[] = [];
    let currentIdx = nodeIdx;

    while (true) {
      currentIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
      if (currentIdx === -1) break;

      const node = allNodes[currentIdx];

      const pieceIdxOnNode = pieces.findIndex((p) => p.row === node.row && p.col === node.col);
      if (pieceIdxOnNode === -1) continue;

      const p = pieces[pieceIdxOnNode];
      if (p.type === 'assassin' && p.stealthed) continue;

      rayPieces.push({ nodeIdx: currentIdx, piece: p });
      if (rayPieces.length >= 2) break;
    }

    if (rayPieces.length < 2) continue;

    const jump = rayPieces[0];
    const target = rayPieces[1];

    if (jump.piece.type === 'bard' && !jump.piece.activated) continue;
    if (target.piece.side !== piece.side && target.piece.side !== 'neutral' && target.piece.type !== 'bard') {
      const targetNode = allNodes[target.nodeIdx];
      if (canOccupyNode(targetNode.row, targetNode.col, piece.side, holyLights, burnMarks, piece.type)) {
        highlights.push({ type: 'attack', row: targetNode.row, col: targetNode.col });
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
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  if (nodeIdx === -1) return highlights;

  const currentCoords = getRotatedCoords(piece.row, piece.col);

  // Horizontal rays (same row) — 灼痕可穿越但不可停留（非聖騎士）
  for (const firstAdjIdx of adjacency[nodeIdx]) {
    const firstAdjNode = allNodes[firstAdjIdx];
    if (firstAdjNode.row !== piece.row) continue;

    const direction = { from: nodeIdx, to: firstAdjIdx };
    let currentIdx = nodeIdx;
    let nextIdx = firstAdjIdx;

    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];

      // 敵方 HolyLight 擋
      if (hasEnemyHolyLight(nextNode.row, nextNode.col, piece.side, holyLights)) break;

      const targetPieceIdx = getVisiblePieceAt(pieces, nextNode.row, nextNode.col, piece.side);

      // 有棋：不可穿越
      if (targetPieceIdx !== -1) {
        const targetPiece = pieces[targetPieceIdx];
        if (
          targetPiece.side !== piece.side &&
          targetPiece.side !== 'neutral' &&
          targetPiece.type !== 'bard' &&
          canOccupyNode(nextNode.row, nextNode.col, piece.side, holyLights, burnMarks, piece.type)
        ) {
          highlights.push({ type: 'attack', row: nextNode.row, col: nextNode.col });
        }
        break;
      }

      // 空格：可停留才給 move（灼痕上不給 move，但要繼續掃描＝可穿越）
      if (canOccupyNode(nextNode.row, nextNode.col, piece.side, holyLights, burnMarks, piece.type)) {
        highlights.push({ type: 'move', row: nextNode.row, col: nextNode.col });
      }

      currentIdx = nextIdx;
      nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
    }
  }

  // Diagonal 1-step: (x±1, y±1)
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

    if (!targetNode) continue;
    if (!canOccupyNode(targetNode.row, targetNode.col, piece.side, holyLights, burnMarks, piece.type)) continue;

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
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
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

        const targetIdx = allNodes.findIndex((n) => n.row === targetRow && n.col === targetCol);
        if (targetIdx !== -1) {
          if (adjacency[adj1Idx].includes(targetIdx) && adjacency[adj2Idx].includes(targetIdx)) {
            const targetNode = allNodes[targetIdx];

            const adj1Blocked = hasEnemyHolyLight(adj1.row, adj1.col, piece.side, holyLights);
            const adj2Blocked = hasEnemyHolyLight(adj2.row, adj2.col, piece.side, holyLights);
            const targetBlocked = hasEnemyHolyLight(targetNode.row, targetNode.col, piece.side, holyLights);

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
  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  if (nodeIdx === -1) return highlights;

  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];
    const targetPieceIdx = getVisiblePieceAt(pieces, adjNode.row, adjNode.col, piece.side);

    // paladin 可停在灼痕上
    if (
      targetPieceIdx === -1 &&
      canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks, piece.type)
    ) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else if (targetPieceIdx !== -1) {
      const targetPiece = pieces[targetPieceIdx];
      if (
        targetPiece.side !== piece.side &&
        targetPiece.side !== 'neutral' &&
        targetPiece.type !== 'bard' &&
        canOccupyNode(adjNode.row, adjNode.col, piece.side, holyLights, burnMarks, piece.type)
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

  const paladinIdx = allNodes.findIndex((n) => n.row === paladin.row && n.col === paladin.col);
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

export function isInProtectionZone(
  row: number,
  col: number,
  pieces: Piece[],
  protectingSide: 'white' | 'black',
  adjacency: number[][],
  allNodes: NodePosition[],
): boolean {
  const zones = getAllProtectionZones(pieces, protectingSide, adjacency, allNodes);
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

      const zones = calculatePaladinProtectionZone(piece, pieces, adjacency, allNodes);
      const canGuard = zones.some((zone) => zone.row === targetRow && zone.col === targetCol);
      if (canGuard) guardingPaladinIndices.push(idx);
    }
  });

  return guardingPaladinIndices;
}

// ---- Bard helper: jump target ----
function findJumpTarget(fromIdx: number, overIdx: number, adjacency: number[][], allNodes: NodePosition[]): number {
  const fromNode = allNodes[fromIdx];
  const overNode = allNodes[overIdx];

  const dRow = overNode.row - fromNode.row;
  const dCol = overNode.col - fromNode.col;

  const landRow = overNode.row + dRow;
  const landCol = overNode.col + dCol;

  for (const adjIdx of adjacency[overIdx]) {
    const adjNode = allNodes[adjIdx];
    if (adjNode.row === landRow && adjNode.col === landCol) return adjIdx;
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
): { highlights: MoveHighlight[]; pathNodes: { row: number; col: number }[] } {
  const highlights: MoveHighlight[] = [];
  const pathNodes: { row: number; col: number }[] = [];

  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  if (nodeIdx === -1) return { highlights, pathNodes };

  for (const firstAdjIdx of adjacency[nodeIdx]) {
    const direction = { from: nodeIdx, to: firstAdjIdx };
    let currentIdx = nodeIdx;
    let nextIdx = firstAdjIdx;

    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];

      // 龍：路徑可穿越灼痕
      if (!canOccupyNode(nextNode.row, nextNode.col, piece.side, holyLights, burnMarks, piece.type, true)) break;

      const targetPieceIdx = getVisiblePieceAt(pieces, nextNode.row, nextNode.col, piece.side);
      const hasBurnMark = burnMarks.some((b) => b.row === nextNode.row && b.col === nextNode.col);

      if (targetPieceIdx !== -1) {
        const targetPiece = pieces[targetPieceIdx];

        if (targetPiece.side !== piece.side && targetPiece.side !== 'neutral' && targetPiece.type !== 'bard') {
          highlights.push({ type: 'attack', row: nextNode.row, col: nextNode.col });
        }
        break;
      }

      // 灼痕：不能停留（龍也不能），但可以穿越繼續掃
      if (hasBurnMark) {
        currentIdx = nextIdx;
        nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
        continue;
      }

      highlights.push({ type: 'move', row: nextNode.row, col: nextNode.col });
      currentIdx = nextIdx;
      nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
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

  const startIdx = allNodes.findIndex((n) => n.row === startRow && n.col === startCol);
  const targetIdx = allNodes.findIndex((n) => n.row === targetRow && n.col === targetCol);
  if (startIdx === -1 || targetIdx === -1) return path;

  for (const firstAdjIdx of adjacency[startIdx]) {
    const direction = { from: startIdx, to: firstAdjIdx };
    let currentIdx = startIdx;
    let nextIdx = firstAdjIdx;
    const currentPath: { row: number; col: number }[] = [];

    while (nextIdx !== -1) {
      const nextNode = allNodes[nextIdx];
      currentPath.push({ row: nextNode.row, col: nextNode.col });

      if (nextNode.row === targetRow && nextNode.col === targetCol) return currentPath;

      currentIdx = nextIdx;
      nextIdx = findNextInDirection(currentIdx, direction, adjacency, allNodes);
    }
  }

  return path;
}

// ---- Direction helper ----
function findNextInDirection(
  currentIdx: number,
  direction: { from: number; to: number },
  adjacency: number[][],
  allNodes: NodePosition[],
): number {
  const fromNode = allNodes[direction.from];
  const toNode = allNodes[direction.to];
  const currentNode = allNodes[currentIdx];

  const fromXY = getRotatedCoords(fromNode.row, fromNode.col);
  const toXY = getRotatedCoords(toNode.row, toNode.col);
  const currentXY = getRotatedCoords(currentNode.row, currentNode.col);

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
    const adjXY = getRotatedCoords(adjNode.row, adjNode.col);

    if (lineType === 'x') {
      if (adjXY.x === currentXY.x && adjXY.y - currentXY.y === dirSign) return adjIdx;
    } else if (lineType === 'y') {
      if (adjXY.y === currentXY.y && adjXY.x - currentXY.x === dirSign) return adjIdx;
    } else if (lineType === 'diagonal') {
      if (adjXY.x + adjXY.y === currentXY.x + currentXY.y && adjXY.x - currentXY.x === dirSign) return adjIdx;
    }
  }

  return -1;
}

// ---- Bard ----
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

  if (!piece.activated) return highlights;

  const nodeIdx = allNodes.findIndex((n) => n.row === piece.row && n.col === piece.col);
  if (nodeIdx === -1) return highlights;

  const friendlySide: Side = piece.side;

  // 1-step
  for (const adjIdx of adjacency[nodeIdx]) {
    const adjNode = allNodes[adjIdx];

    if (!canOccupyNode(adjNode.row, adjNode.col, friendlySide, holyLights, burnMarks, piece.type)) continue;

    const targetPieceIdx = getPieceAt(pieces, adjNode.row, adjNode.col);

    if (targetPieceIdx === -1) {
      highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
    } else {
      const targetPiece = pieces[targetPieceIdx];

      if (targetPiece.type === 'assassin' && targetPiece.stealthed && targetPiece.side === friendlySide) continue;

      if (targetPiece.type === 'assassin' && targetPiece.stealthed && targetPiece.side !== friendlySide) {
        highlights.push({ type: 'move', row: adjNode.row, col: adjNode.col });
      }
    }
  }

  // jump once
  for (const firstJumpIdx of adjacency[nodeIdx]) {
    const firstJumpNode = allNodes[firstJumpIdx];
    const overPieceIdx = getPieceAt(pieces, firstJumpNode.row, firstJumpNode.col);

    if (overPieceIdx === -1) continue;

    const overPiece = pieces[overPieceIdx];

    if (overPiece.type === 'bard' && !overPiece.activated) continue;
    if (overPiece.type === 'assassin' && overPiece.stealthed) continue;

    const dRow = firstJumpNode.row - piece.row;
    const dCol = firstJumpNode.col - piece.col;

    const landingIdx = findNodeInDirection(firstJumpIdx, dRow, dCol, adjacency, allNodes);
    if (landingIdx === -1) continue;

    const landingNode = allNodes[landingIdx];

    if (!canOccupyNode(landingNode.row, landingNode.col, friendlySide, holyLights, burnMarks, piece.type)) continue;

    const landingPieceIdx = getPieceAt(pieces, landingNode.row, landingNode.col);

    if (landingPieceIdx === -1) {
      highlights.push({ type: 'move', row: landingNode.row, col: landingNode.col });
    } else {
      const landingPiece = pieces[landingPieceIdx];

      if (landingPiece.type === 'assassin' && landingPiece.stealthed && landingPiece.side === friendlySide) continue;

      if (landingPiece.type === 'assassin' && landingPiece.stealthed && landingPiece.side !== friendlySide) {
        highlights.push({ type: 'move', row: landingNode.row, col: landingNode.col });
      }
    }
  }

  return highlights;
}

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
    if (adjNode.row === targetRow && adjNode.col === targetCol) return adjIdx;
  }

  return -1;
}
