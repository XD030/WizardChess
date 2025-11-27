import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Wizard Chess Game Types
export type PieceType = 'wizard' | 'apprentice' | 'dragon' | 'ranger' | 'paladin' | 'assassin' | 'bard' | 'griffin';
export type Side = 'white' | 'black' | 'neutral';

// 這個檔本來就有 export type Side, export interface Piece ... 等
// 只要再多加這個就好

export interface MoveRecord {
  /** 完整資訊，用於觀戰者以及對局結束後的重播 */
  fullText: string;
  /** 白方在對局過程中能看到的文字 */
  whiteText: string;
  /** 黑方在對局過程中能看到的文字 */
  blackText: string;
}


export interface Piece {
  type: PieceType;
  side: Side;
  row: number;
  col: number;
  activated?: boolean; // For bard - whether it's activated to enable jumping
  stealthed?: boolean; // For assassin - whether it's in stealth mode
}

export interface BurnMark {
  row: number;
  col: number;
  createdBy: Side; // Which player created this burn mark
}

export interface HolyLight {
  row: number;
  col: number;
  createdBy: Side; // Which player created this holy light (only they can pass through)
}

export interface GameState {
  pieces: Piece[];
  currentPlayer: Side;
  selectedPieceIndex: number;
  gameOver: boolean;
  winner?: Side;
  moveHistory: string[];
  burnMarks: BurnMark[];
  holyLights: HolyLight[];
}

export interface NodePosition {
  x: number;
  y: number;
  row: number;
  col: number;
}

export interface MoveHighlight {
  type: 'move' | 'swap' | 'attack';
  row: number;
  col: number;
}

export interface GuardOption {
  paladinIndex: number; // Index in pieces array
  paladinRow: number;
  paladinCol: number;
  coordinate: string; // e.g., "E6"
}

export interface GuardDialogState {
  isOpen: boolean;
  targetRow: number;
  targetCol: number;
  targetPieceIndex: number;
  attackerPieceIndex: number;
  guardOptions: GuardOption[];
}
