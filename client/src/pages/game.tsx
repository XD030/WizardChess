// client/src/pages/Game.tsx
import WizardAttackDialog from "../components/WizardAttackDialog";
import { useState, useEffect, useRef } from "react";
import type {
  Piece,
  Side,
  MoveHighlight,
  NodePosition,
  BurnMark,
  HolyLight,
  GuardOption,
  MoveRecord,
} from "@shared/schema";

import GameBoard from "../components/GameBoard";
import PieceInfoPanel from "../components/PieceInfoPanel";
import TurnHistoryPanel from "../components/TurnHistoryPanel";
import GuardDialog from "../components/GuardDialog";
import CapturedPiecesPanel from "../components/CapturedPiecesPanel";

import {
  getInitialPieces,
  getPieceAt,
  calculateWizardMoves,
  calculateApprenticeMoves,
  calculateDragonMoves,
  calculateDragonPath,
  calculateRangerMoves,
  calculateGriffinMoves,
  calculateAssassinMoves,
  calculatePaladinMoves,
  calculateBardMoves,
  calculatePaladinProtectionZone,
  buildRows,
  buildAllNodes,
  buildAdjacency,
  getNodeCoordinate,
  updateAssassinStealth,
  revealAssassinsInSpecificZone,
  isInProtectionZone,
  findGuardingPaladins,
  PIECE_CHINESE,
  computeWizardBeam,
  type WizardBeamResult,
} from "../lib/gameLogic";

// ==== 型別 ====

type PlayerSide = "white" | "black";

interface CapturedMap {
  white: Piece[];
  black: Piece[];
  neutral: Piece[];
}

interface Seats {
  whiteOwnerId: string | null;
  blackOwnerId: string | null;
}

interface ReadyState {
  white: boolean;
  black: boolean;
}

type StartingMode = "manual" | "random";

interface PendingGuard {
  targetRow: number;
  targetCol: number;
  targetPieceIndex: number;
  attackerPieceIndex: number;
  defenderSide: PlayerSide;
  guardPaladinIndices: number[];
}

interface SyncedState {
  pieces: Piece[];
  currentPlayer: PlayerSide;
  moveHistory: MoveRecord[];
  burnMarks: BurnMark[];
  holyLights: HolyLight[];
  capturedPieces: CapturedMap;
  winner: Side | null;
  seats: Seats;
  startingPlayer: PlayerSide;
  startingMode: StartingMode;
  ready: ReadyState;
  gameStarted: boolean;
  pendingGuard: PendingGuard | null;
}

// =========================
// ✅ 刺客潛行延長到「敵方回合結束」
// =========================
function setAssassinStealthMeta(piece: Piece): Piece {
  if (piece.type !== "assassin") return piece;

  const p: any = piece;
  if (piece.stealthed) {
    p.stealthExpiresOn = piece.side; // 當回合切回自己時解除
  } else {
    delete p.stealthExpiresOn;
  }
  return p as Piece;
}

function clearExpiredAssassinStealth(pieces: Piece[], nextPlayer: PlayerSide): Piece[] {
  return pieces.map((piece) => {
    if (piece.type !== "assassin") return piece;
    const p: any = piece;
    if (piece.stealthed && p.stealthExpiresOn === nextPlayer) {
      const cleared: any = { ...piece, stealthed: false };
      delete cleared.stealthExpiresOn;
      return cleared as Piece;
    }
    return piece;
  });
}

// =========================
// ✅ 龍灼痕「只保留該龍最新一次移動的灼痕」
// =========================
function ensureDragonTags(pieces: Piece[]): Piece[] {
  let wCount = 0;
  let bCount = 0;

  return pieces.map((piece) => {
    if (piece.type !== "dragon") return piece;

    const p: any = piece;
    if (p.dragonTag) return piece;

    const tag = piece.side === "white" ? `dragon-white-${wCount++}` : `dragon-black-${bCount++}`;

    return { ...(piece as any), dragonTag: tag } as Piece;
  });
}

function getDragonTag(piece: Piece): string | null {
  if (piece.type !== "dragon") return null;
  const p: any = piece;
  return p.dragonTag ?? null;
}

function removeBurnMarksByDragonTag(burnMarks: BurnMark[], dragonTag: string): BurnMark[] {
  return burnMarks.filter((m) => (m as any).dragonTag !== dragonTag);
}

function removeBurnMarkAtCell(burnMarks: BurnMark[], row: number, col: number): BurnMark[] {
  return burnMarks.filter((m) => !(m.row === row && m.col === col));
}

function buildAllPaladinProtectedSet(pieces: Piece[], adjacency: number[][], allNodes: NodePosition[]): Set<string> {
  const protectedSet = new Set<string>();
  const paladins = pieces.filter((p) => p.type === "paladin");

  for (const pal of paladins) {
    const zones = calculatePaladinProtectionZone(pal, pieces, adjacency, allNodes);
    for (const z of zones) protectedSet.add(`${z.row},${z.col}`);
  }
  return protectedSet;
}

// Helper：吃子時啟動所有吟遊詩人
function activateAllBards(pieces: Piece[]): Piece[] {
  return pieces.map((piece) =>
    piece.type === "bard"
      ? {
          ...piece,
          activated: true,
        }
      : piece
  );
}

// Helper：複製被吃棋子 map
function cloneCaptured(captured: CapturedMap): CapturedMap {
  return {
    white: [...captured.white],
    black: [...captured.black],
    neutral: [...captured.neutral],
  };
}

// Helper：往被吃棋子 map 裡加一顆棋
function addCaptured(captured: CapturedMap, piece: Piece): CapturedMap {
  const side = piece.side as keyof CapturedMap;
  return {
    ...captured,
    [side]: [...captured[side], piece],
  };
}

// Helper：依「這一步的動子」決定 moveHistory 對不同視角的顯示
function makeMoveRecord(text: string, movedPiece: Piece | null): MoveRecord {
  if (!movedPiece || movedPiece.type !== "assassin" || !movedPiece.stealthed) {
    return { fullText: text, whiteText: text, blackText: text };
  }

  const hiddenMsg = "刺客 ? → ?";

  if (movedPiece.side === "white") {
    return { fullText: text, whiteText: text, blackText: hiddenMsg };
  } else {
    return { fullText: text, whiteText: hiddenMsg, blackText: text };
  }
}

/**
 * ✅ NEW:
 * 把 computeWizardBeam 的 target 轉成可點擊的 attack highlight
 * 並做「更嚴格」：巫師只允許 1 個 attack（導線末端），否則不產生任何 attack。
 */
function mergeWizardBeamAttackHighlights(args: {
  moves: MoveHighlight[];
  beam: WizardBeamResult | null;
  wizard: Piece;
  pieces: Piece[];
}): MoveHighlight[] {
  const { moves, beam, wizard, pieces } = args;

  // ✅ 沒有導線 target：不要動 moves（保留一般相鄰 attack）
  if (!beam?.target) return moves;

  const t = beam.target;
  const tIdx = getPieceAt(pieces, t.row, t.col);
  if (tIdx === -1) return moves;

  const targetPiece = pieces[tIdx];

  // 只能打敵方；bard 不可被擊殺（你原本規則）
  if (targetPiece.side === wizard.side) return moves;
  if (targetPiece.type === "bard") return moves;

  // ✅ 把導線 target 加進去（避免重複）
  const already = moves.some((h) => h.type === "attack" && h.row === t.row && h.col === t.col);
  return already ? moves : [...moves, { type: "attack" as const, row: t.row, col: t.col }];
}

/* =========================================================
   ✅✅✅ 巫師導線：更嚴格版本（純 Game.tsx 內做二次驗證）
   規則（你這次要求的）：
   - 導線只能由巫師當起點
   - 中間只能是「導體」（己方學徒 or 已啟動己方/中立吟遊詩人）
   - 允許「空格」穿過，但空格不可轉彎
   - 允許轉彎，但只能在「導體」上轉彎（不能在空格、不能在巫師自己上轉）
   - 最後必須是「導體接敵人」（target 前一格必須有導體，且導體與敵人相鄰）
   - 導線射擊不會使巫師移動（攻擊分支已確保巫師不動）
   - ❌ 已移除「導線自動射擊」
   ========================================================= */

function isWizardConductorStrict(wizardSide: Side, p: Piece): boolean {
  if (p.type === "apprentice") return p.side === wizardSide; // 只能己方學徒
  if (p.type === "bard") {
    const activated = !!(p as any).activated;
    return activated && (p.side === wizardSide || p.side === "neutral"); // 已啟動，且己方或中立
  }
  return false;
}

function normalizeBeamForUI(wizard: Piece): WizardBeamResult {
  return { pathNodes: [{ row: wizard.row, col: wizard.col }], pathEdges: [] };
}

function isSamePos(a: { row: number; col: number }, b: { row: number; col: number }) {
  return a.row === b.row && a.col === b.col;
}

function isAdjacentByAdjacency(
  a: { row: number; col: number },
  b: { row: number; col: number },
  allNodes: NodePosition[],
  adjacency: number[][]
): boolean {
  const ai = allNodes.findIndex((n) => n.row === a.row && n.col === a.col);
  const bi = allNodes.findIndex((n) => n.row === b.row && n.col === b.col);
  if (ai === -1 || bi === -1) return false;
  return !!adjacency[ai]?.includes(bi);
}

// ✅✅✅ 新增：連續性/對應性驗證（避免不連續路徑導致誤標可攻擊）
function validatePathContinuous(
  nodes: { row: number; col: number }[],
  allNodes: NodePosition[],
  adjacency: number[][]
) {
  for (let i = 0; i < nodes.length - 1; i++) {
    if (!isAdjacentByAdjacency(nodes[i], nodes[i + 1], allNodes, adjacency)) return false;
  }
  return true;
}

function validateEdgesMatchNodes(
  nodes: { row: number; col: number }[],
  edges: any[] | undefined | null
) {
  if (!Array.isArray(edges)) return false;
  if (edges.length !== nodes.length - 1) return false;

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const a = nodes[i];
    const b = nodes[i + 1];

    if (!e?.from || !e?.to) return false;
    if (e.from.row !== a.row || e.from.col !== a.col) return false;
    if (e.to.row !== b.row || e.to.col !== b.col) return false;
  }
  return true;
}

/**
 * ✅ 更嚴格導線驗證
 */
