/**
 * Chat session interfaces for AI assistant conversations
 */
import type { Document, Model, Types } from 'mongoose';

export interface IChatSession {
  userId: Types.ObjectId;
  title: string;
  surface: 'landing' | 'dashboard' | 'admin';
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatSessionDocument extends IChatSession, Document {
  _id: Types.ObjectId;
}

// Add any static methods here if needed
export type IChatSessionModel = Model<IChatSessionDocument>;

export interface IChatMessage {
  sessionId: Types.ObjectId;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface IChatMessageDocument extends IChatMessage, Document {
  _id: Types.ObjectId;
}

// Add any static methods here if needed
export type IChatMessageModel = Model<IChatMessageDocument>;
