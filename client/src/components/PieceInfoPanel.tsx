import type { Piece } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPieceSymbol, PIECE_CHINESE, SIDE_CHINESE, PIECE_DESCRIPTIONS } from '@/lib/gameLogic';

interface PieceInfoPanelProps {
  piece: Piece | null;
}

export default function PieceInfoPanel({ piece }: PieceInfoPanelProps) {
  if (!piece) {
    return (
      <Card className="w-full" data-testid="card-piece-info">
        <CardHeader>
          <CardTitle className="text-lg">棋子資訊</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-base font-semibold text-foreground" data-testid="text-piece-name">
              未選取棋子
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              點擊自己的巫師可以查看能力。
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const desc = PIECE_DESCRIPTIONS[piece.type];

  return (
    <Card className="w-full" data-testid="card-piece-info">
      <CardHeader>
        <CardTitle className="text-lg">棋子資訊</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div 
            className="text-5xl font-bold" 
            style={{ 
              fontFamily: 'serif',
              color: piece.side === 'white' ? '#fff' : piece.side === 'black' ? '#000' : '#a855f7',
              textShadow: piece.side === 'white' ? '0 0 2px #000' : '0 0 2px #fff'
            }}
            data-testid="text-piece-emoji"
          >
            {getPieceSymbol(piece.type, piece.side)}
          </div>
          <div>
            <div className="text-base font-bold text-foreground" data-testid="text-piece-name">
              {desc.name} {PIECE_CHINESE[piece.type]}
            </div>
            <div className="text-sm text-muted-foreground" data-testid="text-piece-side">
              陣營：{SIDE_CHINESE[piece.side]}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-sm font-semibold text-slate-400 mb-2">移動方式</div>
          <ul className="space-y-1" data-testid="list-move-desc">
            {desc.move.map((text, i) => (
              <li key={i} className="text-sm text-slate-200 flex gap-2">
                <span className="text-emerald-400">•</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-sm font-semibold text-slate-400 mb-2">能力</div>
          <ul className="space-y-1" data-testid="list-ability-desc">
            {desc.ability.map((text, i) => (
              <li key={i} className="text-sm text-slate-200 flex gap-2">
                <span className="text-amber-400">•</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