function computeWizardBeamSafe(
  wizard: Piece,
  pieces: Piece[],
  allNodes: NodePosition[],
  adjacency: number[][],
  holyLights: HolyLight[] = []
): WizardBeamResult {
  const raw = computeWizardBeam(wizard, pieces, allNodes, holyLights);
  if (!raw?.target) return normalizeBeamForUI(wizard);

  const nodes = raw.pathNodes ?? [];
  if (nodes.length < 3) {
    // 至少 wizard → (某些節點) → target，且必須存在「導體」，所以最少 3
    return normalizeBeamForUI(wizard);
  }

  // ✅✅✅ 新增：路徑必須是「連續相鄰」且 edges 必須對應 nodes（避免誤標左上學徒可攻擊）
  if (!validatePathContinuous(nodes, allNodes, adjacency)) {
    return normalizeBeamForUI(wizard);
  }
  if (!validateEdgesMatchNodes(nodes, (raw as any).pathEdges)) {
    return normalizeBeamForUI(wizard);
  }

  // target 必須存在且是敵方且非 bard
  const tIdx = getPieceAt(pieces, raw.target.row, raw.target.col);
  if (tIdx === -1) return normalizeBeamForUI(wizard);
  const tp = pieces[tIdx];
  if (tp.side === wizard.side) return normalizeBeamForUI(wizard);
  if (tp.type === "bard") return normalizeBeamForUI(wizard);

  // pathNodes 第一個必須是 wizard
  if (!isSamePos(nodes[0], { row: wizard.row, col: wizard.col })) {
    return normalizeBeamForUI(wizard);
  }

  // pathNodes 最後一個必須是 target（若 computeWizardBeam 沒把 target 放最後，就直接判無效）
  if (!isSamePos(nodes[nodes.length - 1], raw.target)) {
    return normalizeBeamForUI(wizard);
  }

  // ✅ 最後一格（target 前一格）必須是「導體」，且要與 target 相鄰（導體接敵人）
  const pre = nodes[nodes.length - 2];
  const preIdx = getPieceAt(pieces, pre.row, pre.col);
  if (preIdx === -1) return normalizeBeamForUI(wizard); // 不能是空格
  if (!isWizardConductorStrict(wizard.side, pieces[preIdx])) return normalizeBeamForUI(wizard);
  if (!isAdjacentByAdjacency(pre, raw.target, allNodes, adjacency)) return normalizeBeamForUI(wizard);

  // ✅ 中間必須至少有 1 個導體（排除 wizard / target）
  let conductorCount = 0;

  // ✅ 任何「有棋子」的中繼節點都必須是合法導體；敵方/未啟動 bard 一律失敗
  for (let i = 1; i < nodes.length - 1; i++) {
    const n = nodes[i];

    // ❌ 不能穿過聖光（超嚴格）
    if (holyLights.some((l) => l.row === n.row && l.col === n.col)) {
      return normalizeBeamForUI(wizard);
    }

    const idx = getPieceAt(pieces, n.row, n.col);
    if (idx === -1) continue; // 允許空格

    const p = pieces[idx];
    if (!isWizardConductorStrict(wizard.side, p)) return normalizeBeamForUI(wizard);
    conductorCount++;
  }

  if (conductorCount < 1) return normalizeBeamForUI(wizard);

  // ✅ 轉彎只能發生在「導體」節點；空格不可轉彎；巫師本體不可轉彎
  for (let i = 1; i < nodes.length - 1; i++) {
    const prev = nodes[i - 1];
    const cur = nodes[i];
    const next = nodes[i + 1];

    const d1 = { r: cur.row - prev.row, c: cur.col - prev.col };
    const d2 = { r: next.row - cur.row, c: next.col - cur.col };

    const turned = d1.r !== d2.r || d1.c !== d2.c;
    if (!turned) continue;

    // ❌ 巫師本人不能當轉彎點
    if (cur.row === wizard.row && cur.col === wizard.col) return normalizeBeamForUI(wizard);

    // ❌ 轉彎點不能是空格，必須有棋且是導體
    const idx = getPieceAt(pieces, cur.row, cur.col);
    if (idx === -1) return normalizeBeamForUI(wizard);
    if (!isWizardConductorStrict(wizard.side, pieces[idx])) return normalizeBeamForUI(wizard);
  }

  return raw;
}

