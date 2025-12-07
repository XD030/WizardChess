// client/src/pages/Game.tsx
import WizardAttackDialog from "../components/WizardAttackDialog";
//import WizardAttackDialog from '@/components/WizardAttackDialog';
import { useState, useEffect, useRef } from 'react';
import type {
  Piece,
  Side,
  MoveHighlight,
  NodePosition,
  BurnMark,
  HolyLight,
  GuardOption,
  MoveRecord,
} from '@shared/schema';

import GameBoard from '../components/GameBoard';
import PieceInfoPanel from '../components/PieceInfoPanel';
import TurnHistoryPanel from '../components/TurnHistoryPanel';
import GuardDialog from '../components/GuardDialog';
import CapturedPiecesPanel from '../components/CapturedPiecesPanel';

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
} from '../lib/gameLogic';

// ==== 型別 ====

type PlayerSide = 'white' | 'black';

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

type StartingMode = 'manual' | 'random';

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
}

// Helper：吃子時啟動所有吟遊詩人
function activateAllBards(pieces: Piece[]): Piece[] {
  return pieces.map((piece) =>
    piece.type === 'bard'
      ? {
          ...piece,
          activated: true,
        }
      : piece,
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
  if (!movedPiece || movedPiece.type !== 'assassin' || !movedPiece.stealthed) {
    return {
      fullText: text,
      whiteText: text,
      blackText: text,
    };
  }

  // movedPiece 是潛行刺客（最後棋面仍是潛行狀態）
  const hiddenMsg = '刺客 ? → ?';

  if (movedPiece.side === 'white') {
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
  const clientIdRef = useRef<string>('');
  if (!clientIdRef.current) {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      clientIdRef.current = crypto.randomUUID();
    } else {
      clientIdRef.current = Math.random().toString(36).slice(2);
    }
  }

  // ======= 棋局核心狀態（會透過 WebSocket 同步） =======
  const [pieces, setPieces] = useState<Piece[]>(getInitialPieces());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerSide>('white');
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
  const [startingPlayer, setStartingPlayer] = useState<PlayerSide>('white');
  const [startingMode, setStartingMode] = useState<StartingMode>('manual');
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
  const [dragonPathNodes, setDragonPathNodes] = useState<
    { row: number; col: number }[]
  >([]);
  const [protectionZones, setProtectionZones] = useState<
    { row: number; col: number }[]
  >([]);

  const [wizardAttackRequest, setWizardAttackRequest] = useState<{
    wizardIndex: number;
    targetRow: number;
    targetCol: number;
    targetPieceIndex: number;
  } | null>(null);

  // 聖騎士守護相關
  const [guardDialogOpen, setGuardDialogOpen] = useState(false);
  const [guardOptions, setGuardOptions] = useState<GuardOption[]>([]);
  const [guardRequest, setGuardRequest] = useState<{
    targetRow: number;
    targetCol: number;
    targetPieceIndex: number;
    attackerPieceIndex: number;
    defenderSide: PlayerSide;
  } | null>(null);
  const [selectedGuardPaladinIndex, setSelectedGuardPaladinIndex] = useState<
    number | null
  >(null);

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
  const [localSide, setLocalSide] = useState<'white' | 'black' | 'spectator'>(
    'spectator',
  );
  const [seatError, setSeatError] = useState<string | null>(null);

  // 只有「不是觀戰」且「本機顏色 = 當前回合」且「尚未勝負且已開始」才能真的下子
  const canPlay =
    localSide !== 'spectator' &&
    localSide === currentPlayer &&
    !winner &&
    gameStarted;

  // ---- 房間 / WebSocket 狀態 ----
  const [socketStatus, setSocketStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting');
  const [inRoom, setInRoom] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [roomError, setRoomError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);

  // ====== 棋局快照，用來回放歷史棋面 ======
  const [snapshots, setSnapshots] = useState<SyncedState[]>([]);
  const [viewSnapshotIndex, setViewSnapshotIndex] = useState<number | null>(
    null,
  );
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
        if (
          pp.side === cp.side &&
          pp.type === cp.type &&
          pp.row === cp.row &&
          pp.col === cp.col
        ) {
          matchedPrev.add(i);
          matchedCur.add(j);
          break;
        }
      }
    }

    const movedIndices: number[] = [];
    const lastMoverSide: Side =
      cur.currentPlayer === 'white' ? 'black' : 'white';

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
      pieces: getInitialPieces(),
      currentPlayer: 'white',
      moveHistory: [],
      burnMarks: [],
      holyLights: [],
      capturedPieces: { white: [], black: [], neutral: [] },
      winner: null,
      seats,
      startingPlayer: 'white',
      startingMode: 'manual',
      ready: { white: false, black: false },
      gameStarted: false,
    };
  }

  // 把從 server 收到的狀態套進來
  function applySyncedState(state: SyncedState) {
    setPieces(state.pieces);
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
        return [state];
      }

      if (state.moveHistory.length === 0) {
        moveCountRef.current = 0;
        return [state];
      }

      if (state.moveHistory.length > moveCountRef.current) {
        moveCountRef.current = state.moveHistory.length;
        return [...prev, state];
      }

      moveCountRef.current = state.moveHistory.length;
      return prev;
    });

    setSelectedPieceIndex(-1);
    setHighlights([]);
    setDragonPathNodes([]);
    setProtectionZones([]);
    setGuardDialogOpen(false);
    setGuardRequest(null);
    setSelectedGuardPaladinIndex(null);
    setBardNeedsSwap(null);
    setWizardAttackRequest(null);
  }

  // 廣播狀態
  function broadcastState(next: SyncedState) {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'state',
        state: next,
        from: clientIdRef.current,
      }),
    );
  }

  // ====== WebSocket 連線 ======
  useEffect(() => {
   const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
   const wsHost = window.location.host; // localhost:5000
   const ws = new WebSocket(`${wsProtocol}//${wsHost}/ws`);

    socketRef.current = ws;
    setSocketStatus('connecting');

    ws.onopen = () => {
      setSocketStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'roomJoined') {
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

        if (msg.type === 'state') {
          const state = msg.state as SyncedState;
          applySyncedState(state);
          return;
        }

        if (msg.type === 'error') {
          setRoomError(msg.message || '加入房間失敗');
          return;
        }
      } catch (err) {
        console.error('ws message parse error', err);
      }
    };

    ws.onclose = () => {
      socketRef.current = null;
      setSocketStatus('disconnected');
      setInRoom(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  function handleJoinRoom() {
    if (!passwordInput.trim()) {
      setRoomError('請輸入房間密碼');
      return;
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setRoomError('WebSocket 尚未連線，請稍候再試');
      return;
    }

    setRoomError(null);

    socketRef.current.send(
      JSON.stringify({
        type: 'joinRoom',
        password: passwordInput,
      }),
    );
  }

  // ====== 判斷巫師是否被吃掉 ======
  function checkWizardWin(newPieces: Piece[]): Side | null {
    const hasWhiteWizard = newPieces.some(
      (p) => p.type === 'wizard' && p.side === 'white',
    );
    const hasBlackWizard = newPieces.some(
      (p) => p.type === 'wizard' && p.side === 'black',
    );

    let newWinner: Side | null = null;

    if (!hasWhiteWizard && hasBlackWizard) {
      newWinner = 'black';
    } else if (!hasBlackWizard && hasWhiteWizard) {
      newWinner = 'white';
    }

    if (newWinner) {
      setWinner(newWinner);
    }

    return newWinner;
  }

  // ====== 再來一局 / 退出遊戲 ======
  function handleRestartGame() {
    const initialPieces = getInitialPieces();
    const newStarting: PlayerSide = 'white';
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
      startingMode: 'manual',
      ready: newReady,
      gameStarted: false,
    };

    setShowEndModal(false);
    setViewSnapshotIndex(null);
    setStartingPlayer(newStarting);
    setStartingMode('manual');
    setReady(newReady);
    setGameStarted(false);

    applySyncedState(initial);
    broadcastState(initial);
  }

  function handleExitGame() {
    setShowEndModal(false);
    setInRoom(false);
    setLocalSide('spectator');
    setViewSnapshotIndex(null);
  }

  // ====== 選擇哪一方（白 / 黑 / 觀戰） ======
  function handleChooseSide(side: 'white' | 'black' | 'spectator') {
    if (!inRoom) return;

    if (side === 'spectator') {
      const newSeats: Seats = {
        whiteOwnerId:
          seats.whiteOwnerId === clientIdRef.current
            ? null
            : seats.whiteOwnerId,
        blackOwnerId:
          seats.blackOwnerId === clientIdRef.current
            ? null
            : seats.blackOwnerId,
      };
      setSeats(newSeats);
      setLocalSide('spectator');
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
      };
      broadcastState(syncState);
      return;
    }

    if (side === 'white') {
      if (
        seats.whiteOwnerId &&
        seats.whiteOwnerId !== clientIdRef.current
      ) {
        setSeatError('另一方已選擇白方');
        return;
      }
      const newSeats: Seats = {
        whiteOwnerId: clientIdRef.current,
        blackOwnerId:
          seats.blackOwnerId === clientIdRef.current
            ? null
            : seats.blackOwnerId,
      };
      setSeats(newSeats);
      setLocalSide('white');
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
      };
      broadcastState(syncState);
      return;
    }

    if (side === 'black') {
      if (
        seats.blackOwnerId &&
        seats.blackOwnerId !== clientIdRef.current
      ) {
        setSeatError('另一方已選擇黑方');
        return;
      }
      const newSeats: Seats = {
        whiteOwnerId:
          seats.whiteOwnerId === clientIdRef.current
            ? null
            : seats.whiteOwnerId,
        blackOwnerId: clientIdRef.current,
      };
      setSeats(newSeats);
      setLocalSide('black');
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
      };
      broadcastState(syncState);
      return;
    }
  }

  // ====== 準備階段：設定先後攻 ======
  function handleToggleStartingPlayer() {
    const next = startingPlayer === 'white' ? 'black' : 'white';
    setStartingPlayer(next);
    setStartingMode('manual');

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
      startingMode: 'manual',
      ready,
      gameStarted,
    };
    broadcastState(syncState);
  }

  function handleRandomStartingPlayer() {
    const next: PlayerSide = Math.random() < 0.5 ? 'white' : 'black';
    setStartingPlayer(next);
    setStartingMode('random');

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
      startingMode: 'random',
      ready,
      gameStarted,
    };
    broadcastState(syncState);
  }

  // ====== 準備階段：玩家按「開始遊戲」 ======
  function handlePressReady() {
    if (localSide === 'spectator') {
      setSeatError('觀戰者無需準備，請選擇白方或黑方參與對局');
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
    // ⚠️ 這裡原本有 if (!canPlay) return; 已移除，守護是防守方反應動作

    const { targetRow, targetCol, targetPieceIndex, attackerPieceIndex } =
      guardRequest;

    if (
      targetPieceIndex >= pieces.length ||
      attackerPieceIndex >= pieces.length ||
      selectedGuardPaladinIndex >= pieces.length
    ) {
      console.error('Invalid indices in guardConfirm');
      return;
    }

    const selectedPiece = pieces[attackerPieceIndex];
    const targetPiece = pieces[targetPieceIndex];
    const paladin = pieces[selectedGuardPaladinIndex];

    if (
      targetPiece.row !== targetRow ||
      targetPiece.col !== targetCol
    ) {
      console.error('Target piece moved before guard resolved');
      return;
    }

    let updatedBurnMarks = [...burnMarks];
    let localCaptured = cloneCaptured(capturedPieces);
    let movedAssassinFinal: Piece | null = null;

    const paladinProtectionZone = calculatePaladinProtectionZone(
      paladin,
      pieces,
      adjacency,
      allNodes,
    );

    if (selectedPiece.type === 'dragon') {
      const path = calculateDragonPath(
        selectedPiece.row,
        selectedPiece.col,
        targetRow,
        targetCol,
        adjacency,
        allNodes,
      );

      if (
        !updatedBurnMarks.some(
          (b) => b.row === selectedPiece.row && b.col === selectedPiece.col,
        )
      ) {
        updatedBurnMarks.push({
          row: selectedPiece.row,
          col: selectedPiece.col,
          createdBy: currentPlayer,
        });
      }

      for (const pathNode of path) {
        if (!(pathNode.row === targetRow && pathNode.col === targetCol)) {
          if (
            !updatedBurnMarks.some(
              (b) => b.row === pathNode.row && b.col === pathNode.col,
            )
          ) {
            updatedBurnMarks.push({
              row: pathNode.row,
              col: pathNode.col,
              createdBy: currentPlayer,
            });
          }
        }
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
      paladinCol,
    );

    if (movedTarget.type === 'assassin' && movedTarget.stealthed) {
      const inPaladinZone = paladinProtectionZone.some(
        (z) => z.row === movedTarget.row && z.col === movedTarget.col,
      );
      if (inPaladinZone) {
        movedTarget = { ...movedTarget, stealthed: false };
      }
    }

    let movedAttacker = updateAssassinStealth(
      { ...selectedPiece, row: targetRowGuard, col: targetColGuard },
      selectedPiece.row,
      selectedPiece.col,
      targetRowGuard,
      targetColGuard,
    );

    if (movedAttacker.type === 'assassin' && movedAttacker.stealthed) {
      const inPaladinZone = paladinProtectionZone.some(
        (z) => z.row === targetRowGuard && z.col === targetColGuard,
      );
      if (inPaladinZone) {
        movedAttacker = { ...movedAttacker, stealthed: false };
      }
    }

    if (movedAttacker.type === 'assassin') {
      movedAssassinFinal = movedAttacker;
    }

    localCaptured = addCaptured(localCaptured, paladin);

    let newPieces = pieces
      .filter(
        (_, idx) =>
          idx !== selectedGuardPaladinIndex &&
          idx !== attackerPieceIndex &&
          idx !== targetPieceIndex,
      )
      .concat([movedTarget, movedAttacker]);

    newPieces = activateAllBards(newPieces);

    const targetIdxAfter = newPieces.findIndex(
      (p) => p.row === movedTarget.row && p.col === movedTarget.col,
    );
    const attackerIdxAfter = newPieces.findIndex(
      (p) => p.row === movedAttacker.row && p.col === movedAttacker.col,
    );

    if (
      newPieces[targetIdxAfter].type === 'assassin' &&
      newPieces[targetIdxAfter].stealthed
    ) {
      const enemySide =
        newPieces[targetIdxAfter].side === 'white' ? 'black' : 'white';
      if (
        isInProtectionZone(
          newPieces[targetIdxAfter].row,
          newPieces[targetIdxAfter].col,
          newPieces,
          enemySide,
          adjacency,
          allNodes,
        )
      ) {
        newPieces[targetIdxAfter] = {
          ...newPieces[targetIdxAfter],
          stealthed: false,
        };
      }
    }

    if (
      newPieces[attackerIdxAfter].type === 'assassin' &&
      newPieces[attackerIdxAfter].stealthed
    ) {
      const enemySide =
        newPieces[attackerIdxAfter].side === 'white' ? 'black' : 'white';
      if (
        isInProtectionZone(
          newPieces[attackerIdxAfter].row,
          newPieces[attackerIdxAfter].col,
          newPieces,
          enemySide,
          adjacency,
          allNodes,
        )
      ) {
        newPieces[attackerIdxAfter] = {
          ...newPieces[attackerIdxAfter],
          stealthed: false,
        };
      }
    }

    const fromCoord = getNodeCoordinate(
      selectedPiece.row,
      selectedPiece.col,
    );
    const targetCoord = getNodeCoordinate(targetRowGuard, targetColGuard);
    const paladinCoord = getNodeCoordinate(paladinRow, paladinCol);
    const moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${targetCoord} (聖騎士 ${paladinCoord} 守護 ${PIECE_CHINESE[targetPiece.type]})`;

    const nextPlayer: PlayerSide =
      currentPlayer === 'white' ? 'black' : 'white';

    const remainingBurnMarks = updatedBurnMarks.filter(
      (mark) => mark.createdBy !== nextPlayer,
    );
    const remainingHolyLights = holyLights.filter(
      (light) => light.createdBy !== nextPlayer,
    );

    const updatedHolyLights = [
      ...remainingHolyLights,
      {
        row: paladinRow,
        col: paladinCol,
        createdBy: paladin.side,
      },
    ];

    const result = checkWizardWin(newPieces);
    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    const syncState: SyncedState = {
      pieces: newPieces,
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
    // ⚠️ 這裡原本有 if (!canPlay) return; 已移除，守護是防守方反應動作

    const { targetRow, targetCol, targetPieceIndex, attackerPieceIndex } =
      guardRequest;

    let newPieces = [...pieces];
    const selectedPiece = pieces[attackerPieceIndex];
    const targetPiece = pieces[targetPieceIndex];
    let updatedBurnMarks = [...burnMarks];
    let localCaptured = cloneCaptured(capturedPieces);
    let movedAssassinFinal: Piece | null = null;

    const targetIdx = targetPieceIndex;

    if (targetPiece.type !== 'bard') {
      localCaptured = addCaptured(localCaptured, targetPiece);

      newPieces.splice(targetIdx, 1);
      newPieces = activateAllBards(newPieces);
    }

    const adjustedIdx =
      targetPiece.type !== 'bard' && targetIdx < attackerPieceIndex
        ? attackerPieceIndex - 1
        : attackerPieceIndex;

    if (targetPiece.type !== 'bard') {
      if (selectedPiece.type === 'wizard') {
        // 巫師視線攻擊留在原地
      } else if (selectedPiece.type === 'dragon') {
        const path = calculateDragonPath(
          selectedPiece.row,
          selectedPiece.col,
          targetRow,
          targetCol,
          adjacency,
          allNodes,
        );

        if (
          !updatedBurnMarks.some(
            (b) => b.row === selectedPiece.row && b.col === selectedPiece.col,
          )
        ) {
          updatedBurnMarks.push({
            row: selectedPiece.row,
            col: selectedPiece.col,
            createdBy: currentPlayer,
          });
        }

        for (const pathNode of path) {
          if (!(pathNode.row === targetRow && pathNode.col === targetCol)) {
            if (
              !updatedBurnMarks.some(
                (b) => b.row === pathNode.row && b.col === pathNode.col,
              )
            ) {
              updatedBurnMarks.push({
                row: pathNode.row,
                col: pathNode.col,
                createdBy: currentPlayer,
              });
            }
          }
        }

        let movedPiece = updateAssassinStealth(
          { ...selectedPiece, row: targetRow, col: targetCol },
          selectedPiece.row,
          selectedPiece.col,
          targetRow,
          targetCol,
        );
        if (movedPiece.type === 'assassin') {
          movedAssassinFinal = movedPiece;
        }
        newPieces[adjustedIdx] = movedPiece;
      } else {
        let movedPiece = updateAssassinStealth(
          { ...selectedPiece, row: targetRow, col: targetCol },
          selectedPiece.row,
          selectedPiece.col,
          targetRow,
          targetCol,
        );

        if (movedPiece.type === 'assassin') {
          movedPiece = { ...movedPiece, stealthed: false };
          movedAssassinFinal = movedPiece;
        }

        newPieces[adjustedIdx] = movedPiece;
      }
    }

    const fromCoord = getNodeCoordinate(
      selectedPiece.row,
      selectedPiece.col,
    );
    const toCoord = getNodeCoordinate(targetRow, targetCol);
    const moveDesc =
      targetPiece.type === 'bard'
        ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`
        : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;

    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide =
      currentPlayer === 'white' ? 'black' : 'white';

    const remainingBurnMarks = updatedBurnMarks.filter(
      (mark) => mark.createdBy !== nextPlayer,
    );
    const remainingHolyLights = holyLights.filter(
      (light) => light.createdBy !== nextPlayer,
    );

    const syncState: SyncedState = {
      pieces: newPieces,
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

    const { wizardIndex, targetRow, targetCol, targetPieceIndex } =
      wizardAttackRequest;

    const wizard = pieces[wizardIndex];
    const targetPiece = pieces[targetPieceIndex];

    let newPieces = [...pieces];
    let localCaptured = cloneCaptured(capturedPieces);
    let movedAssassinFinal: Piece | null = null; // 巫師不會是刺客，保持 null 即可

    if (targetPiece.type !== 'bard') {
      localCaptured = addCaptured(localCaptured, targetPiece);
      newPieces.splice(targetPieceIndex, 1);
      newPieces = activateAllBards(newPieces);
    }

    const fromCoord = getNodeCoordinate(wizard.row, wizard.col);
    const toCoord = getNodeCoordinate(targetRow, targetCol);

    const moveDesc =
      targetPiece.type === 'bard'
        ? `${PIECE_CHINESE[wizard.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺，導線射擊)`
        : `${PIECE_CHINESE[wizard.type]} ${fromCoord} ⟼ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (導線射擊)`;

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide =
      currentPlayer === 'white' ? 'black' : 'white';

    const remainingBurnMarks = burnMarks.filter(
      (mark) => mark.createdBy !== nextPlayer,
    );
    const remainingHolyLights = holyLights.filter(
      (light) => light.createdBy !== nextPlayer,
    );

    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    const syncState: SyncedState = {
      pieces: newPieces,
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
    };

    applySyncedState(syncState);
    broadcastState(syncState);
    setWizardAttackRequest(null);
  };

  const handleWizardMoveAttack = () => {
    if (!wizardAttackRequest || winner) return;

    const { wizardIndex, targetRow, targetCol, targetPieceIndex } =
      wizardAttackRequest;

    const wizard = pieces[wizardIndex];
    const targetPiece = pieces[targetPieceIndex];

    let newPieces = [...pieces];
    let localCaptured = cloneCaptured(capturedPieces);
    let movedAssassinFinal: Piece | null = null;

    if (targetPiece.type !== 'bard') {
      localCaptured = addCaptured(localCaptured, targetPiece);
      newPieces.splice(targetPieceIndex, 1);
      newPieces = activateAllBards(newPieces);
    }

    // 被 splice 掉之後，巫師的 index 可能往前一格
    const adjustedWizardIndex =
      targetPiece.type !== 'bard' && targetPieceIndex < wizardIndex
        ? wizardIndex - 1
        : wizardIndex;

    const movedWizard: Piece = {
      ...wizard,
      row: targetRow,
      col: targetCol,
    };

    newPieces[adjustedWizardIndex] = movedWizard;

    const fromCoord = getNodeCoordinate(wizard.row, wizard.col);
    const toCoord = getNodeCoordinate(targetRow, targetCol);

    const moveDesc =
      targetPiece.type === 'bard'
        ? `${PIECE_CHINESE[wizard.type]} ${fromCoord} 移動至 ${toCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} (無法擊殺)`
        : `${PIECE_CHINESE[wizard.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (巫師移動)`;

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide =
      currentPlayer === 'white' ? 'black' : 'white';

    const remainingBurnMarks = burnMarks.filter(
      (mark) => mark.createdBy !== nextPlayer,
    );
    const remainingHolyLights = holyLights.filter(
      (light) => light.createdBy !== nextPlayer,
    );

    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    const syncState: SyncedState = {
      pieces: newPieces,
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
    };

    applySyncedState(syncState);
    broadcastState(syncState);
    setWizardAttackRequest(null);
  };

  // ====== 點擊棋盤節點 ======
  const handleNodeClick = (row: number, col: number) => {
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
          swapTarget.type !== 'bard' &&
          swapTarget.type !== 'dragon'
        ) {
          const newPieces = [...pieces];
          const bard = newPieces[bardNeedsSwap.bardIndex];

          newPieces[bardNeedsSwap.bardIndex] = {
            ...bard,
            row: swapTarget.row,
            col: swapTarget.col,
          };
          newPieces[clickedPieceIdx] = {
            ...swapTarget,
            row: bardNeedsSwap.bardRow,
            col: bardNeedsSwap.bardCol,
          };

          const bardCoord = getNodeCoordinate(
            bardNeedsSwap.bardRow,
            bardNeedsSwap.bardCol,
          );
          const swapCoord = getNodeCoordinate(
            swapTarget.row,
            swapTarget.col,
          );
          const moveDesc = `${PIECE_CHINESE['bard']} ${bardCoord} ⇄ ${PIECE_CHINESE[swapTarget.type]} ${swapCoord}`;

          const record = makeMoveRecord(moveDesc, null);
          const newMoveHistory = [record, ...moveHistory];

          const result = checkWizardWin(newPieces);
          const nextPlayer: PlayerSide =
            currentPlayer === 'white' ? 'black' : 'white';

          const remainingBurnMarks = burnMarks.filter(
            (mark) => mark.createdBy !== nextPlayer,
          );
          const remainingHolyLights = holyLights.filter(
            (light) => light.createdBy !== nextPlayer,
          );

          const syncState: SyncedState = {
            pieces: newPieces,
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

        // ⭐ 吟遊詩人：敵方回合時，己方不顯示路徑
        const isOwnBardOutOfTurn =
          !isObserving &&
          localSide !== 'spectator' &&
          piece.type === 'bard' &&
          piece.side === localSide &&
          currentPlayer !== localSide;

        if (isOwnBardOutOfTurn) {
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          return;
        }

        const canShowMoves =
          isObserving ||
          localSide === 'spectator' ||
          piece.side === localSide ||
          piece.side === 'neutral';

        if (canShowMoves) {
          if (allNodes.length > 0) {
            if (piece.type === 'wizard') {
              const moves = calculateWizardMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'apprentice') {
              const moves = calculateApprenticeMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'dragon') {
              const result = calculateDragonMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                burnMarks,
                holyLights,
              );
              setHighlights(result.highlights);
              setDragonPathNodes(result.pathNodes);
              setProtectionZones([]);
            } else if (piece.type === 'ranger') {
              const moves = calculateRangerMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'griffin') {
              const moves = calculateGriffinMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'assassin') {
              const moves = calculateAssassinMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'paladin') {
              const moves = calculatePaladinMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              const zones = calculatePaladinProtectionZone(
                piece,
                effectivePieces,
                adjacency,
                allNodes,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones(zones);

              if (!isObserving) {
                const revealedPieces = revealAssassinsInSpecificZone(
                  pieces,
                  zones,
                  piece.side,
                );
                setPieces(revealedPieces);
              }
            } else if (piece.type === 'bard') {
              const moves = calculateBardMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
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

    const highlight = highlights.find(
      (h) => h.row === row && h.col === col,
    );

    // 觀察模式：只改選取 / 高亮，不做後續動作
    if (!highlight || isObserving) {
      if (clickedPieceIdx !== -1) {
        const piece = effectivePieces[clickedPieceIdx];
        setSelectedPieceIndex(clickedPieceIdx);

        // ⭐ 再次：己方吟遊詩人在敵方回合不顯示路徑
        const isOwnBardOutOfTurn =
          !isObserving &&
          localSide !== 'spectator' &&
          piece.type === 'bard' &&
          piece.side === localSide &&
          currentPlayer !== localSide;

        if (isOwnBardOutOfTurn) {
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          return;
        }

        const canShowMoves =
          isObserving ||
          localSide === 'spectator' ||
          piece.side === localSide ||
          piece.side === 'neutral';

        if (canShowMoves) {
          if (allNodes.length > 0) {
            if (piece.type === 'wizard') {
              const moves = calculateWizardMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'apprentice') {
              const moves = calculateApprenticeMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'dragon') {
              const result = calculateDragonMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                burnMarks,
                holyLights,
              );
              setHighlights(result.highlights);
              setDragonPathNodes(result.pathNodes);
              setProtectionZones([]);
            } else if (piece.type === 'ranger') {
              const moves = calculateRangerMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'griffin') {
              const moves = calculateGriffinMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'assassin') {
              const moves = calculateAssassinMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'paladin') {
              const moves = calculatePaladinMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
              );
              const zones = calculatePaladinProtectionZone(
                piece,
                effectivePieces,
                adjacency,
                allNodes,
              );
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones(zones);
            } else if (piece.type === 'bard') {
              const moves = calculateBardMoves(
                piece,
                clickedPieceIdx,
                effectivePieces,
                adjacency,
                allNodes,
                holyLights,
                burnMarks,
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

    // 🔒 真正移動前，再檢查一次是否可以行動
    if (!canPlay) return;

    // ====== 以下開始「真的改棋盤」 ======
    let newPieces = [...pieces];
    let moveDesc = '';
    const fromCoord = getNodeCoordinate(
      selectedPiece.row,
      selectedPiece.col,
    );
    const toCoord = getNodeCoordinate(row, col);
    let updatedBurnMarks = [...burnMarks];
    let localCaptured = cloneCaptured(capturedPieces);

    // ---- 普通移動 / 吃子 ----
    if (highlight.type === 'move') {
      const actualTargetIdx = getPieceAt(pieces, row, col);

      if (actualTargetIdx !== -1) {
        const targetPiece = pieces[actualTargetIdx];

        // ⭐ 新規則：吟遊詩人可以踩「敵方潛行刺客」並與之交換位置（刺客保持潛行）
        if (
          selectedPiece.type === 'bard' &&
          targetPiece.type === 'assassin' &&
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

          const newAssassin: Piece = {
            ...targetPiece,
            row: selectedPiece.row,
            col: selectedPiece.col,
          };

          newPieces[bardIdx] = newBard;
          newPieces[assassinIdx] = newAssassin;

          moveDesc = `${PIECE_CHINESE['bard']} ${fromCoord} ⇄ 刺客 ${toCoord}`;
        } else if (targetPiece.type === 'bard') {
          // 吟遊詩人不能被吃，這步當作無效
          setSelectedPieceIndex(-1);
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          return;
        } else {
          // 其他情況：正常吃子邏輯
          localCaptured = addCaptured(localCaptured, targetPiece);

          newPieces.splice(actualTargetIdx, 1);
          newPieces = activateAllBards(newPieces);

          const adjustedIdx =
            actualTargetIdx < selectedPieceIndex
              ? selectedPieceIndex - 1
              : selectedPieceIndex;

          let movedPiece = updateAssassinStealth(
            { ...selectedPiece, row, col },
            selectedPiece.row,
            selectedPiece.col,
            row,
            col,
          );

          if (movedPiece.type === 'assassin') {
            movedPiece = { ...movedPiece, stealthed: false };
            movedAssassinFinal = movedPiece;
          }

          newPieces[adjustedIdx] = movedPiece;
          moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
        }
      } else {
        // 落在空格
        let movedPiece = updateAssassinStealth(
          { ...selectedPiece, row, col },
          selectedPiece.row,
          selectedPiece.col,
          row,
          col,
        );

        if (movedPiece.type === 'assassin' && movedPiece.stealthed) {
          const enemySide =
            movedPiece.side === 'white' ? 'black' : 'white';
          if (
            isInProtectionZone(
              row,
              col,
              newPieces,
              enemySide,
              adjacency,
              allNodes,
            )
          ) {
            movedPiece = { ...movedPiece, stealthed: false };
          }
          movedAssassinFinal = movedPiece;
        }

        newPieces[selectedPieceIndex] = movedPiece;
        moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${toCoord}`;
      }

      if (selectedPiece.type === 'dragon') {
        const path = calculateDragonPath(
          selectedPiece.row,
          selectedPiece.col,
          row,
          col,
          adjacency,
          allNodes,
        );

        if (
          !updatedBurnMarks.some(
            (b) => b.row === selectedPiece.row && b.col === selectedPiece.col,
          )
        ) {
          updatedBurnMarks.push({
            row: selectedPiece.row,
            col: selectedPiece.col,
            createdBy: currentPlayer,
          });
        }

        for (const pathNode of path) {
          if (!(pathNode.row === row && pathNode.col === col)) {
            if (
              !updatedBurnMarks.some(
                (b) => b.row === pathNode.row && b.col === pathNode.col,
              )
            ) {
              updatedBurnMarks.push({
                row: pathNode.row,
                col: pathNode.col,
                createdBy: currentPlayer,
              });
            }
          }
        }
      }
    } else if (highlight.type === 'swap') {
      const targetIdx = clickedPieceIdx!;
      const targetPiece = pieces[targetIdx];

      let movedPiece = updateAssassinStealth(
        { ...selectedPiece, row, col },
        selectedPiece.row,
        selectedPiece.col,
        row,
        col,
      );
      let swappedPiece = updateAssassinStealth(
        {
          ...targetPiece,
          row: selectedPiece.row,
          col: selectedPiece.col,
        },
        targetPiece.row,
        targetPiece.col,
        selectedPiece.row,
        selectedPiece.col,
      );

      if (movedPiece.type === 'assassin' && movedPiece.stealthed) {
        const enemySide =
          movedPiece.side === 'white' ? 'black' : 'white';
        if (
          isInProtectionZone(
            row,
            col,
            newPieces,
            enemySide,
            adjacency,
            allNodes,
          )
        ) {
          movedPiece = { ...movedPiece, stealthed: false };
        }
        movedAssassinFinal = movedPiece;
      }

      if (swappedPiece.type === 'assassin' && swappedPiece.stealthed) {
        const enemySide =
          swappedPiece.side === 'white' ? 'black' : 'white';
        if (
          isInProtectionZone(
            selectedPiece.row,
            selectedPiece.col,
            newPieces,
            enemySide,
            adjacency,
            allNodes,
          )
        ) {
          swappedPiece = { ...swappedPiece, stealthed: false };
        }
      }

      newPieces[selectedPieceIndex] = movedPiece;
      newPieces[targetIdx] = swappedPiece;

      if (movedPiece.type === 'paladin') {
        const zones = calculatePaladinProtectionZone(
          movedPiece,
          newPieces,
          adjacency,
          allNodes,
        );
        const revealedPieces = revealAssassinsInSpecificZone(
          newPieces,
          zones,
          movedPiece.side,
        );
        for (let i = 0; i < newPieces.length; i++) {
          newPieces[i] = revealedPieces[i];
        }
      }

      if (swappedPiece.type === 'paladin') {
        const zones = calculatePaladinProtectionZone(
          swappedPiece,
          newPieces,
          adjacency,
          allNodes,
        );
        const revealedPieces = revealAssassinsInSpecificZone(
          newPieces,
          zones,
          swappedPiece.side,
        );
        for (let i = 0; i < newPieces.length; i++) {
          newPieces[i] = revealedPieces[i];
        }
      }

      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⇄ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
    } else if (highlight.type === 'attack') {
      const targetIdx = clickedPieceIdx!;
      const targetPiece = pieces[targetIdx];

      // 🧙‍♂ 巫師：若攻擊的是「相鄰」格，跳出導線 / 移動選擇視窗
      if (selectedPiece.type === 'wizard') {
        // 找出巫師節點與目標節點在 adjacency 裡的 index
        const wizardNodeIdx = allNodes.findIndex(
          (n) => n.row === selectedPiece.row && n.col === selectedPiece.col,
        );
        const targetNodeIdx = allNodes.findIndex(
          (n) => n.row === row && n.col === col,
        );

        const isAdjacent =
          wizardNodeIdx !== -1 &&
          targetNodeIdx !== -1 &&
          adjacency[wizardNodeIdx]?.includes(targetNodeIdx);

        if (isAdjacent) {
          setWizardAttackRequest({
            wizardIndex: selectedPieceIndex,
            targetRow: row,
            targetCol: col,
            targetPieceIndex: targetIdx,
          });

          // 清掉目前選取與高亮，等待玩家在視窗選擇
          setSelectedPieceIndex(-1);
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          return;
        }
      }

      const guardingPaladinIndices =
        targetPiece.side !== 'neutral'
          ? findGuardingPaladins(
              row,
              col,
              pieces,
              targetPiece.side,
              adjacency,
              allNodes,
            )
          : [];

      // === 🔧 修正：只有「被攻擊方的 client」才會開守護視窗並中斷 ===
      if (guardingPaladinIndices.length > 0) {
        if (localSide === targetPiece.side && !isObserving) {
          const options: GuardOption[] = guardingPaladinIndices.map(
            (idx) => ({
              paladinIndex: idx,
              paladinRow: pieces[idx].row,
              paladinCol: pieces[idx].col,
              coordinate: getNodeCoordinate(
                pieces[idx].row,
                pieces[idx].col,
              ),
            }),
          );

          setGuardOptions(options);
          setGuardRequest({
            targetRow: row,
            targetCol: col,
            targetPieceIndex: targetIdx,
            attackerPieceIndex: selectedPieceIndex,
            defenderSide: targetPiece.side as PlayerSide,
          });
          setSelectedGuardPaladinIndex(null);
          setGuardDialogOpen(true);

          // 被攻擊方這台機器 → 等使用者按下守護 / 不守護
          return;
        }
        // 其他 client（攻擊方 / 觀戰）→ 視為「沒選守護」，直接走下面的正常攻擊邏輯
      }

      if (targetPiece.type !== 'bard') {
        localCaptured = addCaptured(localCaptured, targetPiece);

        newPieces.splice(targetIdx, 1);
        newPieces = activateAllBards(newPieces);
      }

      const adjustedIdx =
        targetPiece.type !== 'bard' && targetIdx < selectedPieceIndex
          ? selectedPieceIndex - 1
          : selectedPieceIndex;

      if (targetPiece.type !== 'bard') {
        if (selectedPiece.type === 'wizard') {
          // 巫師視線攻擊不動
        } else if (selectedPiece.type === 'dragon') {
          const path = calculateDragonPath(
            selectedPiece.row,
            selectedPiece.col,
            row,
            col,
            adjacency,
            allNodes,
          );

          if (
            !updatedBurnMarks.some(
              (b) =>
                b.row === selectedPiece.row &&
                b.col === selectedPiece.col,
            )
          ) {
            updatedBurnMarks.push({
              row: selectedPiece.row,
              col: selectedPiece.col,
              createdBy: currentPlayer,
            });
          }

          for (const pathNode of path) {
            if (!(pathNode.row === row && pathNode.col === col)) {
              if (
                !updatedBurnMarks.some(
                  (b) =>
                    b.row === pathNode.row &&
                    b.col === pathNode.col,
                )
              ) {
                updatedBurnMarks.push({
                  row: pathNode.row,
                  col: pathNode.col,
                  createdBy: currentPlayer,
                });
              }
            }
          }

          let movedPiece = updateAssassinStealth(
            { ...selectedPiece, row, col },
            selectedPiece.row,
            selectedPiece.col,
            row,
            col,
          );
          if (movedPiece.type === 'assassin') {
            movedAssassinFinal = movedPiece;
          }
          newPieces[adjustedIdx] = movedPiece;
        } else {
          let movedPiece = updateAssassinStealth(
            { ...selectedPiece, row, col },
            selectedPiece.row,
            selectedPiece.col,
            row,
            col,
          );

          if (movedPiece.type === 'assassin') {
            movedPiece = { ...movedPiece, stealthed: false };
            movedAssassinFinal = movedPiece;
          }

          newPieces[adjustedIdx] = movedPiece;
        }
      }

      moveDesc =
        targetPiece.type === 'bard'
          ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`
          : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
    }

    // 若移動的是聖騎士，重新顯形範圍內刺客
    if (selectedPiece.type === 'paladin') {
      const movedPaladin =
        newPieces[
          highlight.type === 'attack' &&
          clickedPieceIdx! < selectedPieceIndex
            ? selectedPieceIndex - 1
            : selectedPieceIndex
        ];

      if (movedPaladin) {
        const zones = calculatePaladinProtectionZone(
          movedPaladin,
          newPieces,
          adjacency,
          allNodes,
        );
        const revealedPieces = revealAssassinsInSpecificZone(
          newPieces,
          zones,
          movedPaladin.side,
        );

        for (let i = 0; i < newPieces.length; i++) {
          newPieces[i] = revealedPieces[i];
        }
      }
    }

    // 吟遊詩人普通移動 → 啟動「必須換位」流程
    if (selectedPiece.type === 'bard' && highlight.type === 'move') {
      const bardNewIdx = selectedPieceIndex;
      const movedBard = newPieces[bardNewIdx];

      if (movedBard) {
        setPieces(newPieces);
        setCapturedPieces(localCaptured);
        setBardNeedsSwap({
          bardIndex: bardNewIdx,
          bardRow: movedBard.row,
          bardCol: movedBard.col,
        });

        const swapHighlights: MoveHighlight[] = newPieces
          .map((p, idx) => ({ piece: p, idx }))
          .filter(
            ({ piece }) =>
              piece.side === currentPlayer &&
              piece.type !== 'bard' &&
              piece.type !== 'dragon',
          )
          .map(({ piece }) => ({
            type: 'swap' as const,
            row: piece.row,
            col: piece.col,
          }));

        setHighlights(swapHighlights);
        setDragonPathNodes([]);
        setProtectionZones([]);
        return;
      }
    }

    const result = checkWizardWin(newPieces);
    const nextPlayer: PlayerSide =
      currentPlayer === 'white' ? 'black' : 'white';

    const record = makeMoveRecord(moveDesc, movedAssassinFinal);
    const newMoveHistory = [record, ...moveHistory];

    const remainingBurnMarks = updatedBurnMarks.filter(
      (mark) => mark.createdBy !== nextPlayer,
    );
    const remainingHolyLights = holyLights.filter(
      (light) => light.createdBy !== nextPlayer,
    );

    const syncState: SyncedState = {
      pieces: newPieces,
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
        } as SyncedState);

  const displayPieces: Piece[] = isObserving
    ? boardState.pieces.map((p) =>
        p.type === 'assassin' ? { ...p, stealthed: false } : p,
      )
    : boardState.pieces;

  const effectivePiecesForPanel = boardState.pieces;

  const selectedPiece =
    selectedPieceIndex !== -1
      ? effectivePiecesForPanel[selectedPieceIndex]
      : null;

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
    if (snapshotIndex >= snapshots.length) {
      snapshotIndex = snapshots.length - 1;
    }

    const movedIndices = findMovedPieceIndicesForSnapshot(snapshotIndex);

    setViewSnapshotIndex(snapshotIndex);
    setSelectedPieceIndex(movedIndices.length > 0 ? movedIndices[0] : -1);
    setHighlights([]);
    setDragonPathNodes([]);
    setProtectionZones([]);
  };

  // ---- 準備階段 ready 顯示 ----
  const myReady =
    localSide === 'white'
      ? ready.white
      : localSide === 'black'
      ? ready.black
      : false;
  const otherReady =
    localSide === 'white'
      ? ready.black
      : localSide === 'black'
      ? ready.white
      : false;

  // ---- 移動紀錄顯示文字（視角） ----
  const baseHistory =
    snapshots.length > 0
      ? snapshots[snapshots.length - 1].moveHistory
      : moveHistory;

  let displayHistory: string[] = [];
  if (baseHistory) {
    if (isObserving || localSide === 'spectator') {
      displayHistory = baseHistory.map((r) => r.fullText);
    } else if (localSide === 'white') {
      displayHistory = baseHistory.map((r) => r.whiteText);
    } else if (localSide === 'black') {
      displayHistory = baseHistory.map((r) => r.blackText);
    }
  }

  // ================== UI ==================

  // -------------- 未進房：輸入房間密碼 --------------
  if (!inRoom) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-700 rounded-2xl p-6 shadow-xl">
          <h1 className="text-2xl font-bold text-center mb-2 text-slate-100">
            巫師棋 Wizard Chess
          </h1>
          <p className="text-xs text-slate-400 text-center mb-6">
            請輸入本局的密碼（必填）。<br />
            之後其他玩家輸入相同密碼即可加入同一局。
          </p>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="room-password"
                className="block text-sm text-slate-300 mb-1"
              >
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

            {roomError && (
              <div className="text-red-400 text-xs mt-2">{roomError}</div>
            )}

            <div className="text-[11px] text-slate-500 text-center mt-4">
              WebSocket 狀態：
              {socketStatus === 'connecting' && '連線中...'}
              {socketStatus === 'connected' && '已連線'}
              {socketStatus === 'disconnected' && '未連線'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------- 已進房但尚未開始：準備階段畫面 --------------
  if (inRoom && !gameStarted) {
    const startingText =
      startingMode === 'random'
        ? '隨機'
        : startingPlayer === 'white'
        ? '白方先攻'
        : '黑方先攻';

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-lg bg-slate-900/80 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-6">
          <h1 className="text-2xl font-bold text-center text-slate-100">
            巫師棋 Wizard Chess
          </h1>
          <p className="text-lg text-slate-300 text-center font-medium">
            準備階段：請先選擇白方、黑方或觀戰，並設定這局的先後攻。
            白方與黑方都按下「開始遊戲」後，對局才會正式開始。
          </p>

          {/* 座位選擇 */}
          <div>
            <div className="text-sm text-slate-200 mb-2 text-center">
              座位選擇
            </div>
            <div className="flex justify-center items-center gap-4 mb-2 text-sm text-slate-300">
              <button
                className={`px-3 py-1 rounded-full border ${
                  localSide === 'white'
                    ? 'bg-slate-100 text-slate-900 border-slate-100'
                    : 'border-slate-500 hover:border-slate-300'
                }`}
                onClick={() => handleChooseSide('white')}
              >
                白方
              </button>
              <button
                className={`px-3 py-1 rounded-full border ${
                  localSide === 'black'
                    ? 'bg-slate-100 text-slate-900 border-slate-100'
                    : 'border-slate-500 hover:border-slate-300'
                }`}
                onClick={() => handleChooseSide('black')}
              >
                黑方
              </button>
              <button
                className={`px-3 py-1 rounded-full border ${
                  localSide === 'spectator'
                    ? 'bg-slate-100 text-slate-900 border-slate-100'
                    : 'border-slate-500 hover:border-slate-300'
                }`}
                onClick={() => handleChooseSide('spectator')}
              >
                觀戰
              </button>
            </div>
            <div className="text-[11px] text-slate-400 text-center">
              白方：{seats.whiteOwnerId ? '有人就座' : '空位'} ｜ 黑方：
              {seats.blackOwnerId ? '有人就座' : '空位'}
            </div>
            {seatError && (
              <div className="text-xs text-red-400 mt-1 text-center">
                {seatError}
              </div>
            )}
          </div>

          {/* 先後攻設定 */}
          <div>
            <div className="text-sm text-slate-200 mb-2 text-center">
              先後攻設定
            </div>
            <div className="text-xs text-slate-400 text-center mb-2">
              目前設定：{' '}
              <span className="text-emerald-300">{startingText}</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={handleToggleStartingPlayer}
                className="px-3 py-1 rounded-lg border border-slate-600 bg-slate-950 text-xs text-slate-100 hover:border-emerald-400 hover:text-emerald-300"
              >
                自訂先後攻：{' '}
                {startingPlayer === 'white' ? '白方先攻' : '黑方先攻'}
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
            <div className="text-sm text-slate-200 mb-2 text-center">
              準備狀態
            </div>
            {localSide === 'spectator' ? (
              <div className="text-xs text-slate-400 text-center">
                目前為觀戰模式，無需準備。<br />
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
                        ? 'bg-slate-700 text-slate-300 cursor-default'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    }`}
                  >
                    {myReady ? '已準備完成' : '開始遊戲'}
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-slate-400 text-center">
                  白方：{ready.white ? '已準備' : '未準備'} ｜ 黑方：
                  {ready.black ? '已準備' : '未準備'}
                </div>
                <div className="mt-1 text-[11px] text-amber-300 text-center">
                  {myReady && !otherReady && '你已準備完成，正在等待另一位玩家…'}
                  {!myReady &&
                    otherReady &&
                    '另一位玩家已準備完成，請按「開始遊戲」開始對局。'}
                  {myReady &&
                    otherReady &&
                    '雙方已準備完成，對局即將開始。'}
                </div>
              </>
            )}
          </div>

          <div className="text-[11px] text-slate-500 text-center">
            WebSocket 狀態：
            {socketStatus === 'connecting' && '連線中...'}
            {socketStatus === 'connected' && '已連線'}
            {socketStatus === 'disconnected' && '未連線'}
          </div>
        </div>
      </div>
    );
  }

  // -------------- 已進房且遊戲已開始：棋盤畫面 --------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        <h1
          className="text-3xl font-bold text-center mb-4 text-slate-100"
          data-testid="text-title"
        >
          巫師棋 Wizard Chess
        </h1>

        {/* Debug 資訊 */}
        <div
          className="text-xs text-center mb-2 text-slate-400 font-mono"
          data-testid="text-debug"
        >
          選中: {selectedPieceIndex >= 0 ? `#${selectedPieceIndex}` : '無'} |
          高亮: {highlights.length} | 玩家: {boardState.currentPlayer} | 守護區:{' '}
          {protectionZones.length}
          {protectionZones.length > 0 && (
            <span className="ml-2">
              [
              {protectionZones
                .map((z) => `${getNodeCoordinate(z.row, z.col)}`)
                .join(', ')}
              ]
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6 items-start">
          {/* 左邊：被吃掉的棋子（上） + 棋子資訊（下） */}
          <div className="order-2 lg:order-1 flex flex-col gap-4">
            <CapturedPiecesPanel capturedPieces={boardState.capturedPieces} />
            <PieceInfoPanel piece={selectedPiece || null} />
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
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-xs text中心 shadow-2xl">
            <div className="text-lg font-bold text-slate-100 mb-1">
              {winner === 'white' ? '白方勝利' : '黑方勝利'}
            </div>
            <div className="text-xs text-slate-400 mb-4">
              巫師被擊倒，遊戲結束。
            </div>
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

      {/* 聖騎士守護視窗（只有被攻擊方、且 guardRequest 存在時顯示） */}
      <GuardDialog
        isOpen={guardDialogOpen && !!guardRequest && localSide === guardRequest?.defenderSide}
        guardOptions={guardOptions}
        targetCoordinate={
          guardRequest
            ? getNodeCoordinate(guardRequest.targetRow, guardRequest.targetCol)
            : ''
        }
        selectedPaladinIndex={selectedGuardPaladinIndex}
        onChangeSelectedPaladin={handleChangeSelectedGuardPaladin}
        onConfirmGuard={handleGuardConfirm}
        onDecline={handleGuardDecline}
      />

      {/* 巫師攻擊方式選擇視窗 */}
      <WizardAttackDialog
        isOpen={!!wizardAttackRequest}
        targetCoordinate={
          wizardAttackRequest
            ? getNodeCoordinate(
                wizardAttackRequest.targetRow,
                wizardAttackRequest.targetCol,
              )
            : ''
        }
        onLineShot={handleWizardLineShot}
        onMoveAttack={handleWizardMoveAttack}
      />
    </div>
  );
}
