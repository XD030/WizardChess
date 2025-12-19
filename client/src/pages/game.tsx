// ===== Part 1/4 =====
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

type GameMode = "single" | "pvp";
type LobbyStep = "password" | "mode";
const AI_ID = "__AI__";

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
  const stack: State[] = [{ cur: { row: wizard.row, col: wizard.col }, prev: null, dir: null, consecutiveEmpty: 0 }];

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
        dir: ndir,
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
    if (!piece) return false;
    if (piece.type !== "bard") return false;
    if (localSide === "spectator") return false;
    if (piece.side !== localSide) return false;
    return currentPlayer !== localSide;
  };

  const [seatError, setSeatError] = useState<string | null>(null);

  const [lobbyStep, setLobbyStep] = useState<LobbyStep>("password");
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [aiSide, setAiSide] = useState<PlayerSide>("black");
  const aiActingRef = useRef(false);

  const canPlay = localSide !== "spectator" && localSide === currentPlayer && !winner && gameStarted;

  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [inRoom, setInRoom] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const [pendingJoinPvp, setPendingJoinPvp] = useState(false);

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
    if (gameMode === "single") return;
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "state", state: next, from: clientIdRef.current }));
  }

  useEffect(() => {
    if (gameMode !== "pvp") return;

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
  }, [gameMode]);

  useEffect(() => {
    if (gameMode !== "pvp") return;
    if (!pendingJoinPvp) return;
    if (socketStatus !== "connected") return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

    socketRef.current.send(JSON.stringify({ type: "joinRoom", password: passwordInput }));
    setPendingJoinPvp(false);
  }, [gameMode, pendingJoinPvp, socketStatus, passwordInput]);

  function handleGoModeSelect() {
    if (!passwordInput.trim()) {
      setRoomError("請輸入房間密碼");
      return;
    }
    setRoomError(null);
    setLobbyStep("mode");
  }

  function handleSelectMode(nextMode: GameMode) {
    setGameMode(nextMode);

    if (nextMode === "single") {
      setSocketStatus("disconnected");
      setInRoom(true);
      setRoomError(null);
      const initialState = createInitialState();
      applySyncedState(initialState);
      return;
    }

    setInRoom(false);
    setRoomError(null);
    setPendingJoinPvp(true);
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
  }): {
    pieces: Piece[];
    burnMarks: BurnMark[];
    holyLights: HolyLight[];
    capturedPieces: CapturedMap;
    moveHistory: MoveRecord[];
    winner: Side | null;
  } {
    const { piecesAfterStealthExpire, updatedBurnMarks, remainingHolyLights, localCaptured, newMoveHistory, result } =
      args;

    return {
      pieces: piecesAfterStealthExpire,
      burnMarks: updatedBurnMarks,
      holyLights: remainingHolyLights,
      capturedPieces: localCaptured,
      moveHistory: newMoveHistory,
      winner: result ?? null,
    };
  }

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
    setLobbyStep("password");
    setGameMode(null);
    setPendingJoinPvp(false);
    setSeatError(null);
  }
