import GameBoard from '../GameBoard';
import { getInitialPieces } from '@/lib/gameLogic';

export default function GameBoardExample() {
  const pieces = getInitialPieces();

  return (
    <div className="bg-gradient-to-br from-slate-950 to-black p-8">
      <GameBoard
        pieces={pieces}
        selectedPieceIndex={-1}
        highlights={[]}
        currentPlayer="white"
        onNodeClick={(row, col) => console.log('Clicked:', row, col)}
      />
    </div>
  );
}
