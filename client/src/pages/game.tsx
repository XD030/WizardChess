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

type WizardAttackMode = "line" | "move";

type PlayMode = "pvp" | "solo";

interface PendingGuard {
  targetRow: number;
  targetCol: number;
  targetPieceIndex: number;
  attackerPieceIndex: number;
  defenderSide: PlayerSide;
  guardPaladinIndices: number[];
  wizardAttackMode?: WizardAttackMode | null;
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
    p.stealthExpiresOn = piece.side;
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

function activateAllBards(pieces: Piece[]): Piece[] {
  return pieces.map((piece) => {
    if (piece.type !== "bard") return piece;

    const p: any = piece;
    return {
      ...piece,
      activated: true,
      isActivated: true,
      active: true,
      activatedAt: p.activatedAt ?? Date.now(),
    } as Piece;
  });
}

function cloneCaptured(captured: CapturedMap): CapturedMap {
  return {
    white: [...captured.white],
    black: [...captured.black],
    neutral: [...captured.neutral],
  };
}

function addCaptured(captured: CapturedMap, piece: Piece): CapturedMap {
  const side = piece.side as keyof CapturedMap;
  return {
    ...captured,
    [side]: [...captured[side], piece],
  };
}

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

function isAdjacentCell(
  aRow: number,
  aCol: number,
  bRow: number,
  bCol: number,
  allNodes: NodePosition[],
  adjacency: number[][]
) {
  const ai = allNodes.findIndex((n) => n.row === aRow && n.col === aCol);
  const bi = allNodes.findIndex((n) => n.row === bRow && n.col === bCol);
  if (ai === -1 || bi === -1) return false;
  return !!adjacency[ai]?.includes(bi);
}

function mergeWizardBeamAttackHighlights(args: {
  moves: MoveHighlight[];
  beam: WizardBeamResult | null;
  wizard: Piece;
  pieces: Piece[];
}): MoveHighlight[] {
  const { moves, beam, wizard, pieces } = args;

  if (!beam?.target) return moves;

  const t = beam.target;
  const tIdx = getPieceAt(pieces, t.row, t.col);
  if (tIdx === -1) return moves;

  const targetPiece = pieces[tIdx];

  if (targetPiece.side === wizard.side) return moves;
  if (targetPiece.type === "bard") return moves;

  const already = moves.some((h) => h.type === "attack" && h.row === t.row && h.col === t.col);
  return already ? moves : [...moves, { type: "attack" as const, row: t.row, col: t.col }];
}

function isWizardConductorStrict(wizardSide: Side, p: Piece): boolean {
  if (p.type === "apprentice") return p.side === wizardSide;

  if (p.type === "bard") {
    const anyP: any = p;
    const activated = !!(anyP.activated || anyP.isActivated || anyP.active);
    return activated && (p.side === wizardSide || p.side === "neutral");
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

function validatePathContinuous(nodes: { row: number; col: number }[], allNodes: NodePosition[], adjacency: number[][]) {
  for (let i = 0; i < nodes.length - 1; i++) {
    if (!isAdjacentByAdjacency(nodes[i], nodes[i + 1], allNodes, adjacency)) return false;
  }
  return true;
}

function validateEdgesMatchNodes(nodes: { row: number; col: number }[], edges: any[] | undefined | null) {
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
    return normalizeBeamForUI(wizard);
  }

  if (!validatePathContinuous(nodes, allNodes, adjacency)) {
    return normalizeBeamForUI(wizard);
  }
  if (!validateEdgesMatchNodes(nodes, (raw as any).pathEdges)) {
    return normalizeBeamForUI(wizard);
  }

  const tIdx = getPieceAt(pieces, raw.target.row, raw.target.col);
  if (tIdx === -1) return normalizeBeamForUI(wizard);
  const tp = pieces[tIdx];
  if (tp.side === wizard.side) return normalizeBeamForUI(wizard);
  if (tp.type === "bard") return normalizeBeamForUI(wizard);

  if (!isSamePos(nodes[0], { row: wizard.row, col: wizard.col })) {
    return normalizeBeamForUI(wizard);
  }

  if (!isSamePos(nodes[nodes.length - 1], raw.target)) {
    return normalizeBeamForUI(wizard);
  }

  const pre = nodes[nodes.length - 2];
  const preIdx = getPieceAt(pieces, pre.row, pre.col);
  if (preIdx === -1) return normalizeBeamForUI(wizard);
  if (!isWizardConductorStrict(wizard.side, pieces[preIdx])) return normalizeBeamForUI(wizard);
  if (!isAdjacentByAdjacency(pre, raw.target, allNodes, adjacency)) return normalizeBeamForUI(wizard);

  let conductorCount = 0;
  let consecutiveEmpty = 0;

  for (let i = 1; i < nodes.length - 1; i++) {
    const n = nodes[i];

    if (holyLights.some((l) => l.row === n.row && l.col === n.col)) {
      return normalizeBeamForUI(wizard);
    }

    const idx = getPieceAt(pieces, n.row, n.col);

    if (idx === -1) {
      consecutiveEmpty++;
      if (consecutiveEmpty > 1) {
        return normalizeBeamForUI(wizard);
      }
      continue;
    }

    const p = pieces[idx];
    if (!isWizardConductorStrict(wizard.side, p)) return normalizeBeamForUI(wizard);

    consecutiveEmpty = 0;
    conductorCount++;
  }

  if (conductorCount < 1) return normalizeBeamForUI(wizard);

  for (let i = 1; i < nodes.length - 1; i++) {
    const prev = nodes[i - 1];
    const cur = nodes[i];
    const next = nodes[i + 1];

    const d1 = { r: cur.row - prev.row, c: cur.col - prev.col };
    const d2 = { r: next.row - cur.row, c: next.col - cur.col };

    const turned = d1.r !== d2.r || d1.c !== d2.c;
    if (!turned) continue;

    if (cur.row === wizard.row && cur.col === wizard.col) return normalizeBeamForUI(wizard);

    const idx = getPieceAt(pieces, cur.row, cur.col);
    if (idx === -1) return normalizeBeamForUI(wizard);
    if (!isWizardConductorStrict(wizard.side, pieces[idx])) return normalizeBeamForUI(wizard);
  }

  return raw;
}

function isWizardLineShotAttack(
  selectedPiece: Piece,
  row: number,
  col: number,
  pieces: Piece[],
  allNodes: NodePosition[],
  adjacency: number[][],
  holyLights: HolyLight[]
): boolean {
  if (selectedPiece.type !== "wizard") return false;

  const beam = computeWizardBeamSafe(selectedPiece, pieces, allNodes, adjacency, holyLights);
  if (!beam?.target) return false;
  if (beam.target.row !== row || beam.target.col !== col) return false;

  const wIdx = allNodes.findIndex((n) => n.row === selectedPiece.row && n.col === selectedPiece.col);
  const tIdx = allNodes.findIndex((n) => n.row === row && n.col === col);
  if (wIdx === -1 || tIdx === -1) return false;

  const isAdjacent = !!adjacency[wIdx]?.includes(tIdx);
  return !isAdjacent;
}

function isWizardBeamTargetAvailable(
  selectedPiece: Piece,
  row: number,
  col: number,
  pieces: Piece[],
  allNodes: NodePosition[],
  adjacency: number[][],
  holyLights: HolyLight[]
): boolean {
  if (selectedPiece.type !== "wizard") return false;
  const beam = computeWizardBeamSafe(selectedPiece, pieces, allNodes, adjacency, holyLights);
  if (!beam?.target) return false;
  return beam.target.row === row && beam.target.col === col;
}

function computeAllWizardBeamTargetsSafe(
  wizard: Piece,
  pieces: Piece[],
  allNodes: NodePosition[],
  adjacency: number[][],
  holyLights: HolyLight[] = []
): { row: number; col: number }[] {
  if (wizard.type !== "wizard") return [];

  const holySet = new Set(holyLights.map((l) => `${l.row},${l.col}`));

  const idxAt = (r: number, c: number) => getPieceAt(pieces, r, c);

  const isEnemyAttackable = (p: Piece) => {
    if (p.side === wizard.side) return false;
    if (p.type === "bard") return false;
    return true;
  };

  const targets = new Set<string>();

  type State = {
    cur: { row: number; col: number };
    prev: { row: number; col: number } | null;
    dir: { dr: number; dc: number } | null;
    consecutiveEmpty: number;
  };

  const stateKey = (s: State) =>
    `${s.cur.row},${s.cur.col}|${s.prev ? `${s.prev.row},${s.prev.col}` : "n"}|${
      s.dir ? `${s.dir.dr},${s.dir.dc}` : "n"
    }|${s.consecutiveEmpty}`;

  const seen = new Set<string>();
  const stack: State[] = [
    { cur: { row: wizard.row, col: wizard.col }, prev: null, dir: null, consecutiveEmpty: 0 },
  ];

  const canTurnHere = (r: number, c: number) => {
    const idx = idxAt(r, c);
    if (idx === -1) return false;
    return isWizardConductorStrict(wizard.side, pieces[idx]);
  };

  while (stack.length > 0) {
    const s = stack.pop()!;
    const k = stateKey(s);
    if (seen.has(k)) continue;
    seen.add(k);

    if (holySet.has(`${s.cur.row},${s.cur.col}`)) continue;

    const curIdx = idxAt(s.cur.row, s.cur.col);
    const curIsWizard = s.cur.row === wizard.row && s.cur.col === wizard.col;
    const curIsEmpty = curIdx === -1;
    const curIsConductor = !curIsWizard && !curIsEmpty && isWizardConductorStrict(wizard.side, pieces[curIdx]);

    const curNodeIndex = allNodes.findIndex((n) => n.row === s.cur.row && n.col === s.cur.col);
    if (curNodeIndex === -1) continue;

    if (curIsConductor) {
      const neigh = adjacency[curNodeIndex] || [];
      for (const ni of neigh) {
        const nn = allNodes[ni];
        if (!nn) continue;
        if (holySet.has(`${nn.row},${nn.col}`)) continue;

        const nIdx = idxAt(nn.row, nn.col);
        if (nIdx === -1) continue;
        const p = pieces[nIdx];
        if (isEnemyAttackable(p)) targets.add(`${nn.row},${nn.col}`);
      }
    }

    const neighbors = adjacency[curNodeIndex] || [];
    for (const ni of neighbors) {
      const nn = allNodes[ni];
      if (!nn) continue;
      if (holySet.has(`${nn.row},${nn.col}`)) continue;

      if (s.prev && nn.row === s.prev.row && nn.col === s.prev.col) continue;

      const nextIdx = idxAt(nn.row, nn.col);
      const nextIsEmpty = nextIdx === -1;
      const nextIsConductor = !nextIsEmpty && isWizardConductorStrict(wizard.side, pieces[nextIdx]);

      const ndir = { dr: nn.row - s.cur.row, dc: nn.col - s.cur.col };

      if (s.dir) {
        const turning = ndir.dr !== s.dir.dr || ndir.dc !== s.dir.dc;

        if (curIsEmpty && turning) continue;

        if (turning) {
          if (curIsWizard) continue;
          if (!canTurnHere(s.cur.row, s.cur.col)) continue;
        }
      }

      const nextConsecutiveEmpty = nextIsEmpty ? s.consecutiveEmpty + 1 : 0;
      if (nextConsecutiveEmpty > 1) continue;

      if (!nextIsEmpty && !nextIsConductor) continue;

      stack.push({
        cur: { row: nn.row, col: nn.col },
        prev: { row: s.cur.row, col: s.cur.col },
        dir: s.dir ? ndir : ndir,
        consecutiveEmpty: nextConsecutiveEmpty,
      });
    }
  }

  return Array.from(targets).map((key) => {
    const [r, c] = key.split(",").map((x) => parseInt(x, 10));
    return { row: r, col: c };
  });
}

function mergeWizardBeamAttackHighlightsAllTargets(args: {
  moves: MoveHighlight[];
  targets: { row: number; col: number }[];
  wizard: Piece;
  pieces: Piece[];
}): MoveHighlight[] {
  const { moves, targets, wizard, pieces } = args;

  const out = [...moves];
  for (const t of targets) {
    const tIdx = getPieceAt(pieces, t.row, t.col);
    if (tIdx === -1) continue;
    const tp = pieces[tIdx];
    if (tp.side === wizard.side) continue;
    if (tp.type === "bard") continue;

    const already = out.some((h) => h.type === "attack" && h.row === t.row && h.col === t.col);
    if (!already) out.push({ type: "attack" as const, row: t.row, col: t.col });
  }
  return out;
}

export default function Game() {
  const clientIdRef = useRef<string>("");
  if (!clientIdRef.current) {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      clientIdRef.current = crypto.randomUUID();
    } else {
      clientIdRef.current = Math.random().toString(36).slice(2);
    }
  }

  const [playMode, setPlayMode] = useState<PlayMode>("pvp");

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

  const [startingPlayer, setStartingPlayer] = useState<PlayerSide>("white");
  const [startingMode, setStartingMode] = useState<StartingMode>("manual");
  const [ready, setReady] = useState<ReadyState>({ white: false, black: false });
  const [gameStarted, setGameStarted] = useState(false);

  const [showEndModal, setShowEndModal] = useState(false);

  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number>(-1);
  const [highlights, setHighlights] = useState<MoveHighlight[]>([]);
  const [allNodes, setAllNodes] = useState<NodePosition[]>([]);
  const [adjacency, setAdjacency] = useState<number[][]>([]);
  const [dragonPathNodes, setDragonPathNodes] = useState<{ row: number; col: number }[]>([]);
  const [protectionZones, setProtectionZones] = useState<{ row: number; col: number }[]>([]);

  const [wizardBeam, setWizardBeam] = useState<WizardBeamResult | null>(null);

  const [wizardAttackRequest, setWizardAttackRequest] = useState<{
    wizardIndex: number;
    targetRow: number;
    targetCol: number;
    targetPieceIndex: number;
  } | null>(null);

  const [guardDialogOpen, setGuardDialogOpen] = useState(false);
  const [guardOptions, setGuardOptions] = useState<GuardOption[]>([]);
  const [guardRequest, setGuardRequest] = useState<{
    targetRow: number;
    targetCol: number;
    targetPieceIndex: number;
    attackerPieceIndex: number;
    defenderSide: PlayerSide;
    wizardAttackMode?: WizardAttackMode | null;
  } | null>(null);
  const [selectedGuardPaladinIndex, setSelectedGuardPaladinIndex] = useState<number | null>(null);

  const [bardNeedsSwap, setBardNeedsSwap] = useState<{
    bardIndex: number;
    bardRow: number;
    bardCol: number;
  } | null>(null);
  const bardSwapActiveRef = useRef(false);
  useEffect(() => {
    bardSwapActiveRef.current = !!bardNeedsSwap;
  }, [bardNeedsSwap]);

  const [localSide, setLocalSide] = useState<"white" | "black" | "spectator">("spectator");

  const isOwnBardOutOfTurnForPiece = (piece: Piece | null): boolean => {
    if (playMode === "solo") return false;
    if (!piece) return false;
    if (piece.type !== "bard") return false;
    if (localSide === "spectator") return false;
    if (piece.side !== localSide) return false;
    return currentPlayer !== localSide;
  };

  const [seatError, setSeatError] = useState<string | null>(null);

  const canPlay =
    playMode === "solo"
      ? !winner && gameStarted
      : localSide !== "spectator" && localSide === currentPlayer && !winner && gameStarted;

  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [inRoom, setInRoom] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);