// ===== Part 2/4 =====
  function handleChooseSide(side: "white" | "black" | "spectator") {
    if (!inRoom) return;

    if (gameMode === "single") {
      if (side === "spectator") {
        setSeatError("單人模式不可觀戰，請選白方或黑方");
        return;
      }

      const human = side;
      const ai: PlayerSide = human === "white" ? "black" : "white";

      setAiSide(ai);
      setLocalSide(human);

      const newSeats: Seats =
        human === "white"
          ? { whiteOwnerId: clientIdRef.current, blackOwnerId: AI_ID }
          : { whiteOwnerId: AI_ID, blackOwnerId: clientIdRef.current };

      setSeats(newSeats);
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

      applySyncedState(syncState);
      return;
    }

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

  function handlePressReady() {
    if (localSide === "spectator") {
      setSeatError("觀戰者無需準備，請選擇白方或黑方參與對局");
      return;
    }

    const sideKey = localSide;
    if (ready[sideKey]) return;

    let newReady: ReadyState = { ...ready, [sideKey]: true };

    if (gameMode === "single") {
      newReady = { white: true, black: true };
    }

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

    const mode: WizardAttackMode | null | undefined = guardRequest.wizardAttackMode ?? null;
    const wizardLineShot =
      selectedPiece.type === "wizard"
        ? mode === "line"
          ? true
          : mode === "move"
          ? false
          : isWizardLineShotAttack(selectedPiece, targetRowGuard, targetColGuard, pieces, allNodes, adjacency, holyLights)
        : false;

    let movedAttacker: Piece;

    if (selectedPiece.type === "wizard") {
      if (wizardLineShot) {
        movedAttacker = { ...selectedPiece };
      } else {
        movedAttacker = updateAssassinStealth(
          { ...selectedPiece, row: targetRowGuard, col: targetColGuard },
          selectedPiece.row,
          selectedPiece.col,
          targetRowGuard,
          targetColGuard
        );
        movedAttacker = setAssassinStealthMeta(movedAttacker);
      }
    } else {
      movedAttacker = updateAssassinStealth(
        { ...selectedPiece, row: targetRowGuard, col: targetColGuard },
        selectedPiece.row,
        selectedPiece.col,
        targetRowGuard,
        targetColGuard
      );
      movedAttacker = setAssassinStealthMeta(movedAttacker);
    }

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

    if (
      targetIdxAfter !== -1 &&
      newPieces[targetIdxAfter].type === "assassin" &&
      (newPieces[targetIdxAfter] as any).stealthed
    ) {
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

    if (
      attackerIdxAfter !== -1 &&
      newPieces[attackerIdxAfter].type === "assassin" &&
      (newPieces[attackerIdxAfter] as any).stealthed
    ) {
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

    const moveDesc =
      selectedPiece.type === "wizard" && wizardLineShot
        ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⟼ ${PIECE_CHINESE[targetPiece.type]} ${targetCoord} (導線射擊，聖騎士 ${paladinCoord} 守護)`
        : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${targetCoord} (聖騎士 ${paladinCoord} 守護 ${PIECE_CHINESE[targetPiece.type]})`;

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
        const mode: WizardAttackMode | null | undefined = guardRequest.wizardAttackMode ?? null;
        const wizardLineShot =
          mode === "line"
            ? true
            : mode === "move"
            ? false
            : isWizardLineShotAttack(selectedPiece, targetRow, targetCol, pieces, allNodes, adjacency, holyLights);

        if (!wizardLineShot) {
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

    let moveDesc = "";
    if (selectedPiece.type === "wizard" && targetPiece.type !== "bard") {
      const mode: WizardAttackMode | null | undefined = guardRequest.wizardAttackMode ?? null;
      const wizardLineShot =
        mode === "line"
          ? true
          : mode === "move"
          ? false
          : isWizardLineShotAttack(selectedPiece, targetRow, targetCol, pieces, allNodes, adjacency, holyLights);

      moveDesc = wizardLineShot
        ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⟼ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (導線射擊)`
        : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (巫師移動)`;
    } else {
      moveDesc =
        targetPiece.type === "bard"
          ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`
          : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
    }

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
// ===== Part 3/4 =====
  // =========================
  // 選取棋子 -> 計算可走/可攻擊格
  // =========================
  function computeHighlightsForPiece(piece: Piece, allPieces: Piece[]): MoveHighlight[] {
    if (!piece) return [];
    const side = piece.side as PlayerSide;

    // 允許：自己回合 or 自己的吟遊詩人（不分回合）可點
    const allowOutOfTurnBard = isOwnBardOutOfTurnForPiece(piece);
    if (!allowOutOfTurnBard) {
      if (localSide === "spectator") return [];
      if (side !== localSide) return [];
      if (currentPlayer !== localSide) return [];
    }

    if (winner) return [];

    // 如果還沒開始遊戲，不給走
    if (!gameStarted) return [];

    // 刺客潛行：由 gameLogic 內處理/限制
    let moves: MoveHighlight[] = [];

    if (piece.type === "wizard") {
      moves = calculateWizardMoves(piece, allPieces, adjacency, allNodes, holyLights);

      // ✅ 導線射擊：多目標版本（穩健安全計算）
      const targets = computeAllWizardBeamTargetsSafe(piece, allPieces, allNodes, adjacency, holyLights);
      moves = mergeWizardBeamAttackHighlightsAllTargets({ moves, targets, wizard: piece, pieces: allPieces });
      return moves;
    }

    if (piece.type === "apprentice") {
      return calculateApprenticeMoves(piece, allPieces, adjacency, allNodes);
    }

    if (piece.type === "dragon") {
      return calculateDragonMoves(piece, allPieces, adjacency, allNodes);
    }

    if (piece.type === "ranger") {
      return calculateRangerMoves(piece, allPieces, adjacency, allNodes);
    }

    if (piece.type === "griffin") {
      return calculateGriffinMoves(piece, allPieces, adjacency, allNodes);
    }

    if (piece.type === "assassin") {
      return calculateAssassinMoves(piece, allPieces, adjacency, allNodes);
    }

    if (piece.type === "paladin") {
      return calculatePaladinMoves(piece, allPieces, adjacency, allNodes);
    }

    if (piece.type === "bard") {
      // 吟遊詩人：通常只需要移動/能力格（由你的 gameLogic 定義）
      return calculateBardMoves(piece, allPieces, adjacency, allNodes);
    }

    return [];
  }

  function handleSelectPiece(index: number) {
    if (index < 0 || index >= pieces.length) return;
    if (winner) return;

    const piece = pieces[index];

    // 遊戲未開始，不選
    if (!gameStarted) return;

    // Guard Dialog / Wizard Attack Dialog 開著時不允許操作棋盤
    if (guardDialogOpen) return;
    if (wizardAttackRequest) return;

    // 若需要交換（吟遊詩人），則先完成交換
    if (bardNeedsSwap) return;

    // 一般：只有自己回合才能選（但允許 out-of-turn bard）
    const allowOutOfTurnBard = isOwnBardOutOfTurnForPiece(piece);
    if (!allowOutOfTurnBard) {
      if (localSide === "spectator") return;
      if (piece.side !== localSide) return;
      if (currentPlayer !== localSide) return;
    }

    setSelectedPieceIndex(index);

    const h = computeHighlightsForPiece(piece, pieces);
    setHighlights(h);

    // 龍路徑 preview
    if (piece.type === "dragon") {
      setDragonPathNodes([]);
    } else {
      setDragonPathNodes([]);
    }

    // 聖騎士保護區 preview
    if (piece.type === "paladin") {
      const zones = calculatePaladinProtectionZone(piece, pieces, adjacency, allNodes);
      setProtectionZones(zones);
    } else {
      setProtectionZones([]);
    }

    // 巫師導線 preview（僅 UI 顯示用）
    if (piece.type === "wizard") {
      const beam = computeWizardBeamSafe(piece, pieces, allNodes, adjacency, holyLights);
      setWizardBeam(beam);
    } else {
      setWizardBeam(null);
    }
  }

  function clearSelection() {
    setSelectedPieceIndex(-1);
    setHighlights([]);
    setDragonPathNodes([]);
    setProtectionZones([]);
    setWizardBeam(null);
  }

  function findHighlightAt(row: number, col: number): MoveHighlight | null {
    return highlights.find((h) => h.row === row && h.col === col) ?? null;
  }

  // =========================
  // 巫師攻擊：若是導線射擊（非相鄰）要先跳對話框選擇：導線射擊 or 移動攻擊
  // =========================
  function requestWizardAttackMode(args: {
    wizardIndex: number;
    targetRow: number;
    targetCol: number;
    targetPieceIndex: number;
  }) {
    setWizardAttackRequest(args);
  }

  function resolveWizardAttackWithMode(mode: WizardAttackMode) {
    if (!wizardAttackRequest) return;

    const { wizardIndex, targetRow, targetCol, targetPieceIndex } = wizardAttackRequest;

    // 用 mode 帶入後續同一套處理流程（走 handleCellClick 的流程）
    setWizardAttackRequest(null);

    // 直接執行一次 cell click，但把 mode 帶進 guardRequest
    performAttackOrMove({
      attackerIndex: wizardIndex,
      row: targetRow,
      col: targetCol,
      forceWizardMode: mode,
    });
  }

  // =========================
  // 核心：落子/攻擊/觸發守護
  // =========================
  function performAttackOrMove(args: { attackerIndex: number; row: number; col: number; forceWizardMode?: WizardAttackMode }) {
    const { attackerIndex, row, col, forceWizardMode } = args;

    if (attackerIndex < 0 || attackerIndex >= pieces.length) return;
    if (winner) return;

    const selectedPiece = pieces[attackerIndex];

    // 不允許在 dialogs 開啟時操作
    if (guardDialogOpen) return;
    if (bardNeedsSwap) return;

    // 只有自己回合（但 out-of-turn bard 允許被點、但它落子仍會切回你目前邏輯）
    const allowOutOfTurnBard = isOwnBardOutOfTurnForPiece(selectedPiece);
    if (!allowOutOfTurnBard) {
      if (localSide === "spectator") return;
      if (selectedPiece.side !== localSide) return;
      if (currentPlayer !== localSide) return;
    }

    const hl = findHighlightAt(row, col);
    if (!hl) return;

    // ✅ 若巫師要攻擊導線射擊目標：先詢問模式（除非已 forceWizardMode）
    if (selectedPiece.type === "wizard" && hl.type === "attack") {
      const lineShot = isWizardLineShotAttack(selectedPiece, row, col, pieces, allNodes, adjacency, holyLights);

      if (lineShot && !forceWizardMode) {
        const tIdx = getPieceAt(pieces, row, col);
        if (tIdx !== -1) {
          requestWizardAttackMode({
            wizardIndex: attackerIndex,
            targetRow: row,
            targetCol: col,
            targetPieceIndex: tIdx,
          });
          return;
        }
      }
    }

    // =========================
    // 走/攻擊開始
    // =========================
    let newPieces = [...pieces];
    let updatedBurnMarks = [...burnMarks];
    let localCaptured = cloneCaptured(capturedPieces);
    let movedAssassinFinal: Piece | null = null;

    const fromRow = selectedPiece.row;
    const fromCol = selectedPiece.col;

    const fromCoord = getNodeCoordinate(fromRow, fromCol);
    const toCoord = getNodeCoordinate(row, col);

    // 目標棋子
    const targetIdx = getPieceAt(newPieces, row, col);
    const targetPiece = targetIdx !== -1 ? newPieces[targetIdx] : null;

    // 龍：先清自己的舊灼痕，並在移動後生成新灼痕（你的既有規則）
    if (selectedPiece.type === "dragon") {
      const tag = getDragonTag(selectedPiece);
      if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
    }

    // 如果是攻擊：先判斷守護（聖騎士）
    const isAttack = hl.type === "attack";
    const isMove = hl.type === "move";

    // =========================
    // 攻擊流程
    // =========================
    if (isAttack && targetPiece) {
      // 吟遊詩人不可被擊殺
      if (targetPiece.type === "bard") {
        const moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`;
        const record = makeMoveRecord(moveDesc, movedAssassinFinal);
        const newMoveHistory = [record, ...moveHistory];

        // 切回合 + 清敵方聖光
        const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";
        const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);
        const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);
        const result = checkWizardWin(piecesAfterStealthExpire);

        const syncState: SyncedState = {
          pieces: piecesAfterStealthExpire,
          currentPlayer: result ? currentPlayer : nextPlayer,
          moveHistory: newMoveHistory,
          burnMarks: updatedBurnMarks,
          holyLights: remainingHolyLights,
          capturedPieces: localCaptured,
          winner: result,
          seats,
          startingPlayer,
          startingMode,
          ready,
          gameStarted,
          pendingGuard: null,
        };

        applySyncedState(syncState);
        broadcastState(syncState);
        return;
      }

      // ✅ 找是否有聖騎士守護
      const guarding = findGuardingPaladins(targetPiece, newPieces, adjacency, allNodes);
      const guardPaladinIndices = guarding.map((g) => g.paladinIndex);

      // ✅ 巫師攻擊模式
      let wizardAttackMode: WizardAttackMode | null = null;
      if (selectedPiece.type === "wizard") {
        if (forceWizardMode) wizardAttackMode = forceWizardMode;
        else {
          const lineShot = isWizardLineShotAttack(selectedPiece, row, col, pieces, allNodes, adjacency, holyLights);
          wizardAttackMode = lineShot ? "line" : "move";
        }
      }

      if (guardPaladinIndices.length > 0) {
        // 進入守護對話框（同時把 pendingGuard 存到 state，PVP 才需要同步）
        const pending: PendingGuard = {
          targetRow: row,
          targetCol: col,
          targetPieceIndex: targetIdx,
          attackerPieceIndex: attackerIndex,
          defenderSide: targetPiece.side as PlayerSide,
          guardPaladinIndices,
          wizardAttackMode,
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
          pendingGuard: pending,
        };

        if (gameMode === "pvp") {
          broadcastState(syncState);
        }
        applySyncedState(syncState);
        return;
      }

      // 沒有守護：直接擊殺 + (部分棋子可能要移動到目標格)
      // 先移除被吃
      localCaptured = addCaptured(localCaptured, targetPiece);

      // 如果被吃的是龍：清灼痕
      if (targetPiece.type === "dragon") {
        const tag = getDragonTag(targetPiece);
        if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
      }

      // 扣掉 target
      newPieces = newPieces.filter((_, idx) => idx !== targetIdx);

      // 攻擊者是否要移動到目標格：
      if (selectedPiece.type === "wizard") {
        const lineShot =
          wizardAttackMode === "line"
            ? true
            : wizardAttackMode === "move"
            ? false
            : isWizardLineShotAttack(selectedPiece, row, col, pieces, allNodes, adjacency, holyLights);

        if (!lineShot) {
          let moved = updateAssassinStealth({ ...selectedPiece, row, col }, fromRow, fromCol, row, col);
          moved = setAssassinStealthMeta(moved);
          // 刺客若移到聖騎士區，會被揭露（下面回合切換前會再做一次）
          if (moved.type === "assassin") movedAssassinFinal = moved;
          // 更新 attacker（原 index 可能變動，直接找到同 side/type 原位置）
          // 先移除舊 attacker
          const oldIdx = newPieces.findIndex((p) => p.row === fromRow && p.col === fromCol && p.side === selectedPiece.side && p.type === selectedPiece.type);
          if (oldIdx !== -1) newPieces.splice(oldIdx, 1);
          newPieces.push(moved);
        }
      } else if (selectedPiece.type === "dragon") {
        // 龍攻擊：龍一定會移動到目標格
        let moved = updateAssassinStealth({ ...selectedPiece, row, col }, fromRow, fromCol, row, col);
        moved = setAssassinStealthMeta(moved);
        // 移除舊 attacker
        const oldIdx = newPieces.findIndex((p) => p.row === fromRow && p.col === fromCol && p.side === selectedPiece.side && p.type === selectedPiece.type);
        if (oldIdx !== -1) newPieces.splice(oldIdx, 1);
        newPieces.push(moved);

        // 生成灼痕：舊位 + 路徑中間（排除終點）
        const tag = getDragonTag(moved);
        const path = calculateDragonPath(fromRow, fromCol, row, col, adjacency, allNodes);

        const protectedSet = buildAllPaladinProtectedSet(newPieces, adjacency, allNodes);

        const addIfAllowed = (r: number, c: number) => {
          const key = `${r},${c}`;
          const isProtected = protectedSet.has(key);
          const isEmpty = getPieceAt(newPieces, r, c) === -1;
          if (isProtected && isEmpty) return;

          if (!updatedBurnMarks.some((b) => b.row === r && b.col === c)) {
            const m: any = { row: r, col: c, createdBy: moved.side };
            if (tag) m.dragonTag = tag;
            updatedBurnMarks.push(m as BurnMark);
          }
        };

        addIfAllowed(fromRow, fromCol);
        for (const node of path) {
          if (node.row === row && node.col === col) continue;
          addIfAllowed(node.row, node.col);
        }
      } else {
        // 其他棋子：一般攻擊會移動到目標格（依你原規則）
        let moved = updateAssassinStealth({ ...selectedPiece, row, col }, fromRow, fromCol, row, col);
        moved = setAssassinStealthMeta(moved);

        // 刺客攻擊：通常會解除隱身（你原本 decline 也做了）
        if (moved.type === "assassin") {
          const mp: any = { ...moved, stealthed: false };
          delete mp.stealthExpiresOn;
          moved = mp as Piece;
          movedAssassinFinal = moved;
        }

        const oldIdx = newPieces.findIndex((p) => p.row === fromRow && p.col === fromCol && p.side === selectedPiece.side && p.type === selectedPiece.type);
        if (oldIdx !== -1) newPieces.splice(oldIdx, 1);
        newPieces.push(moved);
      }

      // 吟遊詩人激活
      newPieces = activateAllBards(ensureDragonTags(newPieces));

      // 刺客若進入敵方聖騎士區：揭露
      if (movedAssassinFinal && movedAssassinFinal.type === "assassin" && movedAssassinFinal.stealthed) {
        const enemySide = movedAssassinFinal.side === "white" ? "black" : "white";
        if (isInProtectionZone(movedAssassinFinal.row, movedAssassinFinal.col, newPieces, enemySide, adjacency, allNodes)) {
          const idx = newPieces.findIndex((p) => p.row === movedAssassinFinal!.row && p.col === movedAssassinFinal!.col && p.side === movedAssassinFinal!.side && p.type === "assassin");
          if (idx !== -1) {
            const a: any = { ...newPieces[idx], stealthed: false };
            delete a.stealthExpiresOn;
            newPieces[idx] = a as Piece;
          }
        }
      }

      // 回合切換
      const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";
      const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

      // 清除刺客到期隱身
      const piecesAfterStealthExpire = clearExpiredAssassinStealth(newPieces, nextPlayer);

      // 勝負判定
      const result = checkWizardWin(piecesAfterStealthExpire);

      // 記錄文字（巫師導線射擊用 ⟼）
      let moveDesc = "";
      if (selectedPiece.type === "wizard") {
        const lineShot =
          wizardAttackMode === "line"
            ? true
            : wizardAttackMode === "move"
            ? false
            : isWizardLineShotAttack(selectedPiece, row, col, pieces, allNodes, adjacency, holyLights);

        moveDesc = lineShot
          ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⟼ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (導線射擊)`
          : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (巫師移動)`;
      } else {
        moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
      }

      const record = makeMoveRecord(moveDesc, movedAssassinFinal);
      const newMoveHistory = [record, ...moveHistory];

      const syncState: SyncedState = {
        pieces: piecesAfterStealthExpire,
        currentPlayer: result ? currentPlayer : nextPlayer,
        moveHistory: newMoveHistory,
        burnMarks: updatedBurnMarks,
        holyLights: remainingHolyLights,
        capturedPieces: localCaptured,
        winner: result,
        seats,
        startingPlayer,
        startingMode,
        ready,
        gameStarted,
        pendingGuard: null,
      };

      applySyncedState(syncState);
      broadcastState(syncState);
      return;
    }

    // =========================
    // 移動流程
    // =========================
    if (isMove) {
      // 龍移動：生成灼痕 + 路徑
      if (selectedPiece.type === "dragon") {
        const path = calculateDragonPath(fromRow, fromCol, row, col, adjacency, allNodes);
        setDragonPathNodes(path);

        let moved = updateAssassinStealth({ ...selectedPiece, row, col }, fromRow, fromCol, row, col);
        moved = setAssassinStealthMeta(moved);

        // 移除舊龍
        newPieces = newPieces.filter((p) => !(p.row === fromRow && p.col === fromCol && p.side === selectedPiece.side && p.type === "dragon"));
        newPieces.push(moved);
        newPieces = ensureDragonTags(newPieces);

        const tag = getDragonTag(moved);
        if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);

        const protectedSet = buildAllPaladinProtectedSet(newPieces, adjacency, allNodes);

        const addIfAllowed = (r: number, c: number) => {
          const key = `${r},${c}`;
          const isProtected = protectedSet.has(key);
          const isEmpty = getPieceAt(newPieces, r, c) === -1;
          if (isProtected && isEmpty) return;

          if (!updatedBurnMarks.some((b) => b.row === r && b.col === c)) {
            const m: any = { row: r, col: c, createdBy: moved.side };
            if (tag) m.dragonTag = tag;
            updatedBurnMarks.push(m as BurnMark);
          }
        };

        addIfAllowed(fromRow, fromCol);
        for (const node of path) {
          if (node.row === row && node.col === col) continue;
          addIfAllowed(node.row, node.col);
        }

        newPieces = activateAllBards(newPieces);

        const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";
        const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);
        const piecesAfterStealthExpire = clearExpiredAssassinStealth(newPieces, nextPlayer);
        const result = checkWizardWin(piecesAfterStealthExpire);

        const moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${toCoord}`;
        const record = makeMoveRecord(moveDesc, movedAssassinFinal);
        const newMoveHistory = [record, ...moveHistory];

        const syncState: SyncedState = {
          pieces: piecesAfterStealthExpire,
          currentPlayer: result ? currentPlayer : nextPlayer,
          moveHistory: newMoveHistory,
          burnMarks: updatedBurnMarks,
          holyLights: remainingHolyLights,
          capturedPieces: localCaptured,
          winner: result,
          seats,
          startingPlayer,
          startingMode,
          ready,
          gameStarted,
          pendingGuard: null,
        };

        applySyncedState(syncState);
        broadcastState(syncState);
        return;
      }

      // 其他棋子一般移動
      let moved = updateAssassinStealth({ ...selectedPiece, row, col }, fromRow, fromCol, row, col);
      moved = setAssassinStealthMeta(moved);

      // 刺客若移進敵方聖騎士區 -> 揭露
      if (moved.type === "assassin" && moved.stealthed) {
        const enemySide = moved.side === "white" ? "black" : "white";
        if (isInProtectionZone(row, col, newPieces, enemySide, adjacency, allNodes)) {
          const mp: any = { ...moved, stealthed: false };
          delete mp.stealthExpiresOn;
          moved = mp as Piece;
        }
      }

      newPieces = newPieces.filter((p) => !(p.row === fromRow && p.col === fromCol && p.side === selectedPiece.side && p.type === selectedPiece.type));
      newPieces.push(moved);
      newPieces = activateAllBards(ensureDragonTags(newPieces));

      const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";
      const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);
      const piecesAfterStealthExpire = clearExpiredAssassinStealth(newPieces, nextPlayer);
      const result = checkWizardWin(piecesAfterStealthExpire);

      // 若吟遊詩人移動後需要交換（依你原本機制）：這裡保留 hook
      if (moved.type === "bard") {
        setBardNeedsSwap({ bardIndex: attackerIndex, bardRow: row, bardCol: col });
      }

      const moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${toCoord}`;
      const record = makeMoveRecord(moveDesc, movedAssassinFinal);
      const newMoveHistory = [record, ...moveHistory];

      const syncState: SyncedState = {
        pieces: piecesAfterStealthExpire,
        currentPlayer: result ? currentPlayer : nextPlayer,
        moveHistory: newMoveHistory,
        burnMarks: updatedBurnMarks,
        holyLights: remainingHolyLights,
        capturedPieces: localCaptured,
        winner: result,
        seats,
        startingPlayer,
        startingMode,
        ready,
        gameStarted,
        pendingGuard: null,
      };

      applySyncedState(syncState);
      broadcastState(syncState);
      return;
    }
  }

  function handleCellClick(row: number, col: number) {
    if (selectedPieceIndex === -1) return;
    performAttackOrMove({ attackerIndex: selectedPieceIndex, row, col });
    clearSelection();
  }

  // =========================
  // ✅ 單人 AI：極簡版（隨機合法走一步）
  // =========================
  function getAllLegalActions(forSide: PlayerSide): { attackerIndex: number; row: number; col: number; forceWizardMode?: WizardAttackMode }[] {
    const actions: { attackerIndex: number; row: number; col: number; forceWizardMode?: WizardAttackMode }[] = [];

    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.side !== forSide) continue;

      const h = computeHighlightsForPiece(p, pieces);
      for (const m of h) {
        if (m.type !== "move" && m.type !== "attack") continue;

        // 若是巫師攻擊且是導線射擊格：AI 也要選模式
        if (p.type === "wizard" && m.type === "attack") {
          const isLine = isWizardLineShotAttack(p, m.row, m.col, pieces, allNodes, adjacency, holyLights);
          if (isLine) {
            // 兩種模式都加入（讓 AI 也可能選擇移動攻擊）
            actions.push({ attackerIndex: i, row: m.row, col: m.col, forceWizardMode: "line" });
            actions.push({ attackerIndex: i, row: m.row, col: m.col, forceWizardMode: "move" });
            continue;
          }
        }

        actions.push({ attackerIndex: i, row: m.row, col: m.col });
      }
    }

    return actions;
  }

  function randomPick<T>(arr: T[]): T | null {
    if (arr.length === 0) return null;
    const idx = Math.floor(Math.random() * arr.length);
    return arr[idx];
  }

  useEffect(() => {
    if (gameMode !== "single") return;
    if (!gameStarted) return;
    if (winner) return;
    if (currentPlayer !== aiSide) return;

    // AI 不能在對話框狀態下動作
    if (guardDialogOpen) return;

    // 若巫師模式對話框在 AI 手上：自動選「導線射擊優先」
    if (wizardAttackRequest) {
      // 如果是 AI 的 wizard attack request，直接 line
      resolveWizardAttackWithMode("line");
      return;
    }

    // 吟遊詩人交換狀態：AI 直接取消（依你原機制可改成自動交換）
    if (bardNeedsSwap) {
      setBardNeedsSwap(null);
      return;
    }

    if (aiActingRef.current) return;
    aiActingRef.current = true;

    // 稍微延遲一下，讓 UI 有感（不影響規則）
    const t = window.setTimeout(() => {
      try {
        // 若此時需要守護選擇，且防守方是 AI：直接拒絕守護（最簡）
        if (guardDialogOpen && guardRequest) {
          const defenderIsAI = guardRequest.defenderSide === aiSide;
          if (defenderIsAI) handleGuardDecline();
          return;
        }

        const actions = getAllLegalActions(aiSide);
        const pick = randomPick(actions);
        if (!pick) return;

        // 模擬選棋+落子
        const p = pieces[pick.attackerIndex];
        const h = computeHighlightsForPiece(p, pieces);
        setSelectedPieceIndex(pick.attackerIndex);
        setHighlights(h);

        performAttackOrMove({
          attackerIndex: pick.attackerIndex,
          row: pick.row,
          col: pick.col,
          forceWizardMode: pick.forceWizardMode,
        });

        clearSelection();
      } finally {
        aiActingRef.current = false;
      }
    }, 450);

    return () => {
      window.clearTimeout(t);
      aiActingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameMode,
    gameStarted,
    winner,
    currentPlayer,
    aiSide,
    guardDialogOpen,
    wizardAttackRequest,
    bardNeedsSwap,
    pieces,
    holyLights,
    burnMarks,
    capturedPieces,
    moveHistory,
    adjacency,
    allNodes,
  ]);

  // =========================
  // 快照回放顯示：若正在回放就用快照資料渲染
  // =========================
  const viewing = viewSnapshotIndex !== null && snapshots[viewSnapshotIndex];
  const viewState = viewing ? snapshots[viewSnapshotIndex!] : null;

  const renderPieces = viewState ? viewState.pieces : pieces;
  const renderCurrentPlayer = viewState ? viewState.currentPlayer : currentPlayer;
  const renderMoveHistory = viewState ? viewState.moveHistory : moveHistory;
  const renderBurnMarks = viewState ? viewState.burnMarks : burnMarks;
  const renderHolyLights = viewState ? viewState.holyLights : holyLights;
  const renderCaptured = viewState ? viewState.capturedPieces : capturedPieces;
  const renderWinner = viewState ? viewState.winner : winner;

  const selectedPiece = selectedPieceIndex !== -1 ? pieces[selectedPieceIndex] : null;

  // =========================
  // UI：Lobby 兩步（密碼 -> 模式）-> 選邊 -> 準備/開始
  // =========================
  function renderLobby() {
    if (lobbyStep === "password") {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
          <div className="text-2xl font-bold">輸入坊間密碼</div>
          <input
            className="border rounded px-3 py-2 w-[260px]"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="房間密碼"
          />
          <button className="px-4 py-2 rounded bg-black text-white" onClick={handleGoModeSelect}>
            下一步
          </button>
          {roomError && <div className="text-red-600">{roomError}</div>}
        </div>
      );
    }

    // mode
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <div className="text-2xl font-bold">選擇模式</div>

        <div className="flex gap-3">
          <button className="px-4 py-2 rounded bg-black text-white" onClick={() => handleSelectMode("single")}>
            單人 vs AI
          </button>
          <button className="px-4 py-2 rounded border" onClick={() => handleSelectMode("pvp")}>
            PVP 對戰
          </button>
        </div>

        {gameMode === "pvp" && (
          <div className="text-sm text-gray-600">
            連線狀態：{socketStatus === "connected" ? "已連線" : socketStatus === "connecting" ? "連線中" : "未連線"}
          </div>
        )}

        {roomError && <div className="text-red-600">{roomError}</div>}
      </div>
    );
  }
