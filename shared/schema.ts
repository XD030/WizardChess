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
