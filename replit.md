# Wizard Chess Game

## Overview

This is a strategic wizard chess game featuring unique piece abilities and line-of-sight attacks on a diamond-shaped board. The game is built as a single-page web application with a dark fantasy aesthetic, supporting both English and Traditional Chinese (繁體中文) content. Players take turns moving specialized chess pieces (wizards, apprentices, dragons, rangers, paladins, assassins, and bards) across a non-traditional board layout, utilizing special abilities like stealth, teleportation, and line-of-sight attacks.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, using Vite as the build tool and development server.

**Routing**: Wouter for lightweight client-side routing (currently single-page with game route and 404 fallback).

**UI Component Library**: Radix UI primitives wrapped with custom styled components following the shadcn/ui pattern. Components are located in `client/src/components/ui/` and use a consistent design system with Tailwind CSS for styling.

**State Management**: React hooks (useState, useEffect) for local component state. No global state management library is currently implemented - all game state is managed within the main Game component.

**Game Rendering**: HTML5 Canvas for the game board visualization, with custom rendering logic for:
- Diamond-shaped board layout with node-based positioning
- Piece rendering using emoji symbols with circular backgrounds
- Visual effects for selected pieces, legal moves, and burn marks
- HiDPI (high-resolution display) support

**Styling Approach**: 
- Tailwind CSS with custom configuration for dark mode theme
- CSS variables for theming (defined in `client/src/index.css`)
- Dark fantasy aesthetic with slate color palette
- Typography system supporting both Latin (Inter) and Chinese (Noto Sans TC) fonts
- Responsive three-panel layout (left: piece info, center: board, right: turn history)

### Backend Architecture

**Server Framework**: Express.js running on Node.js with TypeScript.

**Development Mode**: Vite middleware integration for HMR (Hot Module Replacement) during development. The server proxies requests to Vite's dev server for frontend assets.

**Production Mode**: Serves pre-built static assets from the `dist/public` directory.

**API Structure**: RESTful API pattern with routes prefixed by `/api` (defined in `server/routes.ts`). Currently, the routes file is a skeleton with minimal implementation.

**Storage Layer**: Abstract storage interface (`IStorage`) with in-memory implementation (`MemStorage`) for user data. The storage can be easily swapped for a database-backed implementation.

### Data Storage Solutions

**Database ORM**: Drizzle ORM configured for PostgreSQL (using `@neondatabase/serverless` driver for Neon Database compatibility).

**Schema Definition**: Type-safe schema definitions in `shared/schema.ts` including:
- Users table with username/password authentication fields
- Game-specific types (Piece, GameState, BurnMark, NodePosition) shared between client and server
- Zod schemas for runtime validation (via drizzle-zod)

**Migration Strategy**: Drizzle Kit for schema migrations (configured in `drizzle.config.ts` with migrations output to `./migrations`).

**Current Implementation**: The application currently uses in-memory storage (`MemStorage`) but is structured to easily transition to PostgreSQL persistence.

### Game Logic Architecture

**Board Representation**: Diamond-shaped board with 17 rows and varying columns per row, represented as a graph structure with:
- Node positions calculated geometrically based on logical canvas size
- Adjacency matrix for determining valid connections between nodes
- Row-based organization for efficient piece lookup

**Piece Movement System**: Each piece type has dedicated movement calculation functions:
- Wizard: Single-node movement plus line-of-sight attacks through apprentices/bards
- Apprentice: Forward-only movement with position swapping ability
- Dragon: Straight-line movement with burn marks (persistent hazards)
- Ranger: Jumping movement ignoring obstacles
- Paladin: Diagonal movement pattern
- Assassin: Stealth mechanic hiding piece from opponents
- Bard: Activation-based jumping ability

**Game State Management**: Centralized state includes pieces array, current player, selected piece, move history, burn marks, and game-over conditions. All mutations flow through event handlers in the main Game component.

**Coordinate System**: Dual coordinate system:
- Row/column indices for logical game representation
- X/Y pixel coordinates for canvas rendering

### External Dependencies

**UI Component Framework**: Radix UI for accessible, unstyled component primitives (dialogs, dropdowns, tooltips, etc.).

**Styling**:
- Tailwind CSS for utility-first styling
- class-variance-authority (CVA) for component variant management
- clsx and tailwind-merge for conditional class composition

**Data Fetching**: TanStack Query (React Query) configured with custom fetch wrapper for API requests and caching.

**Form Handling**: React Hook Form with Hookform Resolvers for validation (prepared but not actively used in current implementation).

**Database**:
- Drizzle ORM for type-safe database queries
- @neondatabase/serverless for PostgreSQL connectivity
- drizzle-zod for schema validation

**Date/Time**: date-fns for date manipulation.

**Development Tools**:
- Replit-specific plugins for runtime error overlay, cartographer, and dev banner
- tsx for running TypeScript directly in development

**Fonts**: Google Fonts (Inter, Noto Sans TC, Space Mono) loaded via CDN for multilingual typography support.

**Session Management**: connect-pg-simple prepared for PostgreSQL-backed session storage (not yet implemented in current routes).