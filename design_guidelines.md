# Wizard Chess Game Design Guidelines

## Design Approach

**Reference-Based Approach**: Drawing inspiration from modern chess platforms (Chess.com, Lichess) combined with fantasy game aesthetics (Hearthstone's board presentation, Magic: The Gathering Arena's interface clarity). The design balances strategic clarity with atmospheric fantasy elements fitting for wizard chess.

**Core Principle**: Crystal-clear gameplay information wrapped in an atmospheric dark fantasy presentation that doesn't compromise usability.

## Typography System

**Font Families**:
- Primary (UI/English): 'Inter' or 'Manrope' - clean, modern sans-serif
- Secondary (Chinese): 'Noto Sans TC' - optimized for Traditional Chinese characters
- Accent (Titles): 'Cinzel' or similar medieval-style serif for section headers

**Type Scale**:
- Hero/Board Title: 32px, semi-bold
- Panel Headers: 18px, bold
- Piece Names: 16px, bold
- Body Text (Rules/Descriptions): 14px, regular
- Metadata (Coordinates, History): 12px, regular
- Small Text (Hints): 11px, regular

**Chinese Typography**: Line-height 1.6-1.7 for optimal Chinese character readability, letter-spacing: 0.02em

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 for consistency (e.g., p-4, gap-6, m-8)

**Three-Panel Structure**:
- Left Panel (Piece Information): Fixed width 280px, bg-slate-900/90, backdrop-blur
- Center Panel (Game Board): Flexible, centered, max-width 720px
- Right Panel (Turn & History): Fixed width 280px, bg-slate-900/90, backdrop-blur

**Responsive Breakpoints**:
- Desktop (1280px+): Three-column layout as described
- Tablet (768-1279px): Stack panels vertically, board first, then side panels in two columns
- Mobile (<768px): Single column, board scaled down, collapsible panels

## Component Library

### Game Board Canvas
- Canvas size: 700x700px logical, HiDPI scaling applied
- Board background: Gradient from slate-950 to slate-900
- Node rendering: Subtle glow effect on hover, 6px radius
- Piece rendering: Emoji with circular background (white: rgba(255,255,255,0.15), black: rgba(0,0,0,0.3))
- Selected piece: Pulsing golden ring (2px stroke, #fbbf24)

### Move Indicators
- Legal moves (green): bg-emerald-500/40, 8px radius circles
- Swap targets (yellow): bg-amber-400/40, 8px radius circles  
- Attack targets (red): bg-red-500/40, 8px radius circles with crosshair icon
- Hover state: Increase opacity to /60 and add subtle scale (1.1x)

### Information Panels

**Left Panel - Piece Information**:
- Card-style container with rounded-xl borders
- Piece emoji display: 48px size, centered above name
- Divider lines: 1px solid slate-700/50 between sections
- List styling: Custom bullet points using chess-themed icons or colored dots
- Section spacing: mt-6 between major sections

**Right Panel - Turn & History**:
- Turn indicator: Large circular badge showing current player with glow effect
- History log: Scrollable container (max-height 400px), monospace font for coordinates, alternating row backgrounds (slate-800/30)
- Move entries: Number prefix in muted color, piece emoji, then move description

### Typography Hierarchy in Panels
- Panel Headers: uppercase, tracking-wide, text-slate-300
- Subsection Titles: text-slate-400, font-semibold
- Body Text: text-slate-200
- Metadata/Secondary: text-slate-500

### Interactive Elements
- Piece selection: Canvas-based click detection, visual feedback via ring and highlight
- Panel hover states: Subtle border glow on interactive list items
- Button states (if added for game controls): bg-slate-800 default, hover:bg-slate-700, focus ring in accent color

## Atmospheric Enhancements

**Background Treatment**:
- Body background: Radial gradient from center (slate-950 to black) with subtle noise texture overlay
- Optional: Faint starfield or magical particle effect in deep background (very subtle, 10% opacity max)

**Panel Styling**:
- Semi-transparent panels (bg-slate-900/90) with backdrop-blur-md
- Subtle inner shadow for depth
- 1px border in slate-700/30 for definition

**Board Container**:
- Elevated appearance with soft shadow: shadow-2xl in slate-950
- Rounded corners: rounded-2xl
- Optional: Subtle magical glow effect around board perimeter (#7c3aed at 5% opacity)

## Images

**Hero/Header Image**: None required - the game board itself serves as the primary visual

**Background Atmosphere**: 
- Subtle dark fantasy texture: Magical mist, ancient stone, or starfield pattern as body background
- Implementation: CSS background-image with very low opacity (5-10%), ensuring it doesn't interfere with readability
- Placement: Full-page background, fixed position

**Piece Visualization**: 
- Current emoji approach is effective and culturally appropriate
- Consider upgrading to custom SVG icons if budget allows, maintaining the clear silhouette style

## Color Palette Refinement

While not specifying exact colors, establish these role-based categories:
- **Neutral backgrounds**: Deep slate/charcoal range for panels and containers
- **Text hierarchy**: White to slate-500 range for information hierarchy
- **Interaction indicators**: Emerald (move), Amber (swap), Red (attack) at 40-60% opacity
- **Accent/Focus**: Golden/amber tones for selected state and important highlights
- **Turn indicators**: Pure white and pure black circles with border definition

## Visual Feedback & States

**Board Interaction**:
- Hover on valid piece: Subtle scale 1.05x, increase brightness
- Selected piece: Golden ring animation (subtle pulse 0.9-1.0 scale)
- Invalid selection: Quick shake animation, brief red tint

**History Log**:
- Latest move: Highlighted with amber/golden background tint
- Scroll behavior: Smooth auto-scroll to latest entry
- Move grouping: Visual separator every 5 moves for easier scanning

## Performance Considerations

- Canvas rendering optimized with requestAnimationFrame
- Panel content uses CSS transforms for smooth interactions
- Minimize repaints by updating only changed sections
- Preload any custom fonts to prevent FOUT/FOIT