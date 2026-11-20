/**
 * Socket.IO registry.
 *
 * A single module-level handle to the Socket.IO server plus the room-name
 * helpers and presence bookkeeping shared by the service, controller and
 * socket layers. Keeping it here avoids circular imports.
 */
import type { Server as SocketServer } from 'socket.io';

let io: SocketServer | null = null;

export function setRealtimeServer(server: SocketServer): void {
  io = server;
}

export function getRealtimeServer(): SocketServer | null {
  return io;
}

/** Personal room every socket of an employee joins. */
export function userRoom(employeeId: string): string {
  return `user:${employeeId}`;
}

/** Room every member of a conversation joins. */
export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function emitToUser(employeeId: string, event: string, payload: unknown): void {
  io?.to(userRoom(employeeId)).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(conversationRoom(conversationId)).emit(event, payload);
}

/** Fans an event out to several employees' personal rooms, de-duplicated. */
export function emitToUsers(employeeIds: string[], event: string, payload: unknown): void {
  if (!io) return;
  for (const employeeId of new Set(employeeIds)) {
    io.to(userRoom(employeeId)).emit(event, payload);
  }
}

/* ---------------- live presence ---------------- */

/**
 * Presence is tracked from the number of sockets an employee has open, so a
 * refresh or a second tab never briefly flips them offline.
 */
const connectionCounts = new Map<string, number>();

/** Returns true when this is the employee's first connection. */
export function trackConnected(employeeId: string): boolean {
  const next = (connectionCounts.get(employeeId) ?? 0) + 1;
  connectionCounts.set(employeeId, next);
  return next === 1;
}

/** Returns true when the employee's last connection has closed. */
export function trackDisconnected(employeeId: string): boolean {
  const current = connectionCounts.get(employeeId) ?? 0;
  if (current <= 1) {
    connectionCounts.delete(employeeId);
    return true;
  }
  connectionCounts.set(employeeId, current - 1);
  return false;
}

export function isEmployeeOnline(employeeId: string): boolean {
  return connectionCounts.has(employeeId);
}

export function onlineEmployeeIds(): string[] {
  return [...connectionCounts.keys()];
}
