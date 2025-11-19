import TurnHistoryPanel from '../TurnHistoryPanel';

export default function TurnHistoryPanelExample() {
  const mockHistory = [
    '巫師 移動至 (15,0)',
    '學徒 移動至 (9,3)',
    '巫師 與 學徒 換位',
    '龍 移動至 (13,1)',
    '巫師 導線攻擊 龍 (13,1)',
  ];

  return (
    <div className="bg-gradient-to-br from-slate-950 to-black p-8 min-h-screen">
      <div className="max-w-sm">
        <TurnHistoryPanel currentPlayer="white" moveHistory={mockHistory} />
      </div>
    </div>
  );
}
