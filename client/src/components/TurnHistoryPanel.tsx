import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TurnHistoryPanelProps {
  currentPlayer: 'white' | 'black';
  moveHistory: string[];
}

export default function TurnHistoryPanel({ currentPlayer, moveHistory }: TurnHistoryPanelProps) {
  return (
    <Card className="w-full" data-testid="card-turn-history">
      <CardHeader>
        <CardTitle className="text-lg">回合資訊</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3" data-testid="div-turn-indicator">
          <div className="text-sm font-medium">目前回合：</div>
          <div className="flex items-center gap-2">
            <div
              className={`w-4 h-4 rounded-full border-2 ${
                currentPlayer === 'white'
                  ? 'bg-white border-white'
                  : 'bg-black border-white'
              }`}
              data-testid="dot-current-player"
            />
            <span className="text-sm font-semibold" data-testid="text-current-player">
              {currentPlayer === 'white' ? '白方' : '黑方'}
            </span>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-sm font-semibold text-slate-400 mb-2">移動紀錄</div>
          <ScrollArea className="h-[300px]" data-testid="scroll-history">
            {moveHistory.length === 0 ? (
              <div className="text-sm text-muted-foreground">(尚無移動)</div>
            ) : (
              <div className="space-y-1 font-mono text-xs">
                {moveHistory.map((move, i) => (
                  <div
                    key={i}
                    className={`${
                      i === moveHistory.length - 1
                        ? 'text-amber-300 font-semibold'
                        : 'text-slate-300'
                    }`}
                    data-testid={`text-move-${i}`}
                  >
                    {i + 1}. {move}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
