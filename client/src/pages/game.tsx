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
  startingPlayer: PlayerSide; // 本局設定的先攻方
  startingMode: StartingMode; // manual / random（顯示用）
  ready: ReadyState; // 雙方是否按下「開始遊戲」
  gameStarted: boolean; // 是否已從準備階段進入對局
  pendingGuard: PendingGuard | null; // ★ 新增：等待聖騎士守護決定
}

// =========================
// ✅ 新增：刺客潛行延長到「敵方回合結束」
// - 做法：當刺客變成 stealthed=true 時，額外掛一個 metadata：stealthExpiresOn = 自己那一方
// - 當回合切回該方（代表敵方回合已結束）時，自動解除潛行
// =========================
function setAssassinStealthMeta(piece: Piece): Piece {
  if (piece.type !== "assassin") return piece;

  const p: any = piece;
  if (piece.stealthed) {
    // 潛行要延續到敵方回合結束 => 當回合再切回自己時解除
    p.stealthExpiresOn = piece.side; // "white" | "black"
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
// ✅ 新增：龍灼痕「只保留該龍最新一次移動的灼痕」
// - 需要幫龍與灼痕做 tag（不改 schema，直接掛在物件上）
// - dragonTag：掛在 dragon Piece 上
// - burnMark.dragonTag：掛在灼痕上，用來清掉舊灼痕
// - 龍死：移除該 dragonTag 的所有灼痕
// =========================
function ensureDragonTags(pieces: Piece[]): Piece[] {
  let wCount = 0;
  let bCount = 0;

  return pieces.map((piece) => {
    if (piece.type !== "dragon") return piece;

    const p: any = piece;
    if (p.dragonTag) return piece;

    const tag =
      piece.side === "white"
        ? `dragon-white-${wCount++}`
        : `dragon-black-${bCount++}`;

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

function buildAllPaladinProtectedSet(
  pieces: Piece[],
  adjacency: number[][],
  allNodes: NodePosition[]
): Set<string> {
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
  // 一般情況：不是刺客，或最後不是潛行狀態 → 三邊都顯示完整文字
  if (!movedPiece || movedPiece.type !== "assassin" || !movedPiece.stealthed) {
    return {
      fullText: text,
      whiteText: text,
      blackText: text,
    };
  }

  // movedPiece 是潛行刺客（最後棋面仍是潛行狀態）
  const hiddenMsg = "刺客 ? → ?";

  if (movedPiece.side === "white") {
    return {
      fullText: text,
      whiteText: text,
      blackText: hiddenMsg,
    };
  } else {
    return {
      fullText: text,
      whiteText: hiddenMsg,
      blackText: text,
    };
  }
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
  const [ready, setReady] = useState<ReadyState>({
    white: false,
    black: false,
  });
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
    // 當前回合不是自己 → 代表是「自己的吟遊詩人，敵方回合」
    return currentPlayer !== localSide;
  };

  const [seatError, setSeatError] = useState<string | null>(null);

  // 只有「不是觀戰」且「本機顏色 = 當前回合」且「尚未勝負且已開始」才能真的下子
  const canPlay =
    localSide !== "spectator" && localSide === currentPlayer && !winner && gameStarted;

  // ---- 房間 / WebSocket 狀態 ----
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">(
    "connecting"
  );
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
      if (cp.side === lastMoverSide) {
        movedIndices.push(j);
      }
    }

    return movedIndices;
  }

  // ====== 初始化棋盤節點 ======
  useEffect(() => {
    const rows = buildRows(700, 700);
    const nodes = buildAllNodes(rows);
    const adj = buildAdjacency(rows);
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
      setGuardRequest({
        targetRow,
        targetCol,
        targetPieceIndex,
        attackerPieceIndex,
        defenderSide,
      });
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
    ws.send(
      JSON.stringify({
        type: "state",
        state: next,
        from: clientIdRef.current,
      })
    );
  }

  // ====== WebSocket 連線 ======
  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.host; // localhost:5000
    const ws = new WebSocket(`${wsProtocol}//${wsHost}/ws`);

    socketRef.current = ws;
    setSocketStatus("connecting");

    ws.onopen = () => {
      setSocketStatus("connected");
    };

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
          const state = msg.state as SyncedState;
          applySyncedState(state);
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

    return () => {
      ws.close();
    };
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

    socketRef.current.send(
      JSON.stringify({
        type: "joinRoom",
        password: passwordInput,
      })
    );
  }

  // ====== 判斷巫師是否被吃掉 ======
  function checkWizardWin(newPieces: Piece[]): Side | null {
    const hasWhiteWizard = newPieces.some((p) => p.type === "wizard" && p.side === "white");
    const hasBlackWizard = newPieces.some((p) => p.type === "wizard" && p.side === "black");

    let newWinner: Side | null = null;

    if (!hasWhiteWizard && hasBlackWizard) {
      newWinner = "black";
    } else if (!hasBlackWizard && hasWhiteWizard) {
      newWinner = "white";
    }

    if (newWinner) {
      setWinner(newWinner);
    }

    return newWinner;
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

    const newReady: ReadyState = {
      ...ready,
      [sideKey]: true,
    };

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

    // ✅ 若被守護而犧牲的聖騎士「站到灼痕上」也不影響（犧牲前不清）
    // ✅ 但守護後新棋盤上若「有聖騎士落點」那格是灼痕，要清掉（這局規則只清終點）
    // => 這裡守護是「聖騎士跳去被攻擊的棋子原位」等於聖騎士移動了
    //    但他會被犧牲（被吃）所以不需要清終點；清終點規則只對「仍存在的聖騎士」有效。

    const paladinProtectionZone = calculatePaladinProtectionZone(paladin, pieces, adjacency, allNodes);

    // 龍的灼痕：本段是攻擊事件，不是龍移動，不產生新的灼痕
    // （原本這裡也有龍路徑灼痕邏輯，但那是「龍攻擊造成移動」時才需要）
    if (selectedPiece.type === "dragon") {
      // 龍攻擊移動（你的規則：攻擊會移動到目標格）
      // ✅ 但「灼痕規則」改成：只有龍移動時會刷新自己的灼痕（本段確實是移動）
      // 所以保留生成灼痕，但要改為：
      // 1) 先清掉該龍舊灼痕
      // 2) 再依路徑生成新灼痕（避開所有聖騎士守護區內的空格）
      const tag = getDragonTag(selectedPiece);
      const path = calculateDragonPath(
        selectedPiece.row,
        selectedPiece.col,
        targetRow,
        targetCol,
        adjacency,
        allNodes
      );

      if (tag) {
        updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
      }

      // 先更新棋子（還沒真正套回 newPieces 前，用 pieces + 假想移動算保護區 union）
      // 這裡先不把龍移過去，以免保護區 union 受影響；保護區只看聖騎士即可
      const protectedSet = buildAllPaladinProtectedSet(pieces, adjacency, allNodes);

      // 起點也會成為空格（龍離開），符合「空格」判斷，所以用 newPieces 後再判斷最準
      // 但這裡路徑灼痕只會落在空格（起點/中途），所以先用「原棋盤上該格是否有其他棋」近似即可：
      // 若該格不是龍自己佔據，表示有其他棋，不算空格 => 不受保護區阻擋
      const isCellEmptyExceptDragon = (r: number, c: number) => {
        const idx = getPieceAt(pieces, r, c);
        if (idx === -1) return true;
        const p = pieces[idx];
        return p.type === "dragon" && p.row === selectedPiece.row && p.col === selectedPiece.col;
      };

      // 生成灼痕：起點 + 路徑中間（不含終點）
      const addIfAllowed = (r: number, c: number) => {
        const key = `${r},${c}`;
        const isProtected = protectedSet.has(key);
        const isEmpty = isCellEmptyExceptDragon(r, c);
        // ✅ 若在任一聖騎士守護區 且 是空格 => 不生成灼痕
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

    if (movedAttacker.type === "assassin") {
      movedAssassinFinal = movedAttacker;
    }

    // ✅ 龍死亡要清灼痕：這裡犧牲的是「聖騎士」，不是龍
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

    // ✅ 灼痕不再因回合清除（改由「該龍再次移動」才清，或龍死才清）
    const remainingBurnMarks = updatedBurnMarks;

    // HolyLight 維持原本規則（仍會在對手回合結束時消失）
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

    const updatedHolyLights = [
      ...remainingHolyLights,
      {
        row: paladinRow,
        col: paladinCol,
        createdBy: paladin.side,
      },
    ];

    // ✅ 切回 nextPlayer 前，先清掉「到期的刺客潛行」
    const piecesAfterStealthExpire = clearExpiredAssassinStealth(newPieces, nextPlayer);

    const result = checkWizardWin(piecesAfterStealthExpire);
    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    const syncState: SyncedState = {
      pieces: piecesAfterStealthExpire,
      currentPlayer: result ? currentPlayer : nextPlayer,
      moveHistory: newMoveHistory,
      burnMarks: remainingBurnMarks,
      holyLights: updatedHolyLights,
      capturedPieces: localCaptured,
      winner: result ?? winner,
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

    // ✅ 龍死亡要清灼痕：若這次被吃的是龍，立刻清掉它的灼痕
    if (targetPiece.type === "dragon") {
      const tag = getDragonTag(targetPiece);
      if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
    }

    if (targetPiece.type !== "bard") {
      localCaptured = addCaptured(localCaptured, targetPiece);

      newPieces.splice(targetIdx, 1);
      newPieces = activateAllBards(newPieces);
    }

    const adjustedIdx = targetPiece.type !== "bard" && targetIdx < attackerPieceIndex ? attackerPieceIndex - 1 : attackerPieceIndex;

    if (targetPiece.type !== "bard") {
      if (selectedPiece.type === "wizard") {
        // 巫師視線攻擊留在原地
      } else if (selectedPiece.type === "dragon") {
        const tag = getDragonTag(selectedPiece);
        const path = calculateDragonPath(
          selectedPiece.row,
          selectedPiece.col,
          targetRow,
          targetCol,
          adjacency,
          allNodes
        );

        if (tag) {
          updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
        }

        // ✅ 龍新灼痕：避開「任一聖騎士守護區內的空格」
        // 先把龍移過去（用 newPieces 的狀態判斷空格最準）
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

        // dragon 不是刺客
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
          // 攻擊後刺客現形（你原本的規則保留）
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

    // ✅ 灼痕不再因回合清除
    const remainingBurnMarks = updatedBurnMarks;

    // HolyLight 保留原規則
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

    // ✅ 切回 nextPlayer 前，先清掉「到期的刺客潛行」
    const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);

    const syncState: SyncedState = {
      pieces: piecesAfterStealthExpire,
      currentPlayer: result ? currentPlayer : nextPlayer,
      moveHistory: newMoveHistory,
      burnMarks: remainingBurnMarks,
      holyLights: remainingHolyLights,
      capturedPieces: localCaptured,
      winner: result ?? winner,
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

  // ====== 巫師攻擊方式選擇：導線射擊 or 移動攻擊 ======
  const handleWizardLineShot = () => {
    if (!wizardAttackRequest || winner) return;

    const { wizardIndex, targetRow, targetCol, targetPieceIndex } = wizardAttackRequest;

    const wizard = pieces[wizardIndex];
    const targetPiece = pieces[targetPieceIndex];

    let newPieces = [...pieces];
    let localCaptured = cloneCaptured(capturedPieces);

    let updatedBurnMarks = [...burnMarks];

    // ✅ 若射死的是龍：清掉該龍灼痕
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

    // ✅ 切回 nextPlayer 前，先清掉「到期的刺客潛行」
    const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);

    // HolyLight 保留原規則
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

    const record = makeMoveRecord(moveDesc, null);
    const newMoveHistory = [record, ...moveHistory];

    const syncState: SyncedState = {
      pieces: piecesAfterStealthExpire,
      currentPlayer: result ? currentPlayer : nextPlayer,
      moveHistory: newMoveHistory,
      burnMarks: updatedBurnMarks,
      holyLights: remainingHolyLights,
      capturedPieces: localCaptured,
      winner: result ?? winner,
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

    // ✅ 若吃到龍：清掉該龍灼痕
    if (targetPiece.type === "dragon") {
      const tag = getDragonTag(targetPiece);
      if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
    }

    if (targetPiece.type !== "bard") {
      localCaptured = addCaptured(localCaptured, targetPiece);
      newPieces.splice(targetPieceIndex, 1);
      newPieces = activateAllBards(newPieces);
    }

    // 被 splice 掉之後，巫師的 index 可能往前一格
    const adjustedWizardIndex = targetPiece.type !== "bard" && targetPieceIndex < wizardIndex ? wizardIndex - 1 : wizardIndex;

    const movedWizard: Piece = {
      ...wizard,
      row: targetRow,
      col: targetCol,
    };

    newPieces[adjustedWizardIndex] = movedWizard;

    const fromCoord = getNodeCoordinate(wizard.row, wizard.col);
    const toCoord = getNodeCoordinate(targetRow, targetCol);

    const moveDesc =
      targetPiece.type === "bard"
        ? `${PIECE_CHINESE[wizard.type]} ${fromCoord} 移動至 ${toCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} (無法擊殺)`
        : `${PIECE_CHINESE[wizard.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (巫師移動)`;

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

    // ✅ 切回 nextPlayer 前，先清掉「到期的刺客潛行」
    const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);

    // HolyLight 保留原規則
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

    const record = makeMoveRecord(moveDesc, null);
    const newMoveHistory = [record, ...moveHistory];

    const syncState: SyncedState = {
      pieces: piecesAfterStealthExpire,
      currentPlayer: result ? currentPlayer : nextPlayer,
      moveHistory: newMoveHistory,
      burnMarks: updatedBurnMarks,
      holyLights: remainingHolyLights,
      capturedPieces: localCaptured,
      winner: result ?? winner,
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
    // 若目前有 pending 的守護決定，暫停其他操作
    if (guardRequest) {
      return;
    }

    const effectivePieces =
      isObserving && viewSnapshotIndex !== null && snapshots[viewSnapshotIndex] ? snapshots[viewSnapshotIndex].pieces : pieces;

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
            swapTarget.type !== "wizard" // ✅ 排除巫師
          ) {

          const newPieces = [...pieces];
          const bard = newPieces[bardNeedsSwap.bardIndex];

          // 吟遊詩人本身不是刺客，不會受 updateAssassinStealth 影響
          const movedBard = {
            ...bard,
            row: swapTarget.row,
            col: swapTarget.col,
          };

          let swappedPiece = {
            ...swapTarget,
            row: bardNeedsSwap.bardRow,
            col: bardNeedsSwap.bardCol,
          };

          // 如果被換的是刺客 → 強制現形
          if (swappedPiece.type === "assassin") {
            const sp: any = { ...swappedPiece, stealthed: false };
            delete sp.stealthExpiresOn;
            swappedPiece = sp as Piece;
          }

          newPieces[bardNeedsSwap.bardIndex] = movedBard;
          newPieces[clickedPieceIdx] = swappedPiece;

          // ===== 新增：若交換後任一顆是聖騎士，揭露其守護範圍內的潛行刺客 =====
          const paladinIndicesToCheck: number[] = [];
          if (movedBard.type === "paladin") {
            paladinIndicesToCheck.push(bardNeedsSwap.bardIndex);
          }
          if (swappedPiece.type === "paladin") {
            paladinIndicesToCheck.push(clickedPieceIdx);
          }

          if (paladinIndicesToCheck.length > 0) {
            for (const pi of paladinIndicesToCheck) {
              const pal = newPieces[pi];
              const zones = calculatePaladinProtectionZone(pal, newPieces, adjacency, allNodes);
              const revealedPieces = revealAssassinsInSpecificZone(newPieces, zones, pal.side);
              for (let i = 0; i < newPieces.length; i++) {
                newPieces[i] = revealedPieces[i];
              }
            }
          }
          // ===== 新增結束 =====

          const bardCoord = getNodeCoordinate(bardNeedsSwap.bardRow, bardNeedsSwap.bardCol);
          const swapCoord = getNodeCoordinate(swapTarget.row, swapTarget.col);
          const moveDesc = `${PIECE_CHINESE["bard"]} ${bardCoord} ⇄ ${PIECE_CHINESE[swapTarget.type]} ${swapCoord}`;

          const record = makeMoveRecord(moveDesc, null);
          const newMoveHistory = [record, ...moveHistory];

          const result = checkWizardWin(newPieces);
          const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

          // ✅ 灼痕不再因回合清除
          const remainingBurnMarks = burnMarks;

          // HolyLight 保留原規則
          const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

          // ✅ 切回 nextPlayer 前，先清掉「到期的刺客潛行」
          const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);

          const syncState: SyncedState = {
            pieces: piecesAfterStealthExpire,
            currentPlayer: result ? currentPlayer : nextPlayer,
            moveHistory: newMoveHistory,
            burnMarks: remainingBurnMarks,
            holyLights: remainingHolyLights,
            capturedPieces,
            winner: result ?? winner,
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

        // 若是「自己的吟遊詩人，但不是自己回合」→ 不顯示路徑
        if (isOwnBardOutOfTurnForPiece(piece)) {
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          return;
        }

        const canShowMoves =
          isObserving || localSide === "spectator" || piece.side === localSide || piece.side === "neutral";

        if (canShowMoves) {
          if (allNodes.length > 0) {
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
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
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
            } else if (piece.type === "dragon") {
              const result = calculateDragonMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                burnMarks,
                holyLights
              );
              setHighlights(result.highlights);
              setDragonPathNodes(result.pathNodes);
              setProtectionZones([]);
            } else if (piece.type === "ranger") {
              const moves = calculateRangerMoves(
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
            } else if (piece.type === "griffin") {
              const moves = calculateGriffinMoves(
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
            } else if (piece.type === "assassin") {
              const moves = calculateAssassinMoves(
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
            } else if (piece.type === "paladin") {
              const moves = calculatePaladinMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks
              );
              const zones = calculatePaladinProtectionZone(piece, effectivePieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones(zones);

              if (!isObserving) {
                const revealedPieces = revealAssassinsInSpecificZone(pieces, zones, piece.side);
                setPieces(revealedPieces);
              }
            } else if (piece.type === "bard") {
              const moves = calculateBardMoves(
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
            } else {
              setHighlights([]);
              setDragonPathNodes([]);
              setProtectionZones([]);
            }
          } else {
            setHighlights([]);
            setDragonPathNodes([]);
            setProtectionZones([]);
          }
        } else {
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
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
          return;
        }

        const canShowMoves =
          isObserving || localSide === "spectator" || piece.side === localSide || piece.side === "neutral";

        if (canShowMoves) {
          if (allNodes.length > 0) {
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
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
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
            } else if (piece.type === "dragon") {
              const result = calculateDragonMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                burnMarks,
                holyLights
              );
              setHighlights(result.highlights);
              setDragonPathNodes(result.pathNodes);
              setProtectionZones([]);
            } else if (piece.type === "ranger") {
              const moves = calculateRangerMoves(
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
            } else if (piece.type === "griffin") {
              const moves = calculateGriffinMoves(
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
            } else if (piece.type === "assassin") {
              const moves = calculateAssassinMoves(
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
            } else if (piece.type === "paladin") {
              const moves = calculatePaladinMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks
              );
              const zones = calculatePaladinProtectionZone(piece, effectivePieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones(zones);
            } else if (piece.type === "bard") {
              const moves = calculateBardMoves(
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
            } else {
              setHighlights([]);
              setDragonPathNodes([]);
              setProtectionZones([]);
            }
          } else {
            setHighlights([]);
            setDragonPathNodes([]);
            setProtectionZones([]);
          }
        } else {
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
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

        // 1) 目標是己方棋子 → 一律不能走（包含己方潛行刺客）
        if (targetPiece.side === selectedPiece.side) {
          setSelectedPieceIndex(-1);
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          return;
        }

        // 2) 吟遊詩人踩「敵方潛行刺客」：交換位置並讓刺客現形
        if (
          selectedPiece.type === "bard" &&
          targetPiece.type === "assassin" &&
          targetPiece.side !== selectedPiece.side &&
          targetPiece.stealthed
        ) {
          const bardIdx = selectedPieceIndex;
          const assassinIdx = actualTargetIdx;

          const newBard: Piece = {
            ...selectedPiece,
            row,
            col,
          };

          const newAssassinAny: any = {
            ...targetPiece,
            row: selectedPiece.row,
            col: selectedPiece.col,
            stealthed: false, // ★ 這裡讓刺客現形
          };
          delete newAssassinAny.stealthExpiresOn;
          const newAssassin = newAssassinAny as Piece;

          newPieces[bardIdx] = newBard;
          newPieces[assassinIdx] = newAssassin;

          moveDesc = `${PIECE_CHINESE["bard"]} ${fromCoord} ⇄ 刺客 ${toCoord}（現形）`;
        } else if (targetPiece.type === "bard") {
          // 吟遊詩人不能被吃，這步當作無效
          setSelectedPieceIndex(-1);
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          return;
        } else {
          // 3) 其他情況：正常吃子（這裡一定是敵方棋子）

          // ✅ 龍死亡要清灼痕
          if (targetPiece.type === "dragon") {
            const tag = getDragonTag(targetPiece);
            if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
          }

          localCaptured = addCaptured(localCaptured, targetPiece);

          newPieces.splice(actualTargetIdx, 1);
          newPieces = activateAllBards(newPieces);

          const adjustedIdx = actualTargetIdx < selectedPieceIndex ? selectedPieceIndex - 1 : selectedPieceIndex;

          let movedPiece = updateAssassinStealth({ ...selectedPiece, row, col }, selectedPiece.row, selectedPiece.col, row, col);
          movedPiece = setAssassinStealthMeta(movedPiece);

          if (movedPiece.type === "assassin") {
            // 攻擊（吃子）後刺客現形（保留你原本規則）
            const mp: any = { ...movedPiece, stealthed: false };
            delete mp.stealthExpiresOn;
            movedPiece = mp as Piece;
            movedAssassinFinal = movedPiece;
          }

          newPieces[adjustedIdx] = movedPiece;
          moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
        }
      } else {
        // 落在空格
        let movedPiece = updateAssassinStealth({ ...selectedPiece, row, col }, selectedPiece.row, selectedPiece.col, row, col);
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

      // ✅ 龍移動才處理灼痕（且灼痕會一直存在，直到該龍下一次移動刷新）
      if (selectedPiece.type === "dragon") {
        const dragonTag = getDragonTag(selectedPiece);
        const path = calculateDragonPath(selectedPiece.row, selectedPiece.col, row, col, adjacency, allNodes);

        if (dragonTag) {
          updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, dragonTag);
        }

        // 先把龍落點更新進 newPieces，讓「空格判斷」正確
        newPieces = ensureDragonTags(newPieces);

        const protectedSet = buildAllPaladinProtectedSet(newPieces, adjacency, allNodes);

        const addIfAllowed = (r: number, c: number) => {
          const key = `${r},${c}`;
          const isProtected = protectedSet.has(key);
          const isEmpty = getPieceAt(newPieces, r, c) === -1;

          // ✅ 守護區內的空格：龍經過不形成灼痕（不論友敵）
          if (isProtected && isEmpty) return;

          if (!updatedBurnMarks.some((b) => b.row === r && b.col === c)) {
            const m: any = { row: r, col: c, createdBy: selectedPiece.side };
            if (dragonTag) m.dragonTag = dragonTag;
            updatedBurnMarks.push(m as BurnMark);
          }
        };

        addIfAllowed(selectedPiece.row, selectedPiece.col);
        for (const pathNode of path) {
          if (pathNode.row === row && pathNode.col === col) continue; // 終點不留灼痕（保留你原本做法）
          addIfAllowed(pathNode.row, pathNode.col);
        }
      }

      // ✅ 聖騎士可以站在灼痕上，並使「踏上去的終點」灼痕消失
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
          return;
        }

        const movedWizard = {
          ...wizard,
          row: apprentice.row,
          col: apprentice.col,
        };

        const movedApprentice: any = {
          ...apprentice,
          row: wizard.row,
          col: wizard.col,
          swapUsed: true,
        };

        newPieces[wizardIdx] = movedWizard;
        newPieces[apprenticeIdx] = movedApprentice as Piece;

        moveDesc = `${PIECE_CHINESE[wizard.type]} ${fromCoord} ⇄ ${PIECE_CHINESE["apprentice"]} ${toCoord}`;
      } else {
        let movedPiece = updateAssassinStealth({ ...selectedPiece, row, col }, selectedPiece.row, selectedPiece.col, row, col);
        let swappedPiece = updateAssassinStealth(
          { ...targetPiece, row: selectedPiece.row, col: selectedPiece.col },
          targetPiece.row,
          targetPiece.col,
          selectedPiece.row,
          selectedPiece.col
        );

        movedPiece = setAssassinStealthMeta(movedPiece);
        swappedPiece = setAssassinStealthMeta(swappedPiece);

        // ⭐ 規則：只要是「交換位置」，刺客一律現形
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

          // ✅ 聖騎士踏上去的終點清灼痕
          updatedBurnMarks = removeBurnMarkAtCell(updatedBurnMarks, movedPiece.row, movedPiece.col);
        }

        if (swappedPiece.type === "paladin") {
          const zones = calculatePaladinProtectionZone(swappedPiece, newPieces, adjacency, allNodes);
          const revealedPieces = revealAssassinsInSpecificZone(newPieces, zones, swappedPiece.side);
          for (let i = 0; i < newPieces.length; i++) newPieces[i] = revealedPieces[i];

          // ✅ 聖騎士踏上去的終點清灼痕
          updatedBurnMarks = removeBurnMarkAtCell(updatedBurnMarks, swappedPiece.row, swappedPiece.col);
        }

        moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⇄ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
      }
    } else if (highlight.type === "attack") {
      const targetIdx = clickedPieceIdx!;
      const targetPiece = pieces[targetIdx];

      // 🧙‍♂ 巫師：若攻擊的是「相鄰」格，跳出導線 / 移動選擇視窗
      if (selectedPiece.type === "wizard") {
        const wizardNodeIdx = allNodes.findIndex((n) => n.row === selectedPiece.row && n.col === selectedPiece.col);
        const targetNodeIdx = allNodes.findIndex((n) => n.row === row && n.col === col);

        const isAdjacent =
          wizardNodeIdx !== -1 && targetNodeIdx !== -1 && adjacency[wizardNodeIdx]?.includes(targetNodeIdx);

        if (isAdjacent) {
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
          return;
        }
      }

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

      // 沒有守護聖騎士 → 直接進正常攻擊流程
      if (targetPiece.type !== "bard") {
        // ✅ 龍死亡要清灼痕
        if (targetPiece.type === "dragon") {
          const tag = getDragonTag(targetPiece);
          if (tag) updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, tag);
        }

        localCaptured = addCaptured(localCaptured, targetPiece);

        newPieces.splice(targetIdx, 1);
        newPieces = activateAllBards(newPieces);
      }

      const adjustedIdx = targetPiece.type !== "bard" && targetIdx < selectedPieceIndex ? selectedPieceIndex - 1 : selectedPieceIndex;

      if (targetPiece.type !== "bard") {
        if (selectedPiece.type === "wizard") {
          // 巫師視線攻擊不動
        } else if (selectedPiece.type === "dragon") {
          // ✅ 龍攻擊會移動，等同移動刷新灼痕
          const dragonTag = getDragonTag(selectedPiece);
          const path = calculateDragonPath(selectedPiece.row, selectedPiece.col, row, col, adjacency, allNodes);

          if (dragonTag) {
            updatedBurnMarks = removeBurnMarksByDragonTag(updatedBurnMarks, dragonTag);
          }

          let movedPiece = updateAssassinStealth({ ...selectedPiece, row, col }, selectedPiece.row, selectedPiece.col, row, col);
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
          let movedPiece = updateAssassinStealth({ ...selectedPiece, row, col }, selectedPiece.row, selectedPiece.col, row, col);
          movedPiece = setAssassinStealthMeta(movedPiece);

          if (movedPiece.type === "assassin") {
            // 攻擊後刺客現形（保留你原本規則）
            const mp: any = { ...movedPiece, stealthed: false };
            delete mp.stealthExpiresOn;
            movedPiece = mp as Piece;
            movedAssassinFinal = movedPiece;
          }

          newPieces[adjustedIdx] = movedPiece;
        }
      }

      // ✅ 聖騎士攻擊後若站到灼痕上，清掉終點灼痕
      if (selectedPiece.type === "paladin") {
        updatedBurnMarks = removeBurnMarkAtCell(updatedBurnMarks, row, col);
      }

      moveDesc =
        targetPiece.type === "bard"
          ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`
          : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
    }

    // 若移動的是聖騎士，重新顯形範圍內刺客
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

    // 吟遊詩人普通移動 → 啟動「必須換位」流程
    if (selectedPiece.type === "bard" && highlight.type === "move") {
      const bardNewIdx = selectedPieceIndex;
      const movedBard = newPieces[bardNewIdx];

      if (movedBard) {
        setPieces(newPieces);
        setCapturedPieces(localCaptured);
        setBurnMarks(updatedBurnMarks);

        setBardNeedsSwap({
          bardIndex: bardNewIdx,
          bardRow: movedBard.row,
          bardCol: movedBard.col,
        });

        const swapHighlights: MoveHighlight[] = newPieces
          .filter(
            (p) =>
              p.side === currentPlayer &&
              p.type !== "bard" &&
              p.type !== "dragon" &&
              p.type !== "wizard" // ✅ 排除巫師
          )
          .map((p) => ({
            type: "swap" as const,
            row: p.row,
            col: p.col,
          }));


        setHighlights(swapHighlights);
        setDragonPathNodes([]);
        setProtectionZones([]);
        return;
      }
    }

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide = currentPlayer === "white" ? "black" : "white";

    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    // ✅ 灼痕不再因回合清除（只會：龍再次移動刷新 / 龍死亡清除 / 聖騎士踏上終點清除）
    const remainingBurnMarks = updatedBurnMarks;

    // HolyLight 保留原規則
    const remainingHolyLights = holyLights.filter((light) => light.createdBy !== nextPlayer);

    // ✅ 切回 nextPlayer 前，先清掉「到期的刺客潛行」
    const piecesAfterStealthExpire = clearExpiredAssassinStealth(ensureDragonTags(newPieces), nextPlayer);

    const syncState: SyncedState = {
      pieces: piecesAfterStealthExpire,
      currentPlayer: result ? currentPlayer : nextPlayer,
      moveHistory: newMoveHistory,
      burnMarks: remainingBurnMarks,
      holyLights: remainingHolyLights,
      capturedPieces: localCaptured,
      winner: result ?? winner,
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
  };

  // ---- 準備階段 ready 顯示 ----
  const myReady = localSide === "white" ? ready.white : localSide === "black" ? ready.black : false;
  const otherReady = localSide === "white" ? ready.black : localSide === "black" ? ready.white : false;

  // ---- 移動紀錄顯示文字（視角） ----
  const baseHistory = snapshots.length > 0 ? snapshots[snapshots.length - 1].moveHistory : moveHistory;

  let displayHistory: string[] = [];
  if (baseHistory) {
    if (isObserving || localSide === "spectator") {
      displayHistory = baseHistory.map((r) => r.fullText);
    } else if (localSide === "white") {
      displayHistory = baseHistory.map((r) => r.whiteText);
    } else if (localSide === "black") {
      displayHistory = baseHistory.map((r) => r.blackText);
    }
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
                      myReady ? "bg-slate-700 text-slate-300 cursor-default" : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
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
            <span className="ml-2">
              [{protectionZones.map((z) => `${getNodeCoordinate(z.row, z.col)}`).join(", ")}]
            </span>
          )}
        </div>

        {/* 回合與玩家狀態列 */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-3">
          <div
            className={`px-3 py-1 rounded-full text-xs sm:text-sm border ${
              isMyTurn ? "border-emerald-400 text-emerald-300 bg-emerald-500/10" : "border-slate-600 text-slate-200 bg-slate-800/60"
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
        targetCoordinate={
          wizardAttackRequest ? getNodeCoordinate(wizardAttackRequest.targetRow, wizardAttackRequest.targetCol) : ""
        }
        onLineShot={handleWizardLineShot}
        onMoveAttack={handleWizardMoveAttack}
      />
    </div>
  );
}
