import { useState, useEffect, useCallback } from 'react';
import type { Piece, Side, MoveHighlight, NodePosition, BurnMark } from '@shared/schema';
import GameBoard from '@/components/GameBoard';
import PieceInfoPanel from '@/components/PieceInfoPanel';
import TurnHistoryPanel from '@/components/TurnHistoryPanel';
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
  buildRows,
  buildAllNodes,
  buildAdjacency,
  getNodeCoordinate,
  isBlackTriangle,
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
  const [burnMarks, setBurnMarks] = useState<BurnMark[]>([]);
  const [dragonPathNodes, setDragonPathNodes] = useState<{ row: number; col: number }[]>([]);

  useEffect(() => {
    const rows = buildRows(700, 700);
    const nodes = buildAllNodes(rows);
    const adj = buildAdjacency(rows);
    setAllNodes(nodes);
    setAdjacency(adj);
  }, []);

  const handleNodeClick = (row: number, col: number) => {
    const clickedPieceIdx = getPieceAt(pieces, row, col);

    // If no piece selected, try to select a piece
    if (selectedPieceIndex === -1) {
      if (clickedPieceIdx !== -1) {
        const piece = pieces[clickedPieceIdx];
        if (piece.side === currentPlayer) {
          setSelectedPieceIndex(clickedPieceIdx);
          
          // Calculate moves based on piece type
          if (allNodes.length > 0) {
            if (piece.type === 'wizard') {
              const moves = calculateWizardMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else if (piece.type === 'apprentice') {
              const moves = calculateApprenticeMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else if (piece.type === 'dragon') {
              const result = calculateDragonMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, burnMarks);
              setHighlights(result.highlights);
              setDragonPathNodes(result.pathNodes);
            } else if (piece.type === 'ranger') {
              const moves = calculateRangerMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else if (piece.type === 'griffin') {
              const moves = calculateGriffinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else if (piece.type === 'assassin') {
              const moves = calculateAssassinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else {
              setHighlights([]);
              setDragonPathNodes([]);
            }
          } else {
            setHighlights([]);
            setDragonPathNodes([]);
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
      setDragonPathNodes([]);
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
          
          // Calculate moves based on piece type
          if (allNodes.length > 0) {
            if (piece.type === 'wizard') {
              const moves = calculateWizardMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else if (piece.type === 'apprentice') {
              const moves = calculateApprenticeMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else if (piece.type === 'dragon') {
              const result = calculateDragonMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, burnMarks);
              setHighlights(result.highlights);
              setDragonPathNodes(result.pathNodes);
            } else if (piece.type === 'ranger') {
              const moves = calculateRangerMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else if (piece.type === 'griffin') {
              const moves = calculateGriffinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else if (piece.type === 'assassin') {
              const moves = calculateAssassinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
            } else {
              setHighlights([]);
              setDragonPathNodes([]);
            }
          } else {
            setHighlights([]);
            setDragonPathNodes([]);
          }
        }
      }
      return;
    }

    // Execute the move
    const newPieces = [...pieces];
    let moveDesc = '';
    const fromCoord = getNodeCoordinate(selectedPiece.row, selectedPiece.col);
    const toCoord = getNodeCoordinate(row, col);
    let updatedBurnMarks = [...burnMarks];

    if (highlight.type === 'move') {
      newPieces[selectedPieceIndex] = { ...selectedPiece, row, col };
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${toCoord}`;
      
      // If dragon moves, add burn marks to the path (including starting point, excluding destination)
      if (selectedPiece.type === 'dragon') {
        // Calculate the actual path from start to destination
        const path = calculateDragonPath(
          selectedPiece.row,
          selectedPiece.col,
          row,
          col,
          adjacency,
          allNodes
        );
        
        // Add burn mark for the starting position
        if (!updatedBurnMarks.some(b => b.row === selectedPiece.row && b.col === selectedPiece.col)) {
          updatedBurnMarks.push({ 
            row: selectedPiece.row, 
            col: selectedPiece.col,
            createdBy: currentPlayer 
          });
        }
        
        // Add burn marks for all nodes in the path except the destination
        for (const pathNode of path) {
          if (!(pathNode.row === row && pathNode.col === col)) {
            // Check if not already a burn mark
            if (!updatedBurnMarks.some(b => b.row === pathNode.row && b.col === pathNode.col)) {
              updatedBurnMarks.push({ 
                row: pathNode.row, 
                col: pathNode.col,
                createdBy: currentPlayer 
              });
            }
          }
        }
      }
    } else if (highlight.type === 'swap') {
      const targetIdx = clickedPieceIdx;
      const targetPiece = pieces[targetIdx];
      newPieces[selectedPieceIndex] = { ...selectedPiece, row, col };
      newPieces[targetIdx] = {
        ...targetPiece,
        row: selectedPiece.row,
        col: selectedPiece.col,
      };
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⇄ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
    } else if (highlight.type === 'attack') {
      const targetIdx = clickedPieceIdx;
      const targetPiece = pieces[targetIdx];
      
      // Remove the attacked piece first
      newPieces.splice(targetIdx, 1);
      
      // Adjust selectedPieceIndex if needed (if target was before selected piece)
      const adjustedIdx = targetIdx < selectedPieceIndex ? selectedPieceIndex - 1 : selectedPieceIndex;
      
      // Move the attacking piece to the target position
      newPieces[adjustedIdx] = { ...selectedPiece, row, col };
      
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
    }

    setPieces(newPieces);
    setMoveHistory([...moveHistory, moveDesc]);
    setSelectedPieceIndex(-1);
    setHighlights([]);
    setDragonPathNodes([]);
    
    // Switch to next player
    const nextPlayer = currentPlayer === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    
    // Clean up burn marks created by the next player
    // (They last until the enemy's turn ends, which is when we switch back)
    const remainingBurnMarks = updatedBurnMarks.filter(mark => mark.createdBy !== nextPlayer);
    setBurnMarks(remainingBurnMarks);
  };

  const selectedPiece = selectedPieceIndex !== -1 ? pieces[selectedPieceIndex] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-slate-100" data-testid="text-title">
          巫師棋盤 Wizard Chess Board
        </h1>

        {/* Debug info */}
        <div className="text-xs text-center mb-2 text-slate-400 font-mono" data-testid="text-debug">
          選中: {selectedPieceIndex >= 0 ? `#${selectedPieceIndex}` : '無'} | 高亮: {highlights.length} | 玩家: {currentPlayer}
        </div>

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
              burnMarks={burnMarks}
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