  const [snapshots, setSnapshots] = useState<SyncedState[]>([]);
  const [viewSnapshotIndex, setViewSnapshotIndex] = useState<number | null>(null);
  const moveCountRef = useRef(0);

  const isObserving = !!winner && !showEndModal;
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

  useEffect(() => {
    if (winner) {
      setShowEndModal(true);
      setViewSnapshotIndex(snapshots.length > 0 ? snapshots.length - 1 : null);
    }
  }, [winner, snapshots.length]);

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

    if (state.pendingGuard) {
      const {
        targetRow,
        targetCol,
        targetPieceIndex,
        attackerPieceIndex,
        defenderSide,
        guardPaladinIndices,
        wizardAttackMode,
      } = state.pendingGuard;

      const options: GuardOption[] = guardPaladinIndices.map((idx) => ({
        paladinIndex: idx,
        paladinRow: taggedPieces[idx].row,
        paladinCol: taggedPieces[idx].col,
        coordinate: getNodeCoordinate(taggedPieces[idx].row, taggedPieces[idx].col),
      }));

      setGuardOptions(options);
      setGuardRequest({ targetRow, targetCol, targetPieceIndex, attackerPieceIndex, defenderSide, wizardAttackMode });
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

  function broadcastState(next: SyncedState) {
    if (playMode === "solo") return;
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "state", state: next, from: clientIdRef.current }));
  }

  useEffect(() => {
    if (playMode === "solo") {
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {}
      }
      socketRef.current = null;
      setSocketStatus("disconnected");
      return;
    }

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
  }, [playMode]);

  function startSoloGame() {
    setPlayMode("solo");
    setRoomError(null);
    setSeatError(null);

    const newSeats: Seats = {
      whiteOwnerId: clientIdRef.current,
      blackOwnerId: clientIdRef.current,
    };
    setSeats(newSeats);

    setLocalSide("white");
    setInRoom(true);
    setSocketStatus("disconnected");

    const initial: SyncedState = {
      pieces: ensureDragonTags(getInitialPieces()),
      currentPlayer: "white",
      moveHistory: [],
      burnMarks: [],
      holyLights: [],
      capturedPieces: { white: [], black: [], neutral: [] },
      winner: null,
      seats: newSeats,
      startingPlayer: "white",
      startingMode: "manual",
      ready: { white: false, black: false },
      gameStarted: false,
      pendingGuard: null,
    };

    applySyncedState(initial);
  }

  function backToPvpEntry() {
    setPlayMode("pvp");
    setInRoom(false);
    setLocalSide("spectator");
    setSeatError(null);
    setRoomError(null);
  }

  function handleJoinRoom() {
    setPlayMode("pvp");

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
  function checkWizardWin(newPieces: Piece[]): Side | null {
    const hasWhiteWizard = newPieces.some((p) => p.type === "wizard" && p.side === "white");
    const hasBlackWizard = newPieces.some((p) => p.type === "wizard" && p.side === "black");

    let newWinner: Side | null = null;

    if (!hasWhiteWizard && hasBlackWizard) newWinner = "black";
    else if (!hasBlackWizard && hasWhiteWizard) newWinner = "white";

    if (newWinner) setWinner(newWinner);
    return newWinner;
  }

  function finalizeTurnNoAutoShot(args: {
    piecesAfterStealthExpire: Piece[];
    updatedBurnMarks: BurnMark[];
    remainingHolyLights: HolyLight[];
    localCaptured: CapturedMap;
    newMoveHistory: MoveRecord[];
    nextPlayer: PlayerSide;
    result: Side | null;
  }) {
    return {
      pieces: args.piecesAfterStealthExpire,
      burnMarks: args.updatedBurnMarks,
      holyLights: args.remainingHolyLights,
      capturedPieces: args.localCaptured,
      moveHistory: args.newMoveHistory,
      winner: args.result ?? null,
    };
  }

  function handleRestartGame() {
    const newSeats =
      playMode === "solo"
        ? { whiteOwnerId: clientIdRef.current, blackOwnerId: clientIdRef.current }
        : seats;

    const initial: SyncedState = {
      pieces: ensureDragonTags(getInitialPieces()),
      currentPlayer: "white",
      moveHistory: [],
      burnMarks: [],
      holyLights: [],
      capturedPieces: { white: [], black: [], neutral: [] },
      winner: null,
      seats: newSeats,
      startingPlayer: "white",
      startingMode: "manual",
      ready: { white: false, black: false },
      gameStarted: false,
      pendingGuard: null,
    };

    setShowEndModal(false);
    setViewSnapshotIndex(null);

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

    if (playMode === "solo") {
      backToPvpEntry();
    }
  }

  function handleChooseSide(side: "white" | "black" | "spectator") {
    if (!inRoom) return;
    if (playMode === "solo") return;

    if (side === "spectator") {
      const newSeats: Seats = {
        whiteOwnerId: seats.whiteOwnerId === clientIdRef.current ? null : seats.whiteOwnerId,
        blackOwnerId: seats.blackOwnerId === clientIdRef.current ? null : seats.blackOwnerId,
      };
      setSeats(newSeats);
      setLocalSide("spectator");
      setSeatError(null);

      broadcastState({
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
      });
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

      broadcastState({
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
      });
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

      broadcastState({
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
      });
    }
  }

  function handleToggleStartingPlayer() {
    const next = startingPlayer === "white" ? "black" : "white";
    setStartingPlayer(next);
    setStartingMode("manual");

    broadcastState({
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
    });
  }

  function handleRandomStartingPlayer() {
    const next: PlayerSide = Math.random() < 0.5 ? "white" : "black";
    setStartingPlayer(next);
    setStartingMode("random");

    broadcastState({
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
    });
  }

  function handlePressReady() {
    if (playMode === "solo") {
      const nextState: SyncedState = {
        pieces,
        currentPlayer: startingPlayer,
        moveHistory,
        burnMarks,
        holyLights,
        capturedPieces,
        winner,
        seats,
        startingPlayer,
        startingMode,
        ready: { white: true, black: true },
        gameStarted: true,
        pendingGuard: null,
      };
      applySyncedState(nextState);
      return;
    }

    if (localSide === "spectator") {
      setSeatError("觀戰者無需準備");
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
  const handleNodeClick = (row: number, col: number) => {
    if (guardRequest) return;

    const effectivePieces =
      isObserving && viewSnapshotIndex !== null && snapshots[viewSnapshotIndex]
        ? snapshots[viewSnapshotIndex].pieces
        : pieces;

    const clickedPieceIdx = getPieceAt(effectivePieces, row, col);
    let movedAssassinFinal: Piece | null = null;

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
          if (movedBard.type === "paladin") paladinIndicesToCheck.push(bardNeedsSwap.bardIndex);
          if (swappedPiece.type === "paladin") paladinIndicesToCheck.push(clickedPieceIdx);

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

          const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);

          const finalized = finalizeTurnNoAutoShot({
            piecesAfterStealthExpire,
            updatedBurnMarks: burnMarks,
            remainingHolyLights: holyLights.filter((l) => l.createdBy !== nextPlayer),
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
          isObserving || playMode === "solo" || localSide === "spectator" || piece.side === localSide;

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

            const targets = computeAllWizardBeamTargetsSafe(piece, effectivePieces, allNodes, adjacency, holyLights);

            const merged = mergeWizardBeamAttackHighlightsAllTargets({
              moves,
              targets,
              wizard: piece,
              pieces: effectivePieces,
            });

            setHighlights(merged);
            setDragonPathNodes([]);
            setProtectionZones([]);
            setWizardBeam(computeWizardBeamSafe(piece, effectivePieces, allNodes, adjacency, holyLights));
          } else if (piece.type === "apprentice") {
            setHighlights(
              calculateApprenticeMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks)
            );
          } else if (piece.type === "dragon") {
            const r = calculateDragonMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, burnMarks, holyLights);
            setHighlights(r.highlights);
            setDragonPathNodes(r.pathNodes);
          } else if (piece.type === "ranger") {
            setHighlights(
              calculateRangerMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks)
            );
          } else if (piece.type === "griffin") {
            setHighlights(
              calculateGriffinMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks)
            );
          } else if (piece.type === "assassin") {
            setHighlights(
              calculateAssassinMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks)
            );
          } else if (piece.type === "paladin") {
            const moves = calculatePaladinMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks);
            const zones = calculatePaladinProtectionZone(piece, effectivePieces, adjacency, allNodes);
            setHighlights(moves);
            setProtectionZones(zones);

            if (!isObserving && playMode !== "solo") {
              const revealedPieces = revealAssassinsInSpecificZone(pieces, zones, piece.side);
              setPieces(revealedPieces);
            }
          } else if (piece.type === "bard") {
            setHighlights(
              calculateBardMoves(piece, clickedPieceIdx, effectivePieces, adjacency, allNodes, holyLights, burnMarks)
            );
          }
        }
      }
      return;
    }

    if (!canPlay) return;

    const selectedPiece = pieces[selectedPieceIndex];
    const highlight = highlights.find((h) => h.row === row && h.col === col);
    if (!highlight) return;

    let newPieces = [...pieces];
    let updatedBurnMarks = [...burnMarks];
    let localCaptured = cloneCaptured(capturedPieces);
    let moveDesc = "";

    const fromCoord = getNodeCoordinate(selectedPiece.row, selectedPiece.col);
    const toCoord = getNodeCoordinate(row, col);

    if (highlight.type === "move") {
      let movedPiece = updateAssassinStealth(
        { ...selectedPiece, row, col },
        selectedPiece.row,
        selectedPiece.col,
        row,
        col
      );
      movedPiece = setAssassinStealthMeta(movedPiece);

      newPieces[selectedPieceIndex] = movedPiece;
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${toCoord}`;
    }

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

    const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);
    const remainingHolyLights = holyLights.filter((l) => l.createdBy !== nextPlayer);

    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
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
  };
  if (playMode === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-slate-900/80 border border-slate-700 rounded-2xl p-6 space-y-4 text-center">
          <h1 className="text-2xl font-bold text-slate-100">巫師棋 Wizard Chess</h1>
          <p className="text-sm text-slate-400">請選擇遊戲模式</p>

          <button
            onClick={() => {
              setPlayMode("solo");
              setLocalSide("white");
              setGameStarted(true);
            }}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2"
          >
            單機對戰
          </button>

          <button
            onClick={() => {
              setPlayMode("pvp");
            }}
            className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-semibold py-2"
          >
            PVP 連線對戰
          </button>
        </div>
      </div>
    );
  }

  if (playMode === "pvp" && !inRoom) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 flex items-center justify-center">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-700 rounded-2xl p-6 shadow-xl">
          <h1 className="text-2xl font-bold text-center mb-2 text-slate-100">PVP 連線對戰</h1>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">房間密碼</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-600 px-3 py-2 text-sm text-slate-100"
              />
            </div>

            <button
              onClick={handleJoinRoom}
              className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2"
            >
              建立 / 加入 房間
            </button>

            {roomError && <div className="text-red-400 text-xs text-center">{roomError}</div>}

            <button
              onClick={() => setPlayMode(null)}
              className="w-full rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 py-2 text-sm"
            >
              返回模式選擇
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (playMode === "pvp" && inRoom && !gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-6 flex items-center justify-center">
        <div className="w-full max-w-lg bg-slate-900/80 border border-slate-700 rounded-2xl p-6 space-y-6">
          <h1 className="text-xl font-bold text-center text-slate-100">準備階段</h1>

          <div className="flex justify-center gap-3">
            <button onClick={() => handleChooseSide("white")} className="px-4 py-2 rounded bg-slate-800 text-slate-100">
              白方
            </button>
            <button onClick={() => handleChooseSide("black")} className="px-4 py-2 rounded bg-slate-800 text-slate-100">
              黑方
            </button>
            <button
              onClick={() => handleChooseSide("spectator")}
              className="px-4 py-2 rounded bg-slate-800 text-slate-100"
            >
              觀戰
            </button>
          </div>

          <div className="text-center text-xs text-slate-400">
            白方：{ready.white ? "已準備" : "未準備"} ｜ 黑方：{ready.black ? "已準備" : "未準備"}
          </div>

          <div className="flex justify-center">
            <button
              onClick={handlePressReady}
              className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold"
            >
              開始遊戲
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-3xl font-bold text-center mb-4 text-slate-100">巫師棋 Wizard Chess</h1>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6">
          <div className="flex flex-col gap-4">
            <CapturedPiecesPanel capturedPieces={boardState.capturedPieces} />
            <PieceInfoPanel piece={selectedPieceForPanel} />
          </div>

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

          <TurnHistoryPanel
            currentPlayer={boardState.currentPlayer}
            moveHistory={displayHistory}
            winner={winner}
            onSelectMove={handleSelectMoveFromHistory}
          />
        </div>
      </div>

      <GuardDialog
        isOpen={guardDialogOpen && !!guardRequest && localSide === guardRequest?.defenderSide}
        guardOptions={guardOptions}
        targetCoordinate={guardRequest ? getNodeCoordinate(guardRequest.targetRow, guardRequest.targetCol) : ""}
        selectedPaladinIndex={selectedGuardPaladinIndex}
        onChangeSelectedPaladin={handleChangeSelectedGuardPaladin}
        onConfirmGuard={handleGuardConfirm}
        onDecline={handleGuardDecline}
      />

      <WizardAttackDialog
        isOpen={!!wizardAttackRequest}
        targetCoordinate={
          wizardAttackRequest ? getNodeCoordinate(wizardAttackRequest.targetRow, wizardAttackRequest.targetCol) : ""
        }
        onLineShot={handleWizardLineShot}
        onMoveAttack={handleWizardMoveAttack}
      />
    </div>
  );
}
