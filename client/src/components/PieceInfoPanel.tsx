import { useEffect, useRef } from 'react';
import type { Piece } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPieceSymbol, PIECE_CHINESE, SIDE_CHINESE, PIECE_DESCRIPTIONS } from '@/lib/gameLogic';
import wizardMoonImg from '@assets/wizard_moon.png';
import assassinLogoImg from '@assets/assassin_logo.png';

interface PieceInfoPanelProps {
  piece: Piece | null;
}

function AssassinIcon({ side }: { side: 'white' | 'black' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const size = 64;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = assassinLogoImg;
    img.onload = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;

        if (brightness > 128) {
          data[i + 3] = 0;
        } else {
          if (side === 'white') {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          } else {
            // Dark gray instead of pure black so it's visible on dark background
            data[i] = 180;
            data[i + 1] = 180;
            data[i + 2] = 180;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      
      // Add white outline for black pieces
      if (side === 'black') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, size, size);
      }
    };
  }, [side]);

  return <canvas ref={canvasRef} className="w-16 h-16" data-testid="text-piece-emoji" />;
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
          {piece.type === 'wizard' ? (
            <img 
              src={wizardMoonImg} 
              alt="巫師月亮"
              className="w-16 h-16"
              style={{
                filter: piece.side === 'white' 
                  ? 'invert(1) brightness(1.2)' 
                  : piece.side === 'black' 
                  ? 'brightness(0.3)'
                  : 'invert(1) sepia(1) saturate(3) hue-rotate(240deg)'
              }}
              data-testid="text-piece-emoji"
            />
          ) : piece.type === 'assassin' ? (
            <AssassinIcon side={piece.side as 'white' | 'black'} />
          ) : (
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
          )}
          <div>
            <div className="text-base font-bold text-foreground" data-testid="text-piece-name">
              {desc.name}
            </div>
            <div className="text-sm text-muted-foreground" data-testid="text-piece-side">
              陣營：{SIDE_CHINESE[piece.side]}
            </div>
            {piece.type === 'bard' && (
              <div className="text-sm mt-1" data-testid="text-bard-status">
                狀態：
                <span className={piece.activated ? 'text-green-400 font-semibold' : 'text-slate-500'}>
                  {piece.activated ? '已激活' : '未激活'} (debug: {piece.activated ? 'true' : 'false'})
                </span>
              </div>
            )}
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