export default function Game() {
  // 每個 client 自己的 ID，用來辨識座位
  const clientIdRef = useRef<string>("");
  if (!clientIdRef.current) {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      clientIdRef.current = crypto.randomUUID();
    } else {
      clientIdRef.current = Math.random().toString(36).slice(2);
    }
  }

  // ======= 棋局核心狀態（會透過 WebSocket 同步） =======
  const [pieces, setPieces] = useState<Piece[]>(ensureDragonTags(getInitialPieces()));
  const [currentPlayer, setCurrentPlayer] = useState<PlayerSide>("white");
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [burnMarks, setBurnMarks] = useState<BurnMark[]>([]);
  const [holyLights, setHolyLights] = useState<HolyLight[]>([]);
  const [capturedPieces, setCapturedPieces] = useState<CapturedMap>({
    white: [],
    black: [],
    neutral: [],
  });
  const [winner, setWinner] = useState<Side | null>(null);
  const [seats, setSeats] = useState<Seats>({
    whiteOwnerId: null,
    blackOwnerId: null,
  });

  // 先攻方 / 雙方準備狀態 / 是否已開始對局 / 手動 or 隨機
  const [startingPlayer, setStartingPlayer] = useState<PlayerSide>("white");
  const [startingMode, setStartingMode] = useState<StartingMode>("manual");
  const [ready, setReady] = useState<ReadyState>({ white: false, black: false });
  const [gameStarted, setGameStarted] = useState(false);

  // 勝利後顯示結束視窗用
  const [showEndModal, setShowEndModal] = useState(false);

  // ======= 本機 UI 狀態（不會同步） =======
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number>(-1);
  const [highlights, setHighlights] = useState<MoveHighlight[]>([]);
  const [allNodes, setAllNodes] = useState<NodePosition[]>([]);
  const [adjacency, setAdjacency] = useState<number[][]>([]);
  const [dragonPathNodes, setDragonPathNodes] = useState<{ row: number; col: number }[]>([]);
  const [protectionZones, setProtectionZones] = useState<{ row: number; col: number }[]>([]);

  // ✅ 導線顯示資料（選取巫師時生成）
  const [wizardBeam, setWizardBeam] = useState<WizardBeamResult | null>(null);

  const [wizardAttackRequest, setWizardAttackRequest] = useState<{
    wizardIndex: number;
    targetRow: number;
    targetCol: number;
    targetPieceIndex: number;
  } | null>(null);

  // 聖騎士守護相關（本機 UI 狀態）
  const [guardDialogOpen, setGuardDialogOpen] = useState(false);
  const [guardOptions, setGuardOptions] = useState<GuardOption[]>([]);
  const [guardRequest, setGuardRequest] = useState<{
    targetRow: number;
    targetCol: number;
    targetPieceIndex: number;
    attackerPieceIndex: number;
    defenderSide: PlayerSide;
  } | null>(null);
  const [selectedGuardPaladinIndex, setSelectedGuardPaladinIndex] = useState<number | null>(null);

  // 吟遊詩人換位
  const [bardNeedsSwap, setBardNeedsSwap] = useState<{
    bardIndex: number;
    bardRow: number;
    bardCol: number;
  } | null>(null);
  const bardSwapActiveRef = useRef(false);
  useEffect(() => {
    bardSwapActiveRef.current = !!bardNeedsSwap;
  }, [bardNeedsSwap]);

  // 本機扮演的顏色：white / black / spectator
  const [localSide, setLocalSide] = useState<"white" | "black" | "spectator">("spectator");

  // helper：判斷某顆 piece（假設是 bard）在本機是否屬於己方，且是否為敵方回合（此時不應顯示路徑）
  const isOwnBardOutOfTurnForPiece = (piece: Piece | null): boolean => {
    if (!piece) return false;
    if (piece.type !== "bard") return false;
    if (localSide === "spectator") return false;
    if (piece.side !== localSide) return false;
    return currentPlayer !== localSide;
  };

  const [seatError, setSeatError] = useState<string | null>(null);

  // 只有「不是觀戰」且「本機顏色 = 當前回合」且「尚未勝負且已開始」才能真的下子
  const canPlay = localSide !== "spectator" && localSide === currentPlayer && !winner && gameStarted;

  // ---- 房間 / WebSocket 狀態 ----
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [inRoom, setInRoom] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);

  // ====== 棋局快照，用來回放歷史棋面 ======
  const [snapshots, setSnapshots] = useState<SyncedState[]>([]);
  const [viewSnapshotIndex, setViewSnapshotIndex] = useState<number | null>(null);
  const moveCountRef = useRef(0);

  // 是否處於「觀察模式」（勝負已分且關掉結束視窗）
  const isObserving = !!winner && !showEndModal;

  // ====== 歷史回放：找出某 snapshot 相對於前一個 snapshot 是哪幾顆棋移動 ======
  function findMovedPieceIndicesForSnapshot(snapshotIndex: number): number[] {
    if (snapshotIndex <= 0 || snapshotIndex >= snapshots.length) return [];

    const cur = snapshots[snapshotIndex];
    const prev = snapshots[snapshotIndex - 1];

    const curPieces = cur.pieces;
    const prevPieces = prev.pieces;

    const matchedPrev = new Set<number>();
    const matchedCur = new Set<number>();

    for (let i = 0; i < prevPieces.length; i++) {
      const pp = prevPieces[i];
      for (let j = 0; j < curPieces.length; j++) {
        if (matchedPrev.has(i) || matchedCur.has(j)) continue;

        const cp = curPieces[j];
        if (pp.side === cp.side && pp.type === cp.type && pp.row === cp.row && pp.col === cp.col) {
          matchedPrev.add(i);
          matchedCur.add(j);
          break;
        }
      }
    }

    const movedIndices: number[] = [];
    const lastMoverSide: Side = cur.currentPlayer === "white" ? "black" : "white";

    for (let j = 0; j < curPieces.length; j++) {
      if (matchedCur.has(j)) continue;
      const cp = curPieces[j];
      if (cp.side === lastMoverSide) movedIndices.push(j);
    }

    return movedIndices;
  }

  // ====== 初始化棋盤節點 ======
  useEffect(() => {
    const LOGICAL_SIZE = 1000;
    const BOARD_SCALE = 2;

    const baseRows = buildRows(LOGICAL_SIZE, LOGICAL_SIZE);
    const cx = LOGICAL_SIZE / 2;
    const cy = LOGICAL_SIZE / 2;

    const scaledRows = baseRows.map((row) =>
      row.map((p) => ({
        x: cx + (p.x - cx) * BOARD_SCALE,
        y: cy + (p.y - cy) * BOARD_SCALE,
      }))
    );

    const nodes = buildAllNodes(scaledRows);
    const adj = buildAdjacency(scaledRows);
    setAllNodes(nodes);
    setAdjacency(adj);
  }, []);

  // winner 一變成非 null，就跳出結束視窗
  useEffect(() => {
    if (winner) {
      setShowEndModal(true);
      setViewSnapshotIndex(snapshots.length > 0 ? snapshots.length - 1 : null);
    }
  }, [winner, snapshots.length]);

  // 建立一個「全新棋局」狀態（準備階段用）
  function createInitialState(): SyncedState {
    return {
      pieces: ensureDragonTags(getInitialPieces()),
      currentPlayer: "white",
      moveHistory: [],
      burnMarks: [],
      holyLights: [],
      capturedPieces: { white: [], black: [], neutral: [] },
      winner: null,
      seats,
      startingPlayer: "white",
      startingMode: "manual",
      ready: { white: false, black: false },
      gameStarted: false,
      pendingGuard: null,
    };
  }

  // 把從 server 收到的狀態套進來
  function applySyncedState(state: SyncedState) {
    const taggedPieces = ensureDragonTags(state.pieces);

    setPieces(taggedPieces);
    setCurrentPlayer(state.currentPlayer);
    setMoveHistory(state.moveHistory);
    setBurnMarks(state.burnMarks);
    setHolyLights(state.holyLights);
    setCapturedPieces(state.capturedPieces);
    setWinner(state.winner);
    setSeats(state.seats);
    setStartingPlayer(state.startingPlayer);
    setStartingMode(state.startingMode);
    setReady(state.ready);
    setGameStarted(state.gameStarted);

    setSnapshots((prev) => {
      if (prev.length === 0) {
        moveCountRef.current = state.moveHistory.length;
        return [{ ...state, pieces: taggedPieces }];
      }

      if (state.moveHistory.length === 0) {
        moveCountRef.current = 0;
        return [{ ...state, pieces: taggedPieces }];
      }

      if (state.moveHistory.length > moveCountRef.current) {
        moveCountRef.current = state.moveHistory.length;
        return [...prev, { ...state, pieces: taggedPieces }];
      }

      moveCountRef.current = state.moveHistory.length;
      return prev;
    });

    setSelectedPieceIndex(-1);
    setHighlights([]);
    setDragonPathNodes([]);
    setProtectionZones([]);
    setWizardBeam(null);

    // 處理守護中的狀態（pendingGuard）
    if (state.pendingGuard) {
      const { targetRow, targetCol, targetPieceIndex, attackerPieceIndex, defenderSide, guardPaladinIndices } =
        state.pendingGuard;

      const options: GuardOption[] = guardPaladinIndices.map((idx) => ({
        paladinIndex: idx,
        paladinRow: taggedPieces[idx].row,
        paladinCol: taggedPieces[idx].col,
        coordinate: getNodeCoordinate(taggedPieces[idx].row, taggedPieces[idx].col),
      }));

      setGuardOptions(options);
      setGuardRequest({ targetRow, targetCol, targetPieceIndex, attackerPieceIndex, defenderSide });
      setSelectedGuardPaladinIndex(null);
      setGuardDialogOpen(true);
    } else {
      setGuardDialogOpen(false);
      setGuardRequest(null);
      setSelectedGuardPaladinIndex(null);
    }

    setBardNeedsSwap(null);
    setWizardAttackRequest(null);
  }

  // 廣播狀態
  function broadcastState(next: SyncedState) {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "state", state: next, from: clientIdRef.current }));
  }

  // ====== WebSocket 連線 ======
  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.host;
    const ws = new WebSocket(`${wsProtocol}//${wsHost}/ws`);

    socketRef.current = ws;
    setSocketStatus("connecting");

    ws.onopen = () => setSocketStatus("connected");

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "roomJoined") {
          setInRoom(true);
          setRoomError(null);

          if (msg.state) {
            applySyncedState(msg.state as SyncedState);
          } else {
            const initialState = createInitialState();
            applySyncedState(initialState);
            broadcastState(initialState);
          }
          return;
        }

        if (msg.type === "state") {
          applySyncedState(msg.state as SyncedState);
          return;
        }

        if (msg.type === "error") {
          setRoomError(msg.message || "加入房間失敗");
          return;
        }
      } catch (err) {
        console.error("ws message parse error", err);
      }
    };

    ws.onclose = () => {
      socketRef.current = null;
      setSocketStatus("disconnected");
      setInRoom(false);
    };

    return () => ws.close();
  }, []);

  function handleJoinRoom() {
    if (!passwordInput.trim()) {
      setRoomError("請輸入房間密碼");
      return;
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setRoomError("WebSocket 尚未連線，請稍候再試");
      return;
    }

    setRoomError(null);

    socketRef.current.send(JSON.stringify({ type: "joinRoom", password: passwordInput }));
  }

  // ====== 判斷巫師是否被吃掉 ======
  function checkWizardWin(newPieces: Piece[]): Side | null {
    const hasWhiteWizard = newPieces.some((p) => p.type === "wizard" && p.side === "white");
    const hasBlackWizard = newPieces.some((p) => p.type === "wizard" && p.side === "black");

    let newWinner: Side | null = null;

    if (!hasWhiteWizard && hasBlackWizard) newWinner = "black";
    else if (!hasBlackWizard && hasWhiteWizard) newWinner = "white";

    if (newWinner) setWinner(newWinner);

    return newWinner;
  }

  // ✅ finalize：換手（❌ 已移除導線自動射擊）
  function finalizeTurnNoAutoShot(args: {
    piecesAfterStealthExpire: Piece[];
    updatedBurnMarks: BurnMark[];
    remainingHolyLights: HolyLight[];
    localCaptured: CapturedMap;
    newMoveHistory: MoveRecord[];
    nextPlayer: PlayerSide;
    result: Side | null;
  }): {
    pieces: Piece[];
    burnMarks: BurnMark[];
    holyLights: HolyLight[];
    capturedPieces: CapturedMap;
    moveHistory: MoveRecord[];
    winner: Side | null;
  } {
    const {
      piecesAfterStealthExpire,
      updatedBurnMarks,
      remainingHolyLights,
      localCaptured,
      newMoveHistory,
      result,
    } = args;

    return {
      pieces: piecesAfterStealthExpire,
      burnMarks: updatedBurnMarks,
      holyLights: remainingHolyLights,
      capturedPieces: localCaptured,
      moveHistory: newMoveHistory,
      winner: result ?? null,
    };
  }

  // ====== 再來一局 / 退出遊戲 ======
  function handleRestartGame() {
    const initialPieces = ensureDragonTags(getInitialPieces());
    const newStarting: PlayerSide = "white";
    const newReady: ReadyState = { white: false, black: false };

    const initial: SyncedState = {
      pieces: initialPieces,
      currentPlayer: newStarting,
      moveHistory: [],
      burnMarks: [],
      holyLights: [],
      capturedPieces: { white: [], black: [], neutral: [] },
      winner: null,
      seats,
      startingPlayer: newStarting,
      startingMode: "manual",
      ready: newReady,
      gameStarted: false,
      pendingGuard: null,
    };

    setShowEndModal(false);
    setViewSnapshotIndex(null);
    setStartingPlayer(newStarting);
    setStartingMode("manual");
    setReady(newReady);
    setGameStarted(false);

    applySyncedState(initial);
    broadcastState(initial);
  }

  function handleExitGame() {
    setShowEndModal(false);
    setInRoom(false);
    setLocalSide("spectator");
    setViewSnapshotIndex(null);
    setGuardDialogOpen(false);
    setGuardRequest(null);
    setSelectedGuardPaladinIndex(null);
  }

  // ====== 選擇哪一方（白 / 黑 / 觀戰） ======
  function handleChooseSide(side: "white" | "black" | "spectator") {
    if (!inRoom) return;

    if (side === "spectator") {
      const newSeats: Seats = {
        whiteOwnerId: seats.whiteOwnerId === clientIdRef.current ? null : seats.whiteOwnerId,
        blackOwnerId: seats.blackOwnerId === clientIdRef.current ? null : seats.blackOwnerId,
      };
      setSeats(newSeats);
      setLocalSide("spectator");
      setSeatError(null);

      const syncState: SyncedState = {
        pieces,
        currentPlayer,
        moveHistory,
        burnMarks,
        holyLights,
        capturedPieces,
        winner,
        seats: newSeats,
        startingPlayer,
        startingMode,
        ready,
        gameStarted,
        pendingGuard: null,
      };
      broadcastState(syncState);
      return;
    }

    if (side === "white") {
      if (seats.whiteOwnerId && seats.whiteOwnerId !== clientIdRef.current) {
        setSeatError("另一方已選擇白方");
        return;
      }
      const newSeats: Seats = {
        whiteOwnerId: clientIdRef.current,
        blackOwnerId: seats.blackOwnerId === clientIdRef.current ? null : seats.blackOwnerId,
      };
      setSeats(newSeats);
      setLocalSide("white");
      setSeatError(null);

      const syncState: SyncedState = {
        pieces,
        currentPlayer,
        moveHistory,
        burnMarks,
        holyLights,
        capturedPieces,
        winner,
        seats: newSeats,
        startingPlayer,
        startingMode,
        ready,
        gameStarted,
        pendingGuard: null,
      };
      broadcastState(syncState);
      return;
    }

    if (side === "black") {
      if (seats.blackOwnerId && seats.blackOwnerId !== clientIdRef.current) {
        setSeatError("另一方已選擇黑方");
        return;
      }
      const newSeats: Seats = {
        whiteOwnerId: seats.whiteOwnerId === clientIdRef.current ? null : seats.whiteOwnerId,
        blackOwnerId: clientIdRef.current,
      };
      setSeats(newSeats);
      setLocalSide("black");
      setSeatError(null);

      const syncState: SyncedState = {
        pieces,
        currentPlayer,
        moveHistory,
        burnMarks,
        holyLights,
        capturedPieces,
        winner,
        seats: newSeats,
        startingPlayer,
        startingMode,
        ready,
        gameStarted,
        pendingGuard: null,
      };
      broadcastState(syncState);
      return;
    }
  }

  // ====== 準備階段：設定先後攻 ======
  function handleToggleStartingPlayer() {
    const next = startingPlayer === "white" ? "black" : "white";
    setStartingPlayer(next);
    setStartingMode("manual");

    const syncState: SyncedState = {
      pieces,
      currentPlayer,
      moveHistory,
      burnMarks,
      holyLights,
      capturedPieces,
      winner,
      seats,
      startingPlayer: next,
      startingMode: "manual",
      ready,
      gameStarted,
      pendingGuard: null,
    };
    broadcastState(syncState);
  }

  function handleRandomStartingPlayer() {
    const next: PlayerSide = Math.random() < 0.5 ? "white" : "black";
    setStartingPlayer(next);
    setStartingMode("random");

    const syncState: SyncedState = {
      pieces,
      currentPlayer,
      moveHistory,
      burnMarks,
      holyLights,
      capturedPieces,
      winner,
      seats,
      startingPlayer: next,
      startingMode: "random",
      ready,
      gameStarted,
      pendingGuard: null,
    };
    broadcastState(syncState);
  }

  // ====== 準備階段：玩家按「開始遊戲」 ======
  function handlePressReady() {
    if (localSide === "spectator") {
      setSeatError("觀戰者無需準備，請選擇白方或黑方參與對局");
      return;
    }

    const sideKey = localSide;
    if (ready[sideKey]) return;

    const newReady: ReadyState = { ...ready, [sideKey]: true };

    let newGameStarted = gameStarted;
    let newCurrentPlayer = currentPlayer;

    if (!gameStarted && newReady.white && newReady.black) {
      newGameStarted = true;
      newCurrentPlayer = startingPlayer;
    }

    const nextState: SyncedState = {
      pieces,
      currentPlayer: newCurrentPlayer,
      moveHistory,
      burnMarks,
      holyLights,
      capturedPieces,
      winner,
      seats,
      startingPlayer,
      startingMode,
      ready: newReady,
      gameStarted: newGameStarted,
      pendingGuard: null,
    };

    applySyncedState(nextState);
    broadcastState(nextState);
  }

  // ====== 守護相關 ======
  const handleChangeSelectedGuardPaladin = (paladinIndex: number) => {
    setSelectedGuardPaladinIndex(paladinIndex);
  };

  const handleGuardConfirm = () => {
    if (!guardRequest || selectedGuardPaladinIndex === null) return;
    if (winner) return;

    const { targetRow, targetCol, targetPieceIndex, attackerPieceIndex } = guardRequest;

    if (
      targetPieceIndex >= pieces.length ||
      attackerPieceIndex >= pieces.length ||
      selectedGuardPaladinIndex >= pieces.length
    ) {
      console.error("Invalid indices in guardConfirm");
      return;
    }

    const selectedPiece = pieces[attackerPieceIndex];
    const targetPiece = pieces[targetPieceIndex];
    const paladin = pieces[selectedGuardPaladinIndex];

    if (targetPiece.row !== targetRow || targetPiece.col !== targetCol) {
      console.error("Target piece moved before guard resolved");
      return;
    }

    let updatedBurnMarks = [...burnMarks];
    let localCaptured = cloneCaptured(capturedPieces);
    let movedAssassinFinal: Piece | null = null;

    const paladinProtectionZone = calculatePaladinProtectionZone(paladin, pieces, adjacency, allNodes);

    if (selectedPiece.type === "dragon") {
      const tag = getDragonTag(selectedPiece);
      const path = calculateDragonPath(selectedPiece.row, selectedPiece.col, targetRow, targetCol, adjacency, allNodes);

      if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);

      const protectedSet = buildAllPaladinProtectedSet(pieces, adjacency, allNodes);

      const isCellEmptyExceptDragon = (r: number, c: number) => {
        const idx = getPieceAt(pieces, r, c);
        if (idx === -1) return true;
        const p = pieces[idx];
        return p.type === "dragon" && p.row === selectedPiece.row && p.col === selectedPiece.col;
      };

      const addIfAllowed = (r: number, c: number) => {
        const key = `${r},${c}`;
        const isProtected = protectedSet.has(key);
        const isEmpty = isCellEmptyExceptDragon(r, c);
        if (isProtected && isEmpty) return;

        if (!updatedBurnMarks.some((b) => b.row === r && b.col === c)) {
          const m: any = { row: r, col: c, createdBy: selectedPiece.side };
          if (tag) m.dragonTag = tag;
          updatedBurnMarks.push(m as BurnMark);
        }
      };

      addIfAllowed(selectedPiece.row, selectedPiece.col);
      for (const node of path) {
        if (node.row === targetRow && node.col === targetCol) continue;
        addIfAllowed(node.row, node.col);
      }
    }

    const targetRowGuard = targetRow;
    const targetColGuard = targetCol;
    const paladinRow = paladin.row;
    const paladinCol = paladin.col;

    let movedTarget = updateAssassinStealth(
      { ...targetPiece, row: paladinRow, col: paladinCol },
      targetPiece.row,
      targetPiece.col,
      paladinRow,
      paladinCol
    );
    movedTarget = setAssassinStealthMeta(movedTarget);

    if (movedTarget.type === "assassin" && movedTarget.stealthed) {
      const inPaladinZone = paladinProtectionZone.some((z) => z.row === movedTarget.row && z.col === movedTarget.col);
      if (inPaladinZone) {
        const mt: any = { ...movedTarget, stealthed: false };
        delete mt.stealthExpiresOn;
        movedTarget = mt as Piece;
      }
    }

    let movedAttacker = updateAssassinStealth(
      { ...selectedPiece, row: targetRowGuard, col: targetColGuard },
      selectedPiece.row,
      selectedPiece.col,
      targetRowGuard,
      targetColGuard
    );
    movedAttacker = setAssassinStealthMeta(movedAttacker);

    if (movedAttacker.type === "assassin" && movedAttacker.stealthed) {
      const inPaladinZone = paladinProtectionZone.some((z) => z.row === targetRowGuard && z.col === targetColGuard);
      if (inPaladinZone) {
        const ma: any = { ...movedAttacker, stealthed: false };
        delete ma.stealthExpiresOn;
        movedAttacker = ma as Piece;
      }
    }

    if (movedAttacker.type === "assassin") movedAssassinFinal = movedAttacker;

    localCaptured = addCaptured(localCaptured, paladin);

    let newPieces = pieces
      .filter((_, idx) => idx !== selectedGuardPaladinIndex && idx !== attackerPieceIndex && idx !== targetPieceIndex)
      .concat([movedTarget, movedAttacker]);

    newPieces = ensureDragonTags(newPieces);
    newPieces = activateAllBards(newPieces);

    const targetIdxAfter = newPieces.findIndex((p) => p.row === movedTarget.row && p.col === movedTarget.col);
    const attackerIdxAfter = newPieces.findIndex((p) => p.row === movedAttacker.row && p.col === movedAttacker.col);

    if (newPieces[targetIdxAfter].type === "assassin" && (newPieces[targetIdxAfter] as any).stealthed) {
      const enemySide = newPieces[targetIdxAfter].side === "white" ? "black" : "white";
      if (
        isInProtectionZone(
          newPieces[targetIdxAfter].row,
          newPieces[targetIdxAfter].col,
          newPieces,
          enemySide,
          adjacency,
          allNodes
        )
      ) {
        const t: any = { ...newPieces[targetIdxAfter], stealthed: false };
        delete t.stealthExpiresOn;
        newPieces[targetIdxAfter] = t as Piece;
      }
    }

    if (newPieces[attackerIdxAfter].type === "assassin" && (newPieces[attackerIdxAfter] as any).stealthed) {
      const enemySide = newPieces[attackerIdxAfter].side === "white" ? "black" : "white";
      if (
        isInProtectionZone(
          newPieces[attackerIdxAfter].row,
          newPieces[attackerIdxAfter].col,
          newPieces,
          enemySide,
          adjacency,
          allNodes
        )
      ) {
        const a: any = { ...newPieces[attackerIdxAfter], stealthed: false };
        delete a.stealthExpiresOn;
        newPieces[attackerIdxAfter] = a as Piece;
      }
    }

    const fromCoord = getNodeCoordinate(selectedPiece.row, selectedPiece.col);
    const targetCoord = getNodeCoordinate(targetRowGuard, targetColGuard);
    const paladinCoord = getNodeCoordinate(paladinRow, paladinCol);
    const moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${targetCoord} (聖騎士 ${paladinCoord} 守護 ${
      PIECE_CHINESE[targetPiece.type]
    })`;

    const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

    const remainingBurnMarks = updatedBurnMarks;
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);
    const updatedHolyLights = [...remainingHolyLights, { row: paladinRow, col: paladinCol, createdBy: paladin.side }];

    const piecesAfterStealthExpire = clearExpiredAssassinStealth(newPieces, nextPlayer);

    const result = checkWizardWin(piecesAfterStealthExpire);
    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    const finalized = finalizeTurnNoAutoShot({
      piecesAfterStealthExpire,
      updatedBurnMarks: remainingBurnMarks,
      remainingHolyLights: updatedHolyLights,
      localCaptured,
      newMoveHistory,
      nextPlayer,
      result,
    });

    const syncState: SyncedState = {
      pieces: finalized.pieces,
      currentPlayer: finalized.winner ? currentPlayer : nextPlayer,
      moveHistory: finalized.moveHistory,
      burnMarks: finalized.burnMarks,
      holyLights: finalized.holyLights,
      capturedPieces: finalized.capturedPieces,
      winner: finalized.winner ?? winner,
      seats,
      startingPlayer,
      startingMode,
      ready,
      gameStarted,
      pendingGuard: null,
    };

    setGuardDialogOpen(false);
    setGuardRequest(null);
    setSelectedGuardPaladinIndex(null);

    applySyncedState(syncState);
    broadcastState(syncState);
  };

  const handleGuardDecline = () => {
    if (!guardRequest) return;
    if (winner) return;

    const { targetRow, targetCol, targetPieceIndex, attackerPieceIndex } = guardRequest;

    let newPieces = [...pieces];
    const selectedPiece = pieces[attackerPieceIndex];
    const targetPiece = pieces[targetPieceIndex];
    let updatedBurnMarks = [...burnMarks];
    let localCaptured = cloneCaptured(capturedPieces);
    let movedAssassinFinal: Piece | null = null;

    const targetIdx = targetPieceIndex;

    if (targetPiece.type === "dragon") {
      const tag = getDragonTag(targetPiece);
      if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
    }

    if (targetPiece.type !== "bard") {
      localCaptured = addCaptured(localCaptured, targetPiece);
      newPieces.splice(targetIdx, 1);
      newPieces = activateAllBards(newPieces);
    }

    const adjustedIdx =
      targetPiece.type !== "bard" && targetIdx < attackerPieceIndex ? attackerPieceIndex - 1 : attackerPieceIndex;

    if (targetPiece.type !== "bard") {
      if (selectedPiece.type === "wizard") {
        // ✅ 這裡要跟主 attack 規則一致：
        // - 若點到的是 wizardBeam.target 且不是相鄰 → 導線射擊不移動
        // - 其他情況 → 視為走過去打（移動）
        const wizardNodeIdx = allNodes.findIndex((n) => n.row === selectedPiece.row && n.col === selectedPiece.col);
        const targetNodeIdx = allNodes.findIndex((n) => n.row === targetRow && n.col === targetCol);
        const isAdjacent =
          wizardNodeIdx !== -1 && targetNodeIdx !== -1 && !!adjacency[wizardNodeIdx]?.includes(targetNodeIdx);
    
        const isBeamTarget =
          !!wizardBeam?.target && wizardBeam.target.row === targetRow && wizardBeam.target.col === targetCol;
    
        if (!(isBeamTarget && !isAdjacent)) {
          const movedWizard: Piece = { ...selectedPiece, row: targetRow, col: targetCol };
          newPieces[adjustedIdx] = movedWizard;
        }
      } else if (selectedPiece.type === "dragon") {
        const tag = getDragonTag(selectedPiece);
        const path = calculateDragonPath(selectedPiece.row, selectedPiece.col, targetRow, targetCol, adjacency, allNodes);

        if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);

        let movedPiece = updateAssassinStealth(
          { ...selectedPiece, row: targetRow, col: targetCol },
          selectedPiece.row,
          selectedPiece.col,
          targetRow,
          targetCol
        );
        movedPiece = ensureDragonTags([movedPiece])[0];
        newPieces[adjustedIdx] = movedPiece;

        const protectedSet = buildAllPaladinProtectedSet(newPieces, adjacency, allNodes);

        const addIfAllowed = (r: number, c: number) => {
          const key = `${r},${c}`;
          const isProtected = protectedSet.has(key);
          const isEmpty = getPieceAt(newPieces, r, c) === -1;

          if (isProtected && isEmpty) return;

          if (!updatedBurnMarks.some((b) => b.row === r && b.col === c)) {
            const m: any = { row: r, col: c, createdBy: movedPiece.side };
            const t = getDragonTag(movedPiece);
            if (t) m.dragonTag = t;
            updatedBurnMarks.push(m as BurnMark);
          }
        };

        addIfAllowed(selectedPiece.row, selectedPiece.col);
        for (const node of path) {
          if (node.row === targetRow && node.col === targetCol) continue;
          addIfAllowed(node.row, node.col);
        }
      } else {
        let movedPiece = updateAssassinStealth(
          { ...selectedPiece, row: targetRow, col: targetCol },
          selectedPiece.row,
          selectedPiece.col,
          targetRow,
          targetCol
        );
        movedPiece = setAssassinStealthMeta(movedPiece);

        if (movedPiece.type === "assassin") {
          const mp: any = { ...movedPiece, stealthed: false };
          delete mp.stealthExpiresOn;
          movedPiece = mp as Piece;
          movedAssassinFinal = movedPiece;
        }

        newPieces[adjustedIdx] = movedPiece;
      }
    }

    const fromCoord = getNodeCoordinate(selectedPiece.row, selectedPiece.col);
    const toCoord = getNodeCoordinate(targetRow, targetCol);
    const moveDesc =
      targetPiece.type === "bard"
        ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`
        : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;

    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

    const remainingBurnMarks = updatedBurnMarks;
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

    const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);

    const finalized = finalizeTurnNoAutoShot({
      piecesAfterStealthExpire,
      updatedBurnMarks: remainingBurnMarks,
      remainingHolyLights,
      localCaptured,
      newMoveHistory,
      nextPlayer,
      result,
    });

    const syncState: SyncedState = {
      pieces: finalized.pieces,
      currentPlayer: finalized.winner ? currentPlayer : nextPlayer,
      moveHistory: finalized.moveHistory,
      burnMarks: finalized.burnMarks,
      holyLights: finalized.holyLights,
      capturedPieces: finalized.capturedPieces,
      winner: finalized.winner ?? winner,
      seats,
      startingPlayer,
      startingMode,
      ready,
      gameStarted,
      pendingGuard: null,
    };

    setGuardDialogOpen(false);
    setGuardRequest(null);
    setSelectedGuardPaladinIndex(null);

    applySyncedState(syncState);
    broadcastState(syncState);
  };

  // ====== 巫師攻擊方式選擇：導線射擊 or 移動攻擊（僅限相鄰攻擊時彈窗） ======
  const handleWizardLineShot = () => {
    if (!wizardAttackRequest || winner) return;

    const { wizardIndex, targetRow, targetCol, targetPieceIndex } = wizardAttackRequest;

    const wizard = pieces[wizardIndex];
    const targetPiece = pieces[targetPieceIndex];

    let newPieces = [...pieces];
    let localCaptured = cloneCaptured(capturedPieces);
    let updatedBurnMarks = [...burnMarks];

    if (targetPiece.type === "dragon") {
      const tag = getDragonTag(targetPiece);
      if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
    }

    if (targetPiece.type !== "bard") {
      localCaptured = addCaptured(localCaptured, targetPiece);
      newPieces.splice(targetPieceIndex, 1);
      newPieces = activateAllBards(newPieces);
    }

    const fromCoord = getNodeCoordinate(wizard.row, wizard.col);
    const toCoord = getNodeCoordinate(targetRow, targetCol);

    const moveDesc =
      targetPiece.type === "bard"
        ? `${PIECE_CHINESE[wizard.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺，導線射擊)`
        : `${PIECE_CHINESE[wizard.type]} ${fromCoord} ⟼ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (導線射擊)`;

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

    const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

    const record = makeMoveRecord(moveDesc, null);
    const newMoveHistory = [record, ...moveHistory];

    const finalized = finalizeTurnNoAutoShot({
      piecesAfterStealthExpire,
      updatedBurnMarks,
      remainingHolyLights,
      localCaptured,
      newMoveHistory,
      nextPlayer,
      result,
    });

    const syncState: SyncedState = {
      pieces: finalized.pieces,
      currentPlayer: finalized.winner ? currentPlayer : nextPlayer,
      moveHistory: finalized.moveHistory,
      burnMarks: finalized.burnMarks,
      holyLights: finalized.holyLights,
      capturedPieces: finalized.capturedPieces,
      winner: finalized.winner ?? winner,
      seats,
      startingPlayer,
      startingMode,
      ready,
      gameStarted,
      pendingGuard: null,
    };

    applySyncedState(syncState);
    broadcastState(syncState);
    setWizardAttackRequest(null);
  };

  const handleWizardMoveAttack = () => {
    if (!wizardAttackRequest || winner) return;

    const { wizardIndex, targetRow, targetCol, targetPieceIndex } = wizardAttackRequest;

    const wizard = pieces[wizardIndex];
    const targetPiece = pieces[targetPieceIndex];

    let newPieces = [...pieces];
    let localCaptured = cloneCaptured(capturedPieces);
    let updatedBurnMarks = [...burnMarks];

    if (targetPiece.type === "dragon") {
      const tag = getDragonTag(targetPiece);
      if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
    }

    if (targetPiece.type !== "bard") {
      localCaptured = addCaptured(localCaptured, targetPiece);
      newPieces.splice(targetPieceIndex, 1);
      newPieces = activateAllBards(newPieces);
    }

    const adjustedWizardIndex = targetPiece.type !== "bard" && targetPieceIndex < wizardIndex ? wizardIndex - 1 : wizardIndex;

    const movedWizard: Piece = { ...wizard, row: targetRow, col: targetCol };
    newPieces[adjustedWizardIndex] = movedWizard;

    const fromCoord = getNodeCoordinate(wizard.row, wizard.col);
    const toCoord = getNodeCoordinate(targetRow, targetCol);

    const moveDesc =
      targetPiece.type === "bard"
        ? `${PIECE_CHINESE[wizard.type]} ${fromCoord} 移動至 ${toCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} (無法擊殺)`
        : `${PIECE_CHINESE[wizard.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (巫師移動)`;

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

    const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

    const record = makeMoveRecord(moveDesc, null);
    const newMoveHistory = [record, ...moveHistory];

    const finalized = finalizeTurnNoAutoShot({
      piecesAfterStealthExpire,
      updatedBurnMarks,
      remainingHolyLights,
      localCaptured,
      newMoveHistory,
      nextPlayer,
      result,
    });

    const syncState: SyncedState = {
      pieces: finalized.pieces,
      currentPlayer: finalized.winner ? currentPlayer : nextPlayer,
      moveHistory: finalized.moveHistory,
      burnMarks: finalized.burnMarks,
      holyLights: finalized.holyLights,
      capturedPieces: finalized.capturedPieces,
      winner: finalized.winner ?? winner,
      seats,
      startingPlayer,
      startingMode,
      ready,
      gameStarted,
      pendingGuard: null,
    };

    applySyncedState(syncState);
    broadcastState(syncState);
    setWizardAttackRequest(null);
  };

  // ====== 點擊棋盤節點 ======
  const handleNodeClick = (row: number, col: number) => {
    if (guardRequest) return;

    const effectivePieces =
      isObserving && viewSnapshotIndex !== null && snapshots[viewSnapshotIndex]
        ? snapshots[viewSnapshotIndex].pieces
        : pieces;

    const clickedPieceIdx = getPieceAt(effectivePieces, row, col);
    let movedAssassinFinal: Piece | null = null;

    // ---- 若正在等吟遊詩人第二段換位 ----
    if (bardNeedsSwap && !isObserving) {
      if (clickedPieceIdx !== -1) {
        const swapTarget = pieces[clickedPieceIdx];

        if (
          swapTarget.side === currentPlayer &&
          swapTarget.type !== "bard" &&
          swapTarget.type !== "dragon" &&
          swapTarget.type !== "wizard"
        ) {
          const newPieces = [...pieces];
          const bard = newPieces[bardNeedsSwap.bardIndex];

          const movedBard = { ...bard, row: swapTarget.row, col: swapTarget.col };

          let swappedPiece = { ...swapTarget, row: bardNeedsSwap.bardRow, col: bardNeedsSwap.bardCol };

          if (swappedPiece.type === "assassin") {
            const sp: any = { ...swappedPiece, stealthed: false };
            delete sp.stealthExpiresOn;
            swappedPiece = sp as Piece;
          }

          newPieces[bardNeedsSwap.bardIndex] = movedBard;
          newPieces[clickedPieceIdx] = swappedPiece;

          const paladinIndicesToCheck: number[] = [];
          if ((movedBard as any).type === "paladin") paladinIndicesToCheck.push(bardNeedsSwap.bardIndex);
          if ((swappedPiece as any).type === "paladin") paladinIndicesToCheck.push(clickedPieceIdx);

          if (paladinIndicesToCheck.length > 0) {
            for (const pi of paladinIndicesToCheck) {
              const pal = newPieces[pi];
              const zones = calculatePaladinProtectionZone(pal, newPieces, adjacency, allNodes);
              const revealedPieces = revealAssassinsInSpecificZone(newPieces, zones, pal.side);
              for (let i = 0; i < newPieces.length; i++) newPieces[i] = revealedPieces[i];
            }
          }

          const bardCoord = getNodeCoordinate(bardNeedsSwap.bardRow, bardNeedsSwap.bardCol);
          const swapCoord = getNodeCoordinate(swapTarget.row, swapTarget.col);
          const moveDesc = `${PIECE_CHINESE["bard"]} ${bardCoord} ⇄ ${PIECE_CHINESE[swapTarget.type]} ${swapCoord}`;

          const record = makeMoveRecord(moveDesc, null);
          const newMoveHistory = [record, ...moveHistory];

          const result = checkWizardWin(newPieces);
          const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

          const remainingBurnMarks = burnMarks;
          const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

          const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);

          const finalized = finalizeTurnNoAutoShot({
            piecesAfterStealthExpire,
            updatedBurnMarks: remainingBurnMarks,
            remainingHolyLights,
            localCaptured: capturedPieces,
            newMoveHistory,
            nextPlayer,
            result,
          });

          const syncState: SyncedState = {
            pieces: finalized.pieces,
            currentPlayer: finalized.winner ? currentPlayer : nextPlayer,
            moveHistory: finalized.moveHistory,
            burnMarks: finalized.burnMarks,
            holyLights: finalized.holyLights,
            capturedPieces: finalized.capturedPieces,
            winner: finalized.winner ?? winner,
            seats,
            startingPlayer,
            startingMode,
            ready,
            gameStarted,
            pendingGuard: null,
          };

          setBardNeedsSwap(null);
          applySyncedState(syncState);
          broadcastState(syncState);
        }
      }
      return;
    }

    // ====== 還沒選棋子：嘗試選取一顆 ======
    if (selectedPieceIndex === -1) {
      if (clickedPieceIdx !== -1) {
        const piece = effectivePieces[clickedPieceIdx];
        setSelectedPieceIndex(clickedPieceIdx);

        if (isOwnBardOutOfTurnForPiece(piece)) {
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          setWizardBeam(null);
          return;
        }

        const canShowMoves =
          isObserving || localSide === "spectator" || piece.side === localSide || piece.side === "neutral";

        if (canShowMoves && allNodes.length > 0) {
          if (piece.type === "wizard") {
            const moves = calculateWizardMoves(
              piece,
              clickedPieceIdx,
              effectivePieces,
              adjacency,
              allNodes,
              holyLights,
              burnMarks
            );

            // ✅ 更嚴格導線（多條件 + 連續性驗證）
            const beam = computeWizardBeamSafe(piece, effectivePieces, allNodes, adjacency, holyLights);

            const merged = mergeWizardBeamAttackHighlights({
              moves,
              beam,
              wizard: piece,
              pieces: effectivePieces,
            });

            setHighlights(merged);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(beam);
          } else if (piece.type === "apprentice") {
            const moves = calculateApprenticeMoves(
              piece,
              clickedPieceIdx,
              effectivePieces,
              adjacency,
              allNodes,
              holyLights,
              burnMarks
            );
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "dragon") {
            const result = calculateDragonMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, burnMarks, holyLights);
            setHighlights(result.highlights);
            setDragonPathNodes(result.pathNodes);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "ranger") {
            const moves = calculateRangerMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "griffin") {
            const moves = calculateGriffinMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "assassin") {
            const moves = calculateAssassinMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "paladin") {
            const moves = calculatePaladinMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            const zones = calculatePaladinProtectionZone(piece, effectivePieces, adjacency, allNodes);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones(zones);
            setWizardBeam(null);

            if (!isObserving) {
              const revealedPieces = revealAssassinsInSpecificZone(pieces, zones, piece.side);
              setPieces(revealedPieces);
            }
          } else if (piece.type === "bard") {
            const moves = calculateBardMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else {
            setHighlights([]);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          }
        } else {
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          setWizardBeam(null);
        }
      }
      return;
    }

    // ===== 已經有選到一顆棋 ======
    const selectedPiece =
      isObserving && viewSnapshotIndex !== null && snapshots[viewSnapshotIndex]
        ? snapshots[viewSnapshotIndex].pieces[selectedPieceIndex]
        : pieces[selectedPieceIndex];

    if (clickedPieceIdx === selectedPieceIndex) {
      setSelectedPieceIndex(-1);
      setHighlights([]);
      setDragonPathNodes([]);
      setProtectionZones([]);
      setWizardBeam(null);
      return;
    }

    const highlight = highlights.find((h) => h.row === row && h.col === col);

    // 觀察模式：只改選取 / 高亮，不做後續動作
    if (!highlight || isObserving) {
      if (clickedPieceIdx !== -1) {
        const piece = effectivePieces[clickedPieceIdx];
        setSelectedPieceIndex(clickedPieceIdx);

        if (isOwnBardOutOfTurnForPiece(piece)) {
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          setWizardBeam(null);
          return;
        }

        const canShowMoves =
          isObserving || localSide === "spectator" || piece.side === localSide || piece.side === "neutral";

        if (canShowMoves && allNodes.length > 0) {
          if (piece.type === "wizard") {
            const moves = calculateWizardMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            const beam = computeWizardBeamSafe(piece, effectivePieces, allNodes, adjacency, holyLights);
            const merged = mergeWizardBeamAttackHighlights({ moves, beam, wizard: piece, pieces: effectivePieces });

            setHighlights(merged);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(beam);
          } else if (piece.type === "apprentice") {
            const moves = calculateApprenticeMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "dragon") {
            const result = calculateDragonMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, burnMarks, holyLights);
            setHighlights(result.highlights);
            setDragonPathNodes(result.pathNodes);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "ranger") {
            const moves = calculateRangerMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "griffin") {
            const moves = calculateGriffinMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "assassin") {
            const moves = calculateAssassinMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else if (piece.type === "paladin") {
            const moves = calculatePaladinMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            const zones = calculatePaladinProtectionZone(piece, effectivePieces, adjacency, allNodes);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones(zones);
            setWizardBeam(null);
          } else if (piece.type === "bard") {
            const moves = calculateBardMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            setHighlights(moves);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          } else {
            setHighlights([]);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(null);
          }
        } else {
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          setWizardBeam(null);
        }
      }
      return;
    }

    // 🔒 真正移動前，再檢查一次是否可以行動（攻擊方）
    if (!canPlay) return;

    // ====== 以下開始「真的改棋盤」 ======
    let newPieces = [...pieces];
    let moveDesc = "";
    const fromCoord = getNodeCoordinate(selectedPiece.row, selectedPiece.col);
    const toCoord = getNodeCoordinate(row, col);
    let updatedBurnMarks = [...burnMarks];
    let localCaptured = cloneCaptured(capturedPieces);

    if (highlight.type === "move") {
      const actualTargetIdx = getPieceAt(pieces, row, col);

      if (actualTargetIdx !== -1) {
        const targetPiece = pieces[actualTargetIdx];

        if (targetPiece.side === selectedPiece.side) {
          setSelectedPieceIndex(-1);
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          setWizardBeam(null);
          return;
        }

        if (
          selectedPiece.type === "bard" &&
          targetPiece.type === "assassin" &&
          targetPiece.side !== selectedPiece.side &&
          targetPiece.stealthed
        ) {
          const bardIdx = selectedPieceIndex;
          const assassinIdx = actualTargetIdx;

          const newBard: Piece = { ...selectedPiece, row, col };

          const newAssassinAny: any = {
            ...targetPiece,
            row: selectedPiece.row,
            col: selectedPiece.col,
            stealthed: false,
          };
          delete newAssassinAny.stealthExpiresOn;
          const newAssassin = newAssassinAny as Piece;

          newPieces[bardIdx] = newBard;
          newPieces[assassinIdx] = newAssassin;

          moveDesc = `${PIECE_CHINESE["bard"]} ${fromCoord} ⇄ 刺客 ${toCoord}（現形）`;
        } else if (targetPiece.type === "bard") {
          setSelectedPieceIndex(-1);
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          setWizardBeam(null);
          return;
        } else {
          if (targetPiece.type === "dragon") {
            const tag = getDragonTag(targetPiece);
            if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
          }

          localCaptured = addCaptured(localCaptured, targetPiece);

          newPieces.splice(actualTargetIdx, 1);
          newPieces = activateAllBards(newPieces);

          const adjustedIdx = actualTargetIdx < selectedPieceIndex ? selectedPieceIndex - 1 : selectedPieceIndex;

          let movedPiece = updateAssassinStealth(
            { ...selectedPiece, row, col },
            selectedPiece.row,
            selectedPiece.col,
            row,
            col
          );
          movedPiece = setAssassinStealthMeta(movedPiece);

          if (movedPiece.type === "assassin") {
            const mp: any = { ...movedPiece, stealthed: false };
            delete mp.stealthExpiresOn;
            movedPiece = mp as Piece;
            movedAssassinFinal = movedPiece;
          }

          newPieces[adjustedIdx] = movedPiece;

          moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
        }
      } else {
        let movedPiece = updateAssassinStealth(
          { ...selectedPiece, row, col },
          selectedPiece.row,
          selectedPiece.col,
          row,
          col
        );
        movedPiece = setAssassinStealthMeta(movedPiece);

        if (movedPiece.type === "assassin" && movedPiece.stealthed) {
          const enemySide = movedPiece.side === "white" ? "black" : "white";
          if (isInProtectionZone(row, col, newPieces, enemySide, adjacency, allNodes)) {
            const mp: any = { ...movedPiece, stealthed: false };
            delete mp.stealthExpiresOn;
            movedPiece = mp as Piece;
          }
          movedAssassinFinal = movedPiece;
        }

        newPieces[selectedPieceIndex] = movedPiece;
        moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${toCoord}`;
      }

      if (selectedPiece.type === "dragon") {
        const dragonTag = getDragonTag(selectedPiece);
        const path = calculateDragonPath(selectedPiece.row, selectedPiece.col, row, col, adjacency, allNodes);

        if (dragonTag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, dragonTag);

        newPieces = ensureDragonTags(newPieces);

        const protectedSet = buildAllPaladinProtectedSet(newPieces, adjacency, allNodes);

        const addIfAllowed = (r: number, c: number) => {
          const key = `${r},${c}`;
          const isProtected = protectedSet.has(key);
          const isEmpty = getPieceAt(newPieces, r, c) === -1;

          if (isProtected && isEmpty) return;

          if (!updatedBurnMarks.some((b) => b.row === r && b.col === c)) {
            const m: any = { row: r, col: c, createdBy: selectedPiece.side };
            if (dragonTag) m.dragonTag = dragonTag;
            updatedBurnMarks.push(m as BurnMark);
          }
        };

        addIfAllowed(selectedPiece.row, selectedPiece.col);
        for (const pathNode of path) {
          if (pathNode.row === row && pathNode.col === col) continue;
          addIfAllowed(pathNode.row, pathNode.col);
        }
      }

      if (selectedPiece.type === "paladin") {
        updatedBurnMarks = removeBurnMarkAtCell(updatedBurnMarks, row, col);
      }
    } else if (highlight.type === "swap") {
      const targetIdx = clickedPieceIdx!;
      const targetPiece = pieces[targetIdx];

      const isWizardApprenticeSwap =
        (selectedPiece.type === "wizard" &&
          targetPiece.type === "apprentice" &&
          targetPiece.side === selectedPiece.side) ||
        (selectedPiece.type === "apprentice" &&
          targetPiece.type === "wizard" &&
          targetPiece.side === selectedPiece.side);

      if (isWizardApprenticeSwap) {
        const apprenticeIdx = selectedPiece.type === "apprentice" ? selectedPieceIndex : targetIdx;
        const wizardIdx = selectedPiece.type === "wizard" ? selectedPieceIndex : targetIdx;

        const apprentice = pieces[apprenticeIdx];
        const wizard = pieces[wizardIdx];

        if ((apprentice as any).swapUsed) {
          setSelectedPieceIndex(-1);
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          setWizardBeam(null);
          return;
        }

        const movedWizard = { ...wizard, row: apprentice.row, col: apprentice.col };
        const movedApprentice: any = { ...apprentice, row: wizard.row, col: wizard.col, swapUsed: true };

        newPieces[wizardIdx] = movedWizard;
        newPieces[apprenticeIdx] = movedApprentice as Piece;

        moveDesc = `${PIECE_CHINESE[wizard.type]} ${fromCoord} ⇄ ${PIECE_CHINESE["apprentice"]} ${toCoord}`;
      } else {
        let movedPiece = updateAssassinStealth(
          { ...selectedPiece, row, col },
          selectedPiece.row,
          selectedPiece.col,
          row,
          col
        );
        let swappedPiece = updateAssassinStealth(
          { ...targetPiece, row: selectedPiece.row, col: selectedPiece.col },
          targetPiece.row,
          targetPiece.col,
          selectedPiece.row,
          selectedPiece.col
        );

        movedPiece = setAssassinStealthMeta(movedPiece);
        swappedPiece = setAssassinStealthMeta(swappedPiece);

        if (movedPiece.type === "assassin") {
          const mp: any = { ...movedPiece, stealthed: false };
          delete mp.stealthExpiresOn;
          movedPiece = mp as Piece;
          movedAssassinFinal = movedPiece;
        }
        if (swappedPiece.type === "assassin") {
          const sp: any = { ...swappedPiece, stealthed: false };
          delete sp.stealthExpiresOn;
          swappedPiece = sp as Piece;
        }

        newPieces[selectedPieceIndex] = movedPiece;
        newPieces[targetIdx] = swappedPiece;

        if (movedPiece.type === "paladin") {
          const zones = calculatePaladinProtectionZone(movedPiece, newPieces, adjacency, allNodes);
          const revealedPieces = revealAssassinsInSpecificZone(newPieces, zones, movedPiece.side);
          for (let i = 0; i < newPieces.length; i++) newPieces[i] = revealedPieces[i];
          updatedBurnMarks = removeBurnMarkAtCell(updatedBurnMarks, movedPiece.row, movedPiece.col);
        }

        if (swappedPiece.type === "paladin") {
          const zones = calculatePaladinProtectionZone(swappedPiece, newPieces, adjacency, allNodes);
          const revealedPieces = revealAssassinsInSpecificZone(newPieces, zones, swappedPiece.side);
          for (let i = 0; i < newPieces.length; i++) newPieces[i] = revealedPieces[i];
          updatedBurnMarks = removeBurnMarkAtCell(updatedBurnMarks, swappedPiece.row, swappedPiece.col);
        }

        moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⇄ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
      }
} else if (highlight.type === "attack") {
  const targetIdx = clickedPieceIdx!;
  const targetPiece = pieces[targetIdx];

  // ====== 巫師：先判斷「相鄰」與「是否為導線 target」 ======
  const isWizard = selectedPiece.type === "wizard";

  const wizardNodeIdx =
    isWizard ? allNodes.findIndex((n) => n.row === selectedPiece.row && n.col === selectedPiece.col) : -1;
  const targetNodeIdx = allNodes.findIndex((n) => n.row === row && n.col === col);

  const isAdjacent =
    isWizard && wizardNodeIdx !== -1 && targetNodeIdx !== -1 && !!adjacency[wizardNodeIdx]?.includes(targetNodeIdx);

  // ✅ 只有點到的格子剛好等於 wizardBeam.target 才算「導線射擊目標」
  const isBeamTarget =
    isWizard && !!wizardBeam?.target && wizardBeam.target.row === row && wizardBeam.target.col === col;

  // ✅ 只有「同一個目標」同時滿足：相鄰 + 導線target，才跳出選單
  if (isWizard && isAdjacent && isBeamTarget) {
    setWizardAttackRequest({
      wizardIndex: selectedPieceIndex,
      targetRow: row,
      targetCol: col,
      targetPieceIndex: targetIdx,
    });

    setSelectedPieceIndex(-1);
    setHighlights([]);
    setDragonPathNodes([]);
    setProtectionZones([]);
    setWizardBeam(null);
    return;
  }

  // ====== 守護判定（不管是走過去打 or 導線打，只要是攻擊都要先問守護） ======
  const guardingPaladinIndices =
    targetPiece.side !== "neutral"
      ? findGuardingPaladins(row, col, pieces, targetPiece.side, adjacency, allNodes)
      : [];

  if (guardingPaladinIndices.length > 0) {
    const pendingGuard: PendingGuard = {
      targetRow: row,
      targetCol: col,
      targetPieceIndex: targetIdx,
      attackerPieceIndex: selectedPieceIndex,
      defenderSide: targetPiece.side as PlayerSide,
      guardPaladinIndices: guardingPaladinIndices,
    };

    const syncState: SyncedState = {
      pieces,
      currentPlayer,
      moveHistory,
      burnMarks,
      holyLights,
      capturedPieces,
      winner,
      seats,
      startingPlayer,
      startingMode,
      ready,
      gameStarted,
      pendingGuard,
    };

    applySyncedState(syncState);
    broadcastState(syncState);
    return;
  }

  // ====== 吃子（bard 不可被擊殺） ======
  if (targetPiece.type !== "bard") {
    if (targetPiece.type === "dragon") {
      const tag = getDragonTag(targetPiece);
      if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
    }

    localCaptured = addCaptured(localCaptured, targetPiece);
    newPieces.splice(targetIdx, 1);
    newPieces = activateAllBards(newPieces);
  }

  // 吃掉後 index 可能改變
  const adjustedIdx =
    targetPiece.type !== "bard" && targetIdx < selectedPieceIndex ? selectedPieceIndex - 1 : selectedPieceIndex;

  // ====== 根據攻擊者處理「是否移動」 ======
  if (targetPiece.type !== "bard") {
    if (selectedPiece.type === "wizard") {
      // ✅ 規則：
      // - 只有導線(非相鄰) → 站著導線打：不移動
      // - 只有相鄰(非導線target) → 走過去打：移動
      // - 同時相鄰+導線target → 已在上面 return 彈窗處理
      if (isBeamTarget && !isAdjacent) {
        // 站著導線打：巫師不移動
      } else {
        // 走過去打：巫師移動到目標格
        const movedWizard: Piece = { ...selectedPiece, row, col };
        newPieces[adjustedIdx] = movedWizard;
      }
    } else if (selectedPiece.type === "dragon") {
      const dragonTag = getDragonTag(selectedPiece);
      const path = calculateDragonPath(selectedPiece.row, selectedPiece.col, row, col, adjacency, allNodes);

      if (dragonTag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, dragonTag);

      let movedPiece = updateAssassinStealth(
        { ...selectedPiece, row, col },
        selectedPiece.row,
        selectedPiece.col,
        row,
        col
      );
      movedPiece = ensureDragonTags([movedPiece])[0];
      newPieces[adjustedIdx] = movedPiece;

      const protectedSet = buildAllPaladinProtectedSet(newPieces, adjacency, allNodes);

      const addIfAllowed = (r: number, c: number) => {
        const key = `${r},${c}`;
        const isProtected = protectedSet.has(key);
        const isEmpty = getPieceAt(newPieces, r, c) === -1;
        if (isProtected && isEmpty) return;

        if (!updatedBurnMarks.some((b) => b.row === r && b.col === c)) {
          const m: any = { row: r, col: c, createdBy: movedPiece.side };
          const tag = getDragonTag(movedPiece);
          if (tag) m.dragonTag = tag;
          updatedBurnMarks.push(m as BurnMark);
        }
      };

      addIfAllowed(selectedPiece.row, selectedPiece.col);
      for (const node of path) {
        if (node.row === row && node.col === col) continue;
        addIfAllowed(node.row, node.col);
      }
    } else {
      let movedPiece = updateAssassinStealth(
        { ...selectedPiece, row, col },
        selectedPiece.row,
        selectedPiece.col,
        row,
        col
      );
      movedPiece = setAssassinStealthMeta(movedPiece);

      if (movedPiece.type === "assassin") {
        const mp: any = { ...movedPiece, stealthed: false };
        delete mp.stealthExpiresOn;
        movedPiece = mp as Piece;
        movedAssassinFinal = movedPiece;
      }

      newPieces[adjustedIdx] = movedPiece;
    }
  }

  // ✅ 若攻擊者是聖騎士：清掉目的地灼痕
  if (selectedPiece.type === "paladin") {
    updatedBurnMarks = removeBurnMarkAtCell(updatedBurnMarks, row, col);
  }

  // ====== moveDesc（巫師要區分導線/移動） ======
  if (selectedPiece.type === "wizard") {
    if (targetPiece.type === "bard") {
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`;
    } else if (isBeamTarget && !isAdjacent) {
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⟼ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (導線射擊)`;
    } else {
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (巫師移動)`;
    }
  } else {
    moveDesc =
      targetPiece.type === "bard"
        ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`
        : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
  }
}


    if (selectedPiece.type === "paladin") {
      const movedPaladin =
        newPieces[
          highlight.type === "attack" && clickedPieceIdx! < selectedPieceIndex ? selectedPieceIndex - 1 : selectedPieceIndex
        ];

      if (movedPaladin) {
        const zones = calculatePaladinProtectionZone(movedPaladin, newPieces, adjacency, allNodes);
        const revealedPieces = revealAssassinsInSpecificZone(newPieces, zones, movedPaladin.side);
        for (let i = 0; i < newPieces.length; i++) newPieces[i] = revealedPieces[i];
      }
    }

    if (selectedPiece.type === "bard" && highlight.type === "move") {
      const bardNewIdx = selectedPieceIndex;
      const movedBard = newPieces[bardNewIdx];

      if (movedBard) {
        setPieces(newPieces);
        setCapturedPieces(localCaptured);
        setBurnMarks(updatedBurnMarks);

        setBardNeedsSwap({ bardIndex: bardNewIdx, bardRow: movedBard.row, bardCol: movedBard.col });

        const swapHighlights: MoveHighlight[] = newPieces
          .filter((p) => p.side === currentPlayer && p.type !== "bard" && p.type !== "dragon" && p.type !== "wizard")
          .map((p) => ({ type: "swap" as const, row: p.row, col: p.col }));

        setHighlights(swapHighlights);
        setDragonPathNodes([]);
        setProtectionZones([]);
        setWizardBeam(null);
        return;
      }
    }

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    const remainingBurnMarks = updatedBurnMarks;
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

    const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);

    const finalized = finalizeTurnNoAutoShot({
      piecesAfterStealthExpire,
      updatedBurnMarks: remainingBurnMarks,
      remainingHolyLights,
      localCaptured,
      newMoveHistory,
      nextPlayer,
      result,
    });

    const syncState: SyncedState = {
      pieces: finalized.pieces,
      currentPlayer: finalized.winner ? currentPlayer : nextPlayer,
      moveHistory: finalized.moveHistory,
      burnMarks: finalized.burnMarks,
      holyLights: finalized.holyLights,
      capturedPieces: finalized.capturedPieces,
      winner: finalized.winner ?? winner,
      seats,
      startingPlayer,
      startingMode,
      ready,
      gameStarted,
      pendingGuard: null,
    };

    applySyncedState(syncState);
    broadcastState(syncState);
  };

  // ====== 棋盤顯示用狀態 ======
  const boardState: SyncedState =
    isObserving && viewSnapshotIndex !== null && snapshots[viewSnapshotIndex]
      ? snapshots[viewSnapshotIndex]
      : ({
          pieces,
          burnMarks,
          holyLights,
          capturedPieces,
          moveHistory,
          currentPlayer,
          seats,
          startingPlayer,
          startingMode,
          ready,
          gameStarted,
          winner,
          pendingGuard: null,
        } as SyncedState);

  // 是否輪到「我」這一方
  const isMyTurn = !winner && gameStarted && localSide !== "spectator" && localSide === boardState.currentPlayer;

  const displayPieces: Piece[] = isObserving
    ? boardState.pieces.map((p) => (p.type === "assassin" ? { ...p, stealthed: false } : p))
    : boardState.pieces;

  const effectivePiecesForPanel = boardState.pieces;
  const selectedPieceForPanel = selectedPieceIndex !== -1 ? effectivePiecesForPanel[selectedPieceIndex] : null;

  // ====== 歷史回放 點擊 ======
  const handleSelectMoveFromHistory = (index: number) => {
    if (!isObserving) return;
    if (snapshots.length === 0) return;

    const latest = snapshots[snapshots.length - 1];
    const totalMoves = latest.moveHistory.length;
    if (totalMoves === 0) return;

    const moveNumber = totalMoves - index;
    let snapshotIndex = moveNumber;

    if (snapshotIndex < 0) snapshotIndex = 0;
    if (snapshotIndex >= snapshots.length) snapshotIndex = snapshots.length - 1;

    const movedIndices = findMovedPieceIndicesForSnapshot(snapshotIndex);

    setViewSnapshotIndex(snapshotIndex);
    setSelectedPieceIndex(movedIndices.length > 0 ? movedIndices[0] : -1);
    setHighlights([]);
    setDragonPathNodes([]);
    setProtectionZones([]);
    setWizardBeam(null);
  };

  // ---- 準備階段 ready 顯示 ----
  const myReady = localSide === "white" ? ready.white : localSide === "black" ? ready.black : false;
  const otherReady = localSide === "white" ? ready.black : localSide === "black" ? ready.white : false;

  // ---- 移動紀錄顯示文字（視角） ----
  const baseHistory = snapshots.length > 0 ? snapshots[snapshots.length - 1].moveHistory : moveHistory;

  let displayHistory: string[] = [];
  if (baseHistory) {
    if (isObserving || localSide === "spectator") displayHistory = baseHistory.map((r) => r.fullText);
    else if (localSide === "white") displayHistory = baseHistory.map((r) => r.whiteText);
    else if (localSide === "black") displayHistory = baseHistory.map((r) => r.blackText);
  }

  // ================== UI ==================

  // -------------- 未進房：輸入房間密碼 --------------
  if (!inRoom) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-700 rounded-2xl p-6 shadow-xl">
          <h1 className="text-2xl font-bold text-center mb-2 text-slate-100">巫師棋 Wizard Chess</h1>
          <p className="text-xs text-slate-400 text-center mb-6">
            請輸入本局的密碼（必填）。<br />
            之後其他玩家輸入相同密碼即可加入同一局。
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="room-password" className="block text-sm text-slate-300 mb-1">
                房間密碼（必填）
              </label>
              <input
                id="room-password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-600 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="請輸入房間密碼"
              />
            </div>

            <button
              onClick={handleJoinRoom}
              className="w-full mt-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2 text-sm"
            >
              建立 / 加入 房間
            </button>

            {roomError && <div className="text-red-400 text-xs mt-2">{roomError}</div>}

            <div className="text-[11px] text-slate-500 text-center mt-4">
              WebSocket 狀態：
              {socketStatus === "connecting" && "連線中..."}
              {socketStatus === "connected" && "已連線"}
              {socketStatus === "disconnected" && "未連線"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------- 已進房但尚未開始：準備階段畫面 --------------
  if (inRoom && !gameStarted) {
    const startingText = startingMode === "random" ? "隨機" : startingPlayer === "white" ? "白方先攻" : "黑方先攻";

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-lg bg-slate-900/80 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-6">
          <h1 className="text-2xl font-bold text-center text-slate-100">巫師棋 Wizard Chess</h1>
          <p className="text-lg text-slate-300 text-center font-medium">
            準備階段：請先選擇白方、黑方或觀戰，並設定這局的先後攻。白方與黑方都按下「開始遊戲」後，對局才會正式開始。
          </p>

          {/* 座位選擇 */}
          <div>
            <div className="text-sm text-slate-200 mb-2 text-center">座位選擇</div>
            <div className="flex justify-center items-center gap-4 mb-2 text-sm text-slate-300">
              <button
                className={`px-3 py-1 rounded-full border ${
                  localSide === "white"
                    ? "bg-slate-100 text-slate-900 border-slate-100"
                    : "border-slate-500 hover:border-slate-300"
                }`}
                onClick={() => handleChooseSide("white")}
              >
                白方
              </button>
              <button
                className={`px-3 py-1 rounded-full border ${
                  localSide === "black"
                    ? "bg-slate-100 text-slate-900 border-slate-100"
                    : "border-slate-500 hover:border-slate-300"
                }`}
                onClick={() => handleChooseSide("black")}
              >
                黑方
              </button>
              <button
                className={`px-3 py-1 rounded-full border ${
                  localSide === "spectator"
                    ? "bg-slate-100 text-slate-900 border-slate-100"
                    : "border-slate-500 hover:border-slate-300"
                }`}
                onClick={() => handleChooseSide("spectator")}
              >
                觀戰
              </button>
            </div>
            <div className="text-[11px] text-slate-400 text-center">
              白方：{seats.whiteOwnerId ? "有人就座" : "空位"} ｜ 黑方：{seats.blackOwnerId ? "有人就座" : "空位"}
            </div>
            {seatError && <div className="text-xs text-red-400 mt-1 text-center">{seatError}</div>}
          </div>

          {/* 先後攻設定 */}
          <div>
            <div className="text-sm text-slate-200 mb-2 text-center">先後攻設定</div>
            <div className="text-xs text-slate-400 text-center mb-2">
              目前設定： <span className="text-emerald-300">{startingText}</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={handleToggleStartingPlayer}
                className="px-3 py-1 rounded-lg border border-slate-600 bg-slate-950 text-xs text-slate-100 hover:border-emerald-400 hover:text-emerald-300"
              >
                自訂先後攻： {startingPlayer === "white" ? "白方先攻" : "黑方先攻"}
              </button>
              <button
                onClick={handleRandomStartingPlayer}
                className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs text-slate-950 font-semibold"
              >
                隨機決定先後攻
              </button>
            </div>
          </div>

          {/* 準備狀態 */}
          <div>
            <div className="text-sm text-slate-200 mb-2 text-center">準備狀態</div>
            {localSide === "spectator" ? (
              <div className="text-xs text-slate-400 text-center">
                目前為觀戰模式，無需準備。
                <br />
                若要參與對局，請先選擇白方或黑方。
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <button
                    onClick={handlePressReady}
                    disabled={myReady}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                      myReady
                        ? "bg-slate-700 text-slate-300 cursor-default"
                        : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                    }`}
                  >
                    {myReady ? "已準備完成" : "開始遊戲"}
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-slate-400 text-center">
                  白方：{ready.white ? "已準備" : "未準備"} ｜ 黑方：{ready.black ? "已準備" : "未準備"}
                </div>
                <div className="mt-1 text-[11px] text-amber-300 text-center">
                  {myReady && !otherReady && "你已準備完成，正在等待另一位玩家…"}
                  {!myReady && otherReady && "另一位玩家已準備完成，請按「開始遊戲」開始對局。"}
                  {myReady && otherReady && "雙方已準備完成，對局即將開始。"}
                </div>
              </>
            )}
          </div>

          <div className="text-[11px] text-slate-500 text-center">
            WebSocket 狀態：
            {socketStatus === "connecting" && "連線中..."}
            {socketStatus === "connected" && "已連線"}
            {socketStatus === "disconnected" && "未連線"}
          </div>
        </div>
      </div>
    );
  }

  // -------------- 已進房且遊戲已開始：棋盤畫面 --------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-3xl font-bold text-center mb-4 text-slate-100" data-testid="text-title">
          巫師棋 Wizard Chess
        </h1>

        {/* Debug 資訊 */}
        <div className="text-xs text-center mb-2 text-slate-400 font-mono" data-testid="text-debug">
          選中: {selectedPieceIndex >= 0 ? `#${selectedPieceIndex}` : "無"} | 高亮: {highlights.length} | 玩家:{" "}
          {boardState.currentPlayer} | 守護區: {protectionZones.length}
          {protectionZones.length > 0 && (
            <span className="ml-2">[{protectionZones.map((z) => `${getNodeCoordinate(z.row, z.col)}`).join(", ")}]</span>
          )}
        </div>

        {/* 回合與玩家狀態列 */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-3">
          <div
            className={`px-3 py-1 rounded-full text-xs sm:text-sm border ${
              isMyTurn
                ? "border-emerald-400 text-emerald-300 bg-emerald-500/10"
                : "border-slate-600 text-slate-200 bg-slate-800/60"
            }`}
          >
            目前回合：{boardState.currentPlayer === "white" ? "白方" : "黑方"}
          </div>

          <div className="px-3 py-1 rounded-full text-[11px] sm:text-xs border border-slate-700 text-slate-300 bg-slate-900/60">
            {localSide === "spectator"
              ? "你目前是：觀戰者"
              : `你扮演：${localSide === "white" ? "白方" : "黑方"}${isMyTurn ? "（現在輪到你）" : ""}`}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6 items-start">
          {/* 左邊：被吃掉的棋子（上） + 棋子資訊（下） */}
          <div className="order-2 lg:order-1 flex flex-col gap-4">
            <CapturedPiecesPanel capturedPieces={boardState.capturedPieces} />
            <PieceInfoPanel piece={selectedPieceForPanel || null} />
          </div>

          {/* 中間：棋盤 */}
          <div className="order-1 lg:order-2 flex justify-center">
            <GameBoard
              pieces={displayPieces}
              selectedPieceIndex={selectedPieceIndex}
              highlights={highlights}
              currentPlayer={boardState.currentPlayer}
              onNodeClick={handleNodeClick}
              burnMarks={boardState.burnMarks}
              protectionZones={protectionZones}
              holyLights={boardState.holyLights}
              viewerSide={localSide}
              observing={isObserving}
              wizardBeam={wizardBeam}
            />
          </div>

          {/* 右邊：回合資訊 + 歷史 */}
          <div className="order-3 flex flex-col gap-3">
            {winner && (
              <button
                onClick={handleRestartGame}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2 text-sm"
              >
                再來一局
              </button>
            )}
            <TurnHistoryPanel
              currentPlayer={currentPlayer}
              moveHistory={displayHistory}
              winner={winner}
              onSelectMove={handleSelectMoveFromHistory}
            />
          </div>
        </div>
      </div>

      {/* 結束遊戲彈出視窗 */}
      {winner && showEndModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-xs text-center shadow-2xl">
            <div className="text-lg font-bold text-slate-100 mb-1">{winner === "white" ? "白方勝利" : "黑方勝利"}</div>
            <div className="text-xs text-slate-400 mb-4">巫師被擊倒，遊戲結束。</div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleRestartGame}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2 text-sm"
              >
                再來一局
              </button>
              <button
                onClick={() => setShowEndModal(false)}
                className="w-full rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold py-2 text-sm"
              >
                觀察棋局
              </button>
              <button
                onClick={handleExitGame}
                className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold py-2 text-sm"
              >
                退出遊戲
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 聖騎士守護視窗：只在「防守方」那台機器顯示 */}
      <GuardDialog
        isOpen={guardDialogOpen && !!guardRequest && localSide === guardRequest?.defenderSide}
        guardOptions={guardOptions}
        targetCoordinate={guardRequest ? getNodeCoordinate(guardRequest.targetRow, guardRequest.targetCol) : ""}
        selectedPaladinIndex={selectedGuardPaladinIndex}
        onChangeSelectedPaladin={handleChangeSelectedGuardPaladin}
        onConfirmGuard={handleGuardConfirm}
        onDecline={handleGuardDecline}
      />

      {/* 巫師攻擊方式選擇視窗 */}
      <WizardAttackDialog
        isOpen={!!wizardAttackRequest}
        targetCoordinate={wizardAttackRequest ? getNodeCoordinate(wizardAttackRequest.targetRow, wizardAttackRequest.targetCol) : ""}
        onLineShot={handleWizardLineShot}
        onMoveAttack={handleWizardMoveAttack}
      />
    </div>
  );
}
