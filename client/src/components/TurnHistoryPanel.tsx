// client/src/components/TurnHistoryPanel.tsx

import type { Side } from '@shared/schema';

type PlayerSide = 'white' | 'black';

interface TurnHistoryPanelProps {
  currentPlayer: PlayerSide;
  moveHistory: string[];
  /**
   * 遊戲是否已結束；傳入 null 代表尚未結束
   */
  winner?: Side | null;
  /**
   * 點擊某一步移動紀錄（給觀戰模式用）
   * index = 0 代表最新的一步
   */
  onSelectMove?: (index: number) => void;
}

export default function TurnHistoryPanel({
  currentPlayer,
  moveHistory,
  winner,
  onSelectMove,
}: TurnHistoryPanelProps) {
  const hasWinner = !!winner;

  return (
    <div className="bg-slate-900/70 border border-slate-700 rounded-2xl p-4 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-100 mb-2">
        回合資訊
      </h2>

      {/* 回合 / 結束狀態 */}
      <div className="text-xs text-slate-400 mb-3">
        {hasWinner ? (
          <>
            <span className="mr-1">遊戲結束。</span>
            <span className="text-emerald-300">
              {winner === 'white' ? '白方勝利' : '黑方勝利'}
            </span>
          </>
        ) : (
          <>
            目前回合：
            <span className="text-emerald-300">
              {currentPlayer === 'white' ? '白方' : '黑方'}
            </span>
          </>
        )}
      </div>

      {/* 移動紀錄 */}
      <div className="text-xs text-slate-300 mb-1">移動紀錄</div>
      <div className="max-h-[420px] overflow-y-auto pr-1">
        {moveHistory.length === 0 ? (
          <div className="text-[11px] text-slate-500">
            尚無移動紀錄。
          </div>
        ) : (
          <ol className="space-y-1 text-[11px] leading-relaxed">
            {moveHistory.map((desc, index) => {
              // moveHistory[0] 是最新的一步 → 顯示編號要反過來數
              const displayIndex = moveHistory.length - index;

              const clickable = !!onSelectMove;

              return (
                <li
                  key={index}
                  className={
                    'flex gap-1 ' +
                    (clickable
                      ? 'cursor-pointer hover:text-emerald-300'
                      : '')
                  }
                  onClick={
                    clickable ? () => onSelectMove!(index) : undefined
                  }
                >
                  <span className="text-slate-500 w-5 text-right">
                    {displayIndex}.
                  </span>
                  <span>{desc}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
