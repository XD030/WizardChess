import { useState, useEffect, useCallback } from 'react';
import type { Piece, Side, MoveHighlight, NodePosition, BurnMark, HolyLight, GuardOption } from '@shared/schema';
import GameBoard from '@/components/GameBoard';
import PieceInfoPanel from '@/components/PieceInfoPanel';
import TurnHistoryPanel from '@/components/TurnHistoryPanel';
import GuardDialog from '@/components/GuardDialog';
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
} from '@/lib/gameLogic';

// Helper function to activate all bards on the board
function activateAllBards(pieces: Piece[]): Piece[] {
  return pieces.map(piece => 
    piece.type === 'bard' 
      ? { ...piece, activated: true }
      : piece
  );
}

export default function Game() {
  const [pieces, setPieces] = useState<Piece[]>(getInitialPieces());
  const [currentPlayer, setCurrentPlayer] = useState<'white' | 'black'>('white');
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number>(-1);
  const [highlights, setHighlights] = useState<MoveHighlight[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [allNodes, setAllNodes] = useState<NodePosition[]>([]);
  const [adjacency, setAdjacency] = useState<number[][]>([]);
  const [burnMarks, setBurnMarks] = useState<BurnMark[]>([]);
  const [holyLights, setHolyLights] = useState<HolyLight[]>([]);
  const [dragonPathNodes, setDragonPathNodes] = useState<{ row: number; col: number }[]>([]);
  const [protectionZones, setProtectionZones] = useState<{ row: number; col: number }[]>([]);
  const [guardDialogOpen, setGuardDialogOpen] = useState(false);
  const [guardOptions, setGuardOptions] = useState<GuardOption[]>([]);
  const [pendingAttack, setPendingAttack] = useState<{
    targetRow: number;
    targetCol: number;
    targetPieceIndex: number;
  } | null>(null);
  const [bardNeedsSwap, setBardNeedsSwap] = useState<{
    bardIndex: number;
    bardRow: number;
    bardCol: number;
  } | null>(null);

  useEffect(() => {
    const rows = buildRows(700, 700);
    const nodes = buildAllNodes(rows);
    const adj = buildAdjacency(rows);
    setAllNodes(nodes);
    setAdjacency(adj);
  }, []);

  const handleGuardSelect = (paladinIndex: number) => {
    if (!pendingAttack || selectedPieceIndex === -1) return;
    
    // Validate that all indices are still valid
    if (selectedPieceIndex >= pieces.length || 
        pendingAttack.targetPieceIndex >= pieces.length || 
        paladinIndex >= pieces.length) {
      console.error('Invalid piece indices in guard select');
      return;
    }
    
    const selectedPiece = pieces[selectedPieceIndex];
    const targetPiece = pieces[pendingAttack.targetPieceIndex];
    const paladin = pieces[paladinIndex];
    
    // Additional validation: verify pieces exist and coordinates match
    if (!selectedPiece || !targetPiece || !paladin) {
      console.error('Pieces not found at specified indices');
      return;
    }
    if (targetPiece.row !== pendingAttack.targetRow || targetPiece.col !== pendingAttack.targetCol) {
      console.error('Target piece has moved since attack was initiated');
      return;
    }
    
    // Save positions before modifications
    const targetRow = pendingAttack.targetRow;
    const targetCol = pendingAttack.targetCol;
    const paladinRow = paladin.row;
    const paladinCol = paladin.col;
    
    // Calculate the protection zone of the paladin BEFORE making any changes
    const paladinProtectionZone = calculatePaladinProtectionZone(paladin, pieces, adjacency, allNodes);
    
    // Create moved target piece at paladin's position
    let movedTarget = updateAssassinStealth(
      { ...targetPiece, row: paladinRow, col: paladinCol },
      targetPiece.row,
      targetPiece.col,
      paladinRow,
      paladinCol
    );
    
    // Check if target is a stealthed assassin entering the paladin's protection zone
    if (movedTarget.type === 'assassin' && movedTarget.stealthed) {
      const inPaladinZone = paladinProtectionZone.some(z => z.row === movedTarget.row && z.col === movedTarget.col);
      if (inPaladinZone) {
        movedTarget = { ...movedTarget, stealthed: false };
      }
    }
    
    // Create moved attacker piece at target's original position
    let movedAttacker = updateAssassinStealth(
      { ...selectedPiece, row: targetRow, col: targetCol },
      selectedPiece.row,
      selectedPiece.col,
      targetRow,
      targetCol
    );
    
    // Check if attacker is a stealthed assassin entering protection zones
    if (movedAttacker.type === 'assassin' && movedAttacker.stealthed) {
      const inPaladinZone = paladinProtectionZone.some(z => z.row === targetRow && z.col === targetCol);
      if (inPaladinZone) {
        movedAttacker = { ...movedAttacker, stealthed: false };
      }
    }
    
    // Build new pieces array: exclude paladin, attacker, and target; add moved versions
    let newPieces = pieces
      .filter((_, idx) => idx !== paladinIndex && idx !== selectedPieceIndex && idx !== pendingAttack.targetPieceIndex)
      .concat([movedTarget, movedAttacker]);
    
    // Activate all bards when paladin is captured
    newPieces = activateAllBards(newPieces);
    
    // Now check moved pieces against other remaining paladins (now in newPieces)
    const targetIdx = newPieces.findIndex(p => p.row === movedTarget.row && p.col === movedTarget.col);
    const attackerIdx = newPieces.findIndex(p => p.row === movedAttacker.row && p.col === movedAttacker.col);
    
    if (newPieces[targetIdx].type === 'assassin' && newPieces[targetIdx].stealthed) {
      const enemySide = newPieces[targetIdx].side === 'white' ? 'black' : 'white';
      if (isInProtectionZone(newPieces[targetIdx].row, newPieces[targetIdx].col, newPieces, enemySide, adjacency, allNodes)) {
        newPieces[targetIdx] = { ...newPieces[targetIdx], stealthed: false };
      }
    }
    
    if (newPieces[attackerIdx].type === 'assassin' && newPieces[attackerIdx].stealthed) {
      const enemySide = newPieces[attackerIdx].side === 'white' ? 'black' : 'white';
      if (isInProtectionZone(newPieces[attackerIdx].row, newPieces[attackerIdx].col, newPieces, enemySide, adjacency, allNodes)) {
        newPieces[attackerIdx] = { ...newPieces[attackerIdx], stealthed: false };
      }
    }
    
    // Update history
    const fromCoord = getNodeCoordinate(selectedPiece.row, selectedPiece.col);
    const targetCoord = getNodeCoordinate(targetRow, targetCol);
    const paladinCoord = getNodeCoordinate(paladinRow, paladinCol);
    const moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${targetCoord} (聖騎士 ${paladinCoord} 守護 ${PIECE_CHINESE[targetPiece.type]})`;
    
    // Switch to next player
    const nextPlayer = currentPlayer === 'white' ? 'black' : 'white';
    
    // Clean up old burn marks and holy lights created by the next player
    const remainingBurnMarks = burnMarks.filter(mark => mark.createdBy !== nextPlayer);
    const remainingHolyLights = holyLights.filter(light => light.createdBy !== nextPlayer);
    
    // Add holy light at paladin's ORIGINAL position (where it died)
    const updatedHolyLights = [...remainingHolyLights, {
      row: paladinRow,
      col: paladinCol,
      createdBy: paladin.side,
    }];
    
    setPieces(newPieces);
    setHolyLights(updatedHolyLights);
    setMoveHistory([...moveHistory, moveDesc]);
    setSelectedPieceIndex(-1);
    setHighlights([]);
    setDragonPathNodes([]);
    setProtectionZones([]);
    setGuardDialogOpen(false);
    setPendingAttack(null);
    setCurrentPlayer(nextPlayer);
    setBurnMarks(remainingBurnMarks);
  };

  const handleGuardDecline = () => {
    if (!pendingAttack || selectedPieceIndex === -1) return;
    
    let newPieces = [...pieces];
    const selectedPiece = pieces[selectedPieceIndex];
    const targetPiece = pieces[pendingAttack.targetPieceIndex];
    
    // Execute normal attack
    const targetRow = pendingAttack.targetRow;
    const targetCol = pendingAttack.targetCol;
    const targetIdx = pendingAttack.targetPieceIndex;
    
    // Remove the attacked piece first (unless it's a bard - bards cannot be killed)
    if (targetPiece.type !== 'bard') {
      newPieces.splice(targetIdx, 1);
      
      // Activate all bards when any piece is captured
      newPieces = activateAllBards(newPieces);
    }
    
    // Adjust selectedPieceIndex if needed (if target was before selected piece and was actually removed)
    const adjustedIdx = (targetPiece.type !== 'bard' && targetIdx < selectedPieceIndex) 
      ? selectedPieceIndex - 1 
      : selectedPieceIndex;
    
    // Move the attacking piece to the target position and update stealth (only if target wasn't a bard)
    if (targetPiece.type !== 'bard') {
      let movedPiece = updateAssassinStealth(
        { ...selectedPiece, row: targetRow, col: targetCol },
        selectedPiece.row,
        selectedPiece.col,
        targetRow,
        targetCol
      );
      
      // If the attacking piece is an assassin, it reveals itself after killing
      if (movedPiece.type === 'assassin') {
        movedPiece = { ...movedPiece, stealthed: false };
      }
      
      newPieces[adjustedIdx] = movedPiece;
    }
    
    const fromCoord = getNodeCoordinate(selectedPiece.row, selectedPiece.col);
    const toCoord = getNodeCoordinate(targetRow, targetCol);
    const moveDesc = targetPiece.type === 'bard'
      ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`
      : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
    
    setPieces(newPieces);
    setMoveHistory([...moveHistory, moveDesc]);
    setSelectedPieceIndex(-1);
    setHighlights([]);
    setDragonPathNodes([]);
    setProtectionZones([]);
    setGuardDialogOpen(false);
    setPendingAttack(null);
    
    // Switch to next player
    const nextPlayer = currentPlayer === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    
    // Clean up burn marks and holy lights created by the next player
    const remainingBurnMarks = burnMarks.filter(mark => mark.createdBy !== nextPlayer);
    const remainingHolyLights = holyLights.filter(light => light.createdBy !== nextPlayer);
    setBurnMarks(remainingBurnMarks);
    setHolyLights(remainingHolyLights);
  };

  const handleNodeClick = (row: number, col: number) => {
    const clickedPieceIdx = getPieceAt(pieces, row, col);

    // If bard needs swap, handle the swap
    if (bardNeedsSwap) {
      if (clickedPieceIdx !== -1) {
        const swapTarget = pieces[clickedPieceIdx];
        
        // Check if this is a valid swap target (friendly piece, not bard, not dragon)
        if (swapTarget.side === currentPlayer && 
            swapTarget.type !== 'bard' && 
            swapTarget.type !== 'dragon') {
          
          const newPieces = [...pieces];
          const bard = newPieces[bardNeedsSwap.bardIndex];
          
          // Swap positions
          newPieces[bardNeedsSwap.bardIndex] = { ...bard, row: swapTarget.row, col: swapTarget.col };
          newPieces[clickedPieceIdx] = { ...swapTarget, row: bardNeedsSwap.bardRow, col: bardNeedsSwap.bardCol };
          
          const bardCoord = getNodeCoordinate(bardNeedsSwap.bardRow, bardNeedsSwap.bardCol);
          const swapCoord = getNodeCoordinate(swapTarget.row, swapTarget.col);
          const swapDesc = `${PIECE_CHINESE['bard']} ${bardCoord} ⇄ ${PIECE_CHINESE[swapTarget.type]} ${swapCoord}`;
          
          setPieces(newPieces);
          setMoveHistory([...moveHistory, swapDesc]);
          setBardNeedsSwap(null);
          setSelectedPieceIndex(-1);
          setHighlights([]);
          
          // Now switch to next player
          const nextPlayer = currentPlayer === 'white' ? 'black' : 'white';
          setCurrentPlayer(nextPlayer);
          
          // Clean up burn marks and holy lights
          const remainingBurnMarks = burnMarks.filter(mark => mark.createdBy !== nextPlayer);
          const remainingHolyLights = holyLights.filter(light => light.createdBy !== nextPlayer);
          setBurnMarks(remainingBurnMarks);
          setHolyLights(remainingHolyLights);
        }
      }
      return; // Don't process other clicks when waiting for bard swap
    }

    // If no piece selected, try to select a piece
    if (selectedPieceIndex === -1) {
      if (clickedPieceIdx !== -1) {
        const piece = pieces[clickedPieceIdx];
        // Allow selecting any piece for viewing info, but only calculate moves for own pieces or neutral pieces
        setSelectedPieceIndex(clickedPieceIdx);
        
        if (piece.side === currentPlayer || piece.side === 'neutral') {
          
          // Calculate moves based on piece type
          if (allNodes.length > 0) {
            if (piece.type === 'wizard') {
              const moves = calculateWizardMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'apprentice') {
              const moves = calculateApprenticeMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'dragon') {
              const result = calculateDragonMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, burnMarks, holyLights);
              setHighlights(result.highlights);
              setDragonPathNodes(result.pathNodes);
              setProtectionZones([]);
            } else if (piece.type === 'ranger') {
              const moves = calculateRangerMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'griffin') {
              const moves = calculateGriffinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'assassin') {
              const moves = calculateAssassinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'paladin') {
              const moves = calculatePaladinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              const zones = calculatePaladinProtectionZone(piece, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones(zones);
              
              // Reveal any stealthed enemy assassins in THIS paladin's protection zone
              const revealedPieces = revealAssassinsInSpecificZone(pieces, zones, piece.side);
              setPieces(revealedPieces);
            } else if (piece.type === 'bard') {
              const moves = calculateBardMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
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
      setProtectionZones([]);
      return;
    }

    // Check if this is a valid move
    const highlight = highlights.find((h) => h.row === row && h.col === col);
    if (!highlight) {
      // Try selecting a different piece
      if (clickedPieceIdx !== -1) {
        const piece = pieces[clickedPieceIdx];
        // Allow selecting any piece for viewing info, but only calculate moves for own pieces or neutral pieces
        setSelectedPieceIndex(clickedPieceIdx);
        
        if (piece.side === currentPlayer || piece.side === 'neutral') {
          
          // Calculate moves based on piece type
          if (allNodes.length > 0) {
            if (piece.type === 'wizard') {
              const moves = calculateWizardMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'apprentice') {
              const moves = calculateApprenticeMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'dragon') {
              const result = calculateDragonMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, burnMarks, holyLights);
              setHighlights(result.highlights);
              setDragonPathNodes(result.pathNodes);
              setProtectionZones([]);
            } else if (piece.type === 'ranger') {
              const moves = calculateRangerMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'griffin') {
              const moves = calculateGriffinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'assassin') {
              const moves = calculateAssassinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones([]);
            } else if (piece.type === 'paladin') {
              const moves = calculatePaladinMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
              const zones = calculatePaladinProtectionZone(piece, pieces, adjacency, allNodes);
              setHighlights(moves);
              setDragonPathNodes([]);
              setProtectionZones(zones);
              
              // Reveal any stealthed enemy assassins in THIS paladin's protection zone
              const revealedPieces = revealAssassinsInSpecificZone(pieces, zones, piece.side);
              setPieces(revealedPieces);
            } else if (piece.type === 'bard') {
              const moves = calculateBardMoves(piece, clickedPieceIdx, pieces, adjacency, allNodes, holyLights);
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
        }
      }
      return;
    }

    // Execute the move
    let newPieces = [...pieces];
    let moveDesc = '';
    const fromCoord = getNodeCoordinate(selectedPiece.row, selectedPiece.col);
    const toCoord = getNodeCoordinate(row, col);
    let updatedBurnMarks = [...burnMarks];

    if (highlight.type === 'move') {
      // Check if there's actually a piece at the destination (e.g., stealthed assassin)
      const actualTargetIdx = getPieceAt(pieces, row, col);
      
      if (actualTargetIdx !== -1) {
        // There's a piece here (probably a stealthed assassin), kill it (unless it's a bard)
        const targetPiece = pieces[actualTargetIdx];
        
        if (targetPiece.type !== 'bard') {
          newPieces.splice(actualTargetIdx, 1);
          
          // Activate all bards when any piece is captured
          newPieces = activateAllBards(newPieces);
          
          // Adjust selectedPieceIndex if needed
          const adjustedIdx = actualTargetIdx < selectedPieceIndex ? selectedPieceIndex - 1 : selectedPieceIndex;
          
          // Update assassin stealth state based on movement direction
          let movedPiece = updateAssassinStealth(
            { ...selectedPiece, row, col },
            selectedPiece.row,
            selectedPiece.col,
            row,
            col
          );
          
          // Assassin reveals itself after killing
          if (movedPiece.type === 'assassin') {
            movedPiece = { ...movedPiece, stealthed: false };
          }
          
          newPieces[adjustedIdx] = movedPiece;
          moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
        } else {
          // Cannot kill bard, move fails - just reset selection
          setSelectedPieceIndex(-1);
          setHighlights([]);
          setDragonPathNodes([]);
          setProtectionZones([]);
          return;
        }
      } else {
        // Normal move to empty space
        // Update assassin stealth state based on movement direction
        let movedPiece = updateAssassinStealth(
          { ...selectedPiece, row, col },
          selectedPiece.row,
          selectedPiece.col,
          row,
          col
        );
        
        // If the moved piece is a stealthed assassin, check if it entered a protection zone
        if (movedPiece.type === 'assassin' && movedPiece.stealthed) {
          const enemySide = movedPiece.side === 'white' ? 'black' : 'white';
          if (isInProtectionZone(row, col, newPieces, enemySide, adjacency, allNodes)) {
            movedPiece = { ...movedPiece, stealthed: false };
          }
        }
        
        newPieces[selectedPieceIndex] = movedPiece;
        moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} → ${toCoord}`;
      }
      
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
      
      // Update positions and assassin stealth states
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
      
      // Check if moved piece (apprentice) is a stealthed assassin entering protection zone
      if (movedPiece.type === 'assassin' && movedPiece.stealthed) {
        const enemySide = movedPiece.side === 'white' ? 'black' : 'white';
        if (isInProtectionZone(row, col, newPieces, enemySide, adjacency, allNodes)) {
          movedPiece = { ...movedPiece, stealthed: false };
        }
      }
      
      // Check if swapped piece is a stealthed assassin entering protection zone
      if (swappedPiece.type === 'assassin' && swappedPiece.stealthed) {
        const enemySide = swappedPiece.side === 'white' ? 'black' : 'white';
        if (isInProtectionZone(selectedPiece.row, selectedPiece.col, newPieces, enemySide, adjacency, allNodes)) {
          swappedPiece = { ...swappedPiece, stealthed: false };
        }
      }
      
      newPieces[selectedPieceIndex] = movedPiece;
      newPieces[targetIdx] = swappedPiece;
      
      // If a paladin was involved in the swap, reveal assassins in its new protection zone
      if (movedPiece.type === 'paladin') {
        const zones = calculatePaladinProtectionZone(movedPiece, newPieces, adjacency, allNodes);
        const revealedPieces = revealAssassinsInSpecificZone(newPieces, zones, movedPiece.side);
        for (let i = 0; i < newPieces.length; i++) {
          newPieces[i] = revealedPieces[i];
        }
      }
      
      if (swappedPiece.type === 'paladin') {
        const zones = calculatePaladinProtectionZone(swappedPiece, newPieces, adjacency, allNodes);
        const revealedPieces = revealAssassinsInSpecificZone(newPieces, zones, swappedPiece.side);
        for (let i = 0; i < newPieces.length; i++) {
          newPieces[i] = revealedPieces[i];
        }
      }
      
      moveDesc = `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⇄ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
    } else if (highlight.type === 'attack') {
      const targetIdx = clickedPieceIdx;
      const targetPiece = pieces[targetIdx];
      
      // Check if target is in a protection zone
      // Only white or black pieces can be guarded (not neutral)
      const guardingPaladinIndices = targetPiece.side !== 'neutral' 
        ? findGuardingPaladins(
            row,
            col,
            pieces,
            targetPiece.side,
            adjacency,
            allNodes
          )
        : [];
      
      if (guardingPaladinIndices.length > 0) {
        // There are paladins that can guard this piece
        const options: GuardOption[] = guardingPaladinIndices.map(idx => ({
          paladinIndex: idx,
          paladinRow: pieces[idx].row,
          paladinCol: pieces[idx].col,
          coordinate: getNodeCoordinate(pieces[idx].row, pieces[idx].col),
        }));
        
        setGuardOptions(options);
        setPendingAttack({ targetRow: row, targetCol: col, targetPieceIndex: targetIdx });
        setGuardDialogOpen(true);
        return; // Stop here, wait for user's decision
      }
      
      // No guard available, proceed with normal attack
      // Remove the attacked piece first (unless it's a bard - bards cannot be killed)
      if (targetPiece.type !== 'bard') {
        newPieces.splice(targetIdx, 1);
        
        // Activate all bards when any piece is captured
        newPieces = activateAllBards(newPieces);
      }
      
      // Adjust selectedPieceIndex if needed (if target was before selected piece and was actually removed)
      const adjustedIdx = (targetPiece.type !== 'bard' && targetIdx < selectedPieceIndex) 
        ? selectedPieceIndex - 1 
        : selectedPieceIndex;
      
      // Move the attacking piece to the target position and update stealth (only if target wasn't a bard)
      if (targetPiece.type !== 'bard') {
        let movedPiece = updateAssassinStealth(
          { ...selectedPiece, row, col },
          selectedPiece.row,
          selectedPiece.col,
          row,
          col
        );
        
        // If the attacking piece is an assassin, it reveals itself after killing
        if (movedPiece.type === 'assassin') {
          movedPiece = { ...movedPiece, stealthed: false };
        }
        
        newPieces[adjustedIdx] = movedPiece;
      }
      
      moveDesc = targetPiece.type === 'bard'
        ? `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} 攻擊 ${PIECE_CHINESE[targetPiece.type]} ${toCoord} (無法擊殺)`
        : `${PIECE_CHINESE[selectedPiece.type]} ${fromCoord} ⚔ ${PIECE_CHINESE[targetPiece.type]} ${toCoord}`;
    }
    
    // If a paladin just moved, reveal any stealthed enemy assassins in its new protection zone
    if (selectedPiece.type === 'paladin') {
      const movedPaladin = newPieces[highlight.type === 'attack' 
        ? (clickedPieceIdx < selectedPieceIndex ? selectedPieceIndex - 1 : selectedPieceIndex)
        : selectedPieceIndex];
      
      if (movedPaladin) {
        const zones = calculatePaladinProtectionZone(movedPaladin, newPieces, adjacency, allNodes);
        const revealedPieces = revealAssassinsInSpecificZone(newPieces, zones, movedPaladin.side);
        
        // Update newPieces with revealed assassins
        for (let i = 0; i < newPieces.length; i++) {
          newPieces[i] = revealedPieces[i];
        }
      }
    }

    // Check if a bard just moved - if so, require swap before ending turn
    if (selectedPiece.type === 'bard' && highlight.type === 'move') {
      // Bard's index after move (it's still at selectedPieceIndex since we're in 'move' type)
      const bardNewIdx = selectedPieceIndex;
      
      const movedBard = newPieces[bardNewIdx];
      if (movedBard) {
        // Set pieces first
        setPieces(newPieces);
        setMoveHistory([...moveHistory, moveDesc]);
        
        // Mark that bard needs to swap
        setBardNeedsSwap({
          bardIndex: bardNewIdx,
          bardRow: movedBard.row,
          bardCol: movedBard.col,
        });
        
        // Show swap highlights for friendly pieces (exclude dragons)
        const swapHighlights: MoveHighlight[] = newPieces
          .map((p, idx) => ({
            piece: p,
            idx,
          }))
          .filter(({ piece }) => 
            piece.side === currentPlayer && 
            piece.type !== 'bard' &&
            piece.type !== 'dragon'
          )
          .map(({ piece }) => ({
            type: 'swap' as const,
            row: piece.row,
            col: piece.col,
          }));
        
        setHighlights(swapHighlights);
        setDragonPathNodes([]);
        setProtectionZones([]);
        // Keep selectedPieceIndex to track the bard
        return; // Don't switch player yet
      }
    }
    
    setPieces(newPieces);
    setMoveHistory([...moveHistory, moveDesc]);
    setSelectedPieceIndex(-1);
    setHighlights([]);
    setDragonPathNodes([]);
    setProtectionZones([]);
    
    // Switch to next player
    const nextPlayer = currentPlayer === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    
    // Clean up burn marks and holy lights created by the next player
    // (They last until the enemy's turn ends, which is when we switch back)
    const remainingBurnMarks = updatedBurnMarks.filter(mark => mark.createdBy !== nextPlayer);
    const remainingHolyLights = holyLights.filter(light => light.createdBy !== nextPlayer);
    setBurnMarks(remainingBurnMarks);
    setHolyLights(remainingHolyLights);
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
          選中: {selectedPieceIndex >= 0 ? `#${selectedPieceIndex}` : '無'} | 高亮: {highlights.length} | 玩家: {currentPlayer} | 守護區: {protectionZones.length}
          {protectionZones.length > 0 && (
            <span className="ml-2">
              [{protectionZones.map(z => `${getNodeCoordinate(z.row, z.col)}`).join(', ')}]
            </span>
          )}
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
              protectionZones={protectionZones}
              holyLights={holyLights}
            />
          </div>

          <div className="order-3">
            <TurnHistoryPanel currentPlayer={currentPlayer} moveHistory={moveHistory} />
          </div>
        </div>
      </div>

      <GuardDialog
        isOpen={guardDialogOpen}
        guardOptions={guardOptions}
        targetCoordinate={pendingAttack ? getNodeCoordinate(pendingAttack.targetRow, pendingAttack.targetCol) : ''}
        onSelectGuard={handleGuardSelect}
        onDecline={handleGuardDecline}
      />
    </div>
  );
}