// ===== Part 4/4 =====
  function renderSideSelect() {
    const you = localSide === "spectator" ? "觀戰" : localSide === "white" ? "白方" : "黑方";
    const modeText = gameMode === "single" ? "單人 vs AI" : "PVP 對戰";

    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-2xl font-bold">已進入房間</div>
        <div className="text-sm text-gray-600">模式：{modeText}</div>

        {gameMode === "single" ? (
          <div className="text-sm text-gray-600">單人模式不可觀戰，請選擇你的陣營（另一方將由 AI 操控）</div>
        ) : (
          <div className="text-sm text-gray-600">請選擇白/黑/觀戰</div>
        )}

        <div className="flex gap-3">
          <button className="px-4 py-2 rounded border" onClick={() => handleChooseSide("white")}>
            白方
          </button>
          <button className="px-4 py-2 rounded border" onClick={() => handleChooseSide("black")}>
            黑方
          </button>
          {gameMode !== "single" && (
            <button className="px-4 py-2 rounded border" onClick={() => handleChooseSide("spectator")}>
              觀戰
            </button>
          )}
        </div>

        <div className="text-sm">
          你目前：<span className="font-semibold">{you}</span>
        </div>

        {seatError && <div className="text-red-600">{seatError}</div>}

        <div className="mt-2 flex flex-col items-center gap-2">
          <div className="text-sm text-gray-600">
            先手：<span className="font-semibold">{startingPlayer === "white" ? "白方" : "黑方"}</span>{" "}
            {startingMode === "random" ? "(隨機)" : "(手動)"}
          </div>

          <div className="flex gap-2">
            <button className="px-3 py-1 rounded border" onClick={handleToggleStartingPlayer} disabled={gameMode === "single"}>
              切換先手
            </button>
            <button className="px-3 py-1 rounded border" onClick={handleRandomStartingPlayer} disabled={gameMode === "single"}>
              隨機先手
            </button>
          </div>

          <button
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            onClick={handlePressReady}
            disabled={localSide === "spectator" || (localSide !== "spectator" && ready[localSide])}
          >
            {localSide === "spectator" ? "觀戰" : ready[localSide] ? "已準備" : "準備"}
          </button>

          <div className="text-sm text-gray-600">
            白方：{ready.white ? "✅" : "⏳"}　黑方：{ready.black ? "✅" : "⏳"}　遊戲：{gameStarted ? "已開始" : "未開始"}
          </div>
        </div>
      </div>
    );
  }

  function renderTopBar() {
    const turnText = renderWinner
      ? `勝者：${renderWinner === "white" ? "白方" : "黑方"}`
      : `目前回合：${renderCurrentPlayer === "white" ? "白方" : "黑方"}`;

    const modeText = gameMode === "single" ? `單人 vs AI（AI：${aiSide === "white" ? "白方" : "黑方"}）` : "PVP";

    return (
      <div className="w-full flex items-center justify-between px-4 py-2 border-b">
        <div className="font-semibold">{modeText}</div>

        <div className="flex items-center gap-3">
          <div className="font-bold">{turnText}</div>

          {viewState && (
            <div className="text-sm text-gray-600">
              回放：第 {viewSnapshotIndex} / {snapshots.length - 1} 手
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button className="px-3 py-1 rounded border" onClick={handleRestartGame}>
            重新開始
          </button>
          <button className="px-3 py-1 rounded border" onClick={handleExitGame}>
            離開
          </button>
        </div>
      </div>
    );
  }

  function renderReplayControls() {
    if (!snapshots.length || !showEndModal) return null;

    return (
      <div className="flex items-center gap-2 mt-2">
        <button
          className="px-3 py-1 rounded border disabled:opacity-50"
          disabled={viewSnapshotIndex === null || viewSnapshotIndex <= 0}
          onClick={() => setViewSnapshotIndex((v) => (v === null ? 0 : Math.max(0, v - 1)))}
        >
          上一步
        </button>
        <button
          className="px-3 py-1 rounded border disabled:opacity-50"
          disabled={viewSnapshotIndex === null || viewSnapshotIndex >= snapshots.length - 1}
          onClick={() => setViewSnapshotIndex((v) => (v === null ? snapshots.length - 1 : Math.min(snapshots.length - 1, v + 1)))}
        >
          下一步
        </button>
        <button className="px-3 py-1 rounded border" onClick={() => setViewSnapshotIndex(snapshots.length - 1)}>
          最後局面
        </button>
      </div>
    );
  }

  // =========================
  // JSX 主畫面
  // =========================
  if (!inRoom) {
    return <div className="w-full h-[calc(100vh-0px)]">{renderLobby()}</div>;
  }

  // 已入房但未選邊/未開始
  if (!gameStarted) {
    return (
      <div className="w-full h-[calc(100vh-0px)] flex flex-col">
        {renderTopBar()}
        <div className="flex-1">{renderSideSelect()}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-0px)] flex flex-col">
      {renderTopBar()}

      <div className="flex flex-1 overflow-hidden">
        {/* 左側：棋子資訊 */}
        <div className="w-[320px] border-r overflow-auto">
          <PieceInfoPanel
            selectedPiece={selectedPiece}
            currentPlayer={renderCurrentPlayer}
            localSide={localSide}
          />
          <div className="p-3 border-t">
            <CapturedPiecesPanel capturedPieces={renderCaptured} />
          </div>

          {showEndModal && (
            <div className="p-3 border-t">
              <div className="font-bold mb-2">對局結束</div>
              <div className="text-sm text-gray-700 mb-2">
                勝者：{renderWinner === "white" ? "白方" : renderWinner === "black" ? "黑方" : "—"}
              </div>
              {renderReplayControls()}
            </div>
          )}
        </div>

        {/* 中間：棋盤 */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <GameBoard
            pieces={renderPieces}
            selectedPieceIndex={selectedPieceIndex}
            highlights={highlights}
            burnMarks={renderBurnMarks}
            holyLights={renderHolyLights}
            dragonPathNodes={dragonPathNodes}
            protectionZones={protectionZones}
            wizardBeam={wizardBeam}
            onSelectPiece={handleSelectPiece}
            onCellClick={handleCellClick}
            canPlay={canPlay}
            getNodeCoordinate={getNodeCoordinate}
          />
        </div>

        {/* 右側：回合顯示 + 歷史（座標已是 A~I,1~9 由 getNodeCoordinate 處理） */}
        <div className="w-[360px] border-l overflow-auto">
          <div className="p-3">
            <div className="text-lg font-bold mb-2">
              {renderWinner
                ? `勝者：${renderWinner === "white" ? "白方" : "黑方"}`
                : `目前回合：${renderCurrentPlayer === "white" ? "白方" : "黑方"}`}
            </div>
            <div className="text-sm text-gray-600">
              你是：{localSide === "spectator" ? "觀戰" : localSide === "white" ? "白方" : "黑方"}
              {gameMode === "single" && `（AI：${aiSide === "white" ? "白方" : "黑方"}）`}
            </div>
          </div>

          <TurnHistoryPanel
            moveHistory={renderMoveHistory}
            localSide={localSide}
          />
        </div>
      </div>

      {/* 守護對話框 */}
      <GuardDialog
        open={guardDialogOpen}
        options={guardOptions}
        selectedPaladinIndex={selectedGuardPaladinIndex}
        onChangeSelected={handleChangeSelectedGuardPaladin}
        onConfirm={handleGuardConfirm}
        onDecline={handleGuardDecline}
      />

      {/* 巫師攻擊模式對話框 */}
      <WizardAttackDialog
        open={!!wizardAttackRequest}
        onChooseLine={() => resolveWizardAttackWithMode("line")}
        onChooseMove={() => resolveWizardAttackWithMode("move")}
        onClose={() => setWizardAttackRequest(null)}
      />
    </div>
  );
}
