import { useState, useEffect } from 'react';
import type { Piece, Side, MoveHighlight, NodePosition } from '@shared/schema';
import GameBoard from '@/components/GameBoard';
import PieceInfoPanel from '@/components/PieceInfoPanel';
import TurnHistoryPanel from '@/components/TurnHistoryPanel';
import {
  getInitialPieces,
  getPieceAt,
  calculateWizardMoves,
  buildRows,
  buildAllNodes,
  buildAdjacency,
  PIECE_CHINESE,
} from '@/lib/gameLogic';

export default function Game() {
  const [pieces, setPieces] = useState<Piece[]>(getInitialPieces());
  const [currentPlayer, setCurrentPlayer] = useState<'white' | 'black'>('white');
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number>(-1);
  const [highlights, setHighlights] = useState<MoveHighlight[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [allNodes, setAllNodes] = useState<NodePosition[]>([]);
  const [adjacency, setAdjacency] = useState<number[][]>([]);

  useEffect(() => {
    const rows = buildRows(700, 700);
    const nodes = buildAllNodes(rows);
    const adj = buildAdjacency(rows);
    setAllNodes(nodes);
    setAdjacency(adj);
  }, []);

  const handleNodeClick = (row: number, col: number) => {
    console.log('Node clicked:', row, col);

    const clickedPieceIdx = getPieceAt(pieces, row, col);

    // If no piece selected, try to select a piece
    if (selectedPieceIndex === -1) {
      if (clickedPieceIdx !== -1) {
        const piece = pieces[clickedPieceIdx];
        if (piece.side === currentPlayer) {
          setSelectedPieceIndex(clickedPieceIdx);
          
          // Calculate moves for wizard only (others not fully implemented)
          if (piece.type === 'wizard' && allNodes.length > 0) {
            const moves = calculateWizardMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
            setHighlights(moves);
          } else {
            setHighlights([]);
          }
        }
      }
      return;
    }

    // If piece selected, try to move or deselect
    const selectedPiece = pieces[selectedPieceIndex];

    // Clicking same piece deselects
    if (clickedPieceIdx === selectedPieceIndex) {
      setSelectedPieceIndex(-1);
      setHighlights([]);
      return;
    }

    // Check if this is a valid move
    const highlight = highlights.find((h) => h.row === row && h.col === col);
    if (!highlight) {
      // Try selecting a different piece
      if (clickedPieceIdx !== -1) {
        const piece = pieces[clickedPieceIdx];
        if (piece.side === currentPlayer) {
          setSelectedPieceIndex(clickedPieceIdx);
          
          if (piece.type === 'wizard' && allNodes.length > 0) {
            const moves = calculateWizardMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
            setHighlights(moves);
          } else {
            setHighlights([]);
          }
        }
      }
      return;
    }

    // Execute the move
    const newPieces = [...pieces];
    let moveDesc = '';

    if (highlight.type === 'move') {
      newPieces[selectedPieceIndex] = { ...selectedPiece, row, col };
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} 移動至 (${row},${col})`;
    } else if (highlight.type === 'swap') {
      const targetIdx = clickedPieceIdx;
      const targetPiece = pieces[targetIdx];
      newPieces[selectedPieceIndex] = { ...selectedPiece, row, col };
      newPieces[targetIdx] = {
        ...targetPiece,
        row: selectedPiece.row,
        col: selectedPiece.col,
      };
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} 與 ${PIECE_CHINESE[targetPiece.type]} 換位`;
    } else if (highlight.type === 'attack') {
      const targetIdx = clickedPieceIdx;
      const targetPiece = pieces[targetIdx];
      newPieces.splice(targetIdx, 1);
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} 導線攻擊 ${PIECE_CHINESE[targetPiece.type]} (${row},${col})`;
    }

    setPieces(newPieces);
    setMoveHistory([...moveHistory, moveDesc]);
    setSelectedPieceIndex(-1);
    setHighlights([]);
    setCurrentPlayer(currentPlayer === 'white' ? 'black' : 'white');
  };

  const selectedPiece = selectedPieceIndex !== -1 ? pieces[selectedPieceIndex] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-slate-100" data-testid="text-title">
          巫師棋盤 Wizard Chess Board
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6 items-start">
          <div className="order-2 lg:order-1">
            <PieceInfoPanel piece={selectedPiece} />
          </div>

          <div className="order-1 lg:order-2 flex justify-center">
            <GameBoard
              pieces={pieces}
              selectedPieceIndex={selectedPieceIndex}
              highlights={highlights}
              currentPlayer={currentPlayer}
              onNodeClick={handleNodeClick}
            />
          </div>

          <div className="order-3">
            <TurnHistoryPanel currentPlayer={currentPlayer} moveHistory={moveHistory} />
          </div>
        </div>
      </div>
    </div>
  );
}
