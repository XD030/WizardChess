import PieceInfoPanel from '../PieceInfoPanel';

export default function PieceInfoPanelExample() {
  const wizardPiece = {
    type: 'wizard' as const,
    side: 'white' as const,
    row: 16,
    col: 0,
  };

  return (
    <div className="bg-gradient-to-br from-slate-950 to-black p-8 min-h-screen">
      <div className="max-w-sm">
        <PieceInfoPanel piece={wizardPiece} />
      </div>
    </div>
  );
}
