/**
 * Socket.IO gateway for the chat module.
 *
 * Mounted on the existing Express HTTP server (spec §17) so there is no
 * second process to babysit. Authentication reuses the HTTP access token and
 * the same `resolveUser` lookup, so a disabled account or revoked role stops
 * the socket exactly like it stops the API.
 */
import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { hasPermission } from '../../config/modules';
import { env } from '../../config/env';
import { resolveUser } from '../../middleware/auth';
import { verifyAccessToken } from '../../utils/jwt';
import {
  canAccessConversation,
  createMessage,
  deleteMessage,
  editMessage,
  addReaction,
  listConversationIds,
  markDelivered,
  markRead,
  removeReaction,
  setPresence,
} from './chat.service';
import {
  conversationRoom,
  setRealtimeServer,
  trackConnected,
  trackDisconnected,
  userRoom,
} from './chat.realtime';

interface SocketIdentity {
  id: string;
  email: string;
}

interface AckResponse {
  ok: boolean;
  message?: unknown;
  error?: string;
}

type Ack = (response: AckResponse) => void;

function readToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();

  const header = socket.handshake.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return null;
}

function identity(socket: Socket): SocketIdentity {
  return socket.data.identity as SocketIdentity;
}

function ackOf(callback: unknown): Ack {
  return typeof callback === 'function' ? (callback as Ack) : () => {};
}

async function guarded(ack: Ack, task: () => Promise<unknown>): Promise<void> {
  try {
    const message = await task();
    ack({ ok: true, message });
  } catch (error) {
    ack({ ok: false, error: error instanceof Error ? error.message : 'Request failed' });
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

export function attachChatRealtime(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    path: '/socket.io',
    cors: { origin: env.corsOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = readToken(socket);
      if (!token) return next(new Error('Missing access token'));

      const claims = verifyAccessToken(token);
      const user = await resolveUser(claims.sub);
      if (!hasPermission(user.permissions, 'chat', 'VIEW')) {
        return next(new Error('You do not have access to chat'));
      }

      socket.data.identity = { id: user.id, email: user.email } satisfies SocketIdentity;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    void onConnection(socket);
  });

  setRealtimeServer(io);
  return io;
}

async function onConnection(socket: Socket): Promise<void> {
  const me = identity(socket);

  socket.join(userRoom(me.id));

  // Register every handler synchronously, before the async setup below, so an
  // event emitted right after `connect` (fast client, reconnect) is never
  // dropped while room-join/presence lookups are still in flight.
  socket.on('chat:join', async (payload: { conversationId?: string }, callback?: unknown) => {
    const ack = ackOf(callback);
    await guarded(ack, async () => {
      const conversationId = requireString(payload?.conversationId, 'conversationId');
      if (!(await canAccessConversation(me.id, conversationId))) {
        throw new Error('You are not a member of this conversation');
      }
      socket.join(conversationRoom(conversationId));
      return { joined: conversationId };
    });
  });

  socket.on('chat:leave', (payload: { conversationId?: string }) => {
    const conversationId = payload?.conversationId;
    if (typeof conversationId === 'string') socket.leave(conversationRoom(conversationId));
  });

  socket.on('message:send', async (payload: MessageSendPayload, callback?: unknown) => {
    const ack = ackOf(callback);
    await guarded(ack, () => {
      const conversationId = requireString(payload?.conversationId, 'conversationId');
      const content = requireString(payload?.content, 'Message');
      if (content.length > 4000) throw new Error('Message is too long');
      return createMessage(me.id, conversationId, {
        content,
        clientMessageId: typeof payload?.clientMessageId === 'string' ? payload.clientMessageId : null,
        replyToMessageId: typeof payload?.replyToMessageId === 'string' ? payload.replyToMessageId : null,
      });
    });
  });

  socket.on('message:edit', async (payload: MessageEditPayload, callback?: unknown) => {
    const ack = ackOf(callback);
    await guarded(ack, () =>
      editMessage(
        me.id,
        requireString(payload?.messageId, 'messageId'),
        requireString(payload?.content, 'Message'),
      ),
    );
  });

  socket.on('message:delete', async (payload: { messageId?: string }, callback?: unknown) => {
    const ack = ackOf(callback);
    await guarded(ack, async () => {
      await deleteMessage(me.id, requireString(payload?.messageId, 'messageId'));
      return { deleted: true };
    });
  });

  socket.on('message:delivered', async (payload: { conversationId?: string }) => {
    const conversationId = payload?.conversationId;
    if (typeof conversationId !== 'string') return;
    try {
      await markDelivered(me.id, conversationId);
    } catch {
      // Delivery receipts are best-effort.
    }
  });

  socket.on('message:read', async (payload: { conversationId?: string; messageId?: string }) => {
    const conversationId = payload?.conversationId;
    const messageId = payload?.messageId;
    if (typeof conversationId !== 'string' || typeof messageId !== 'string') return;
    try {
      await markRead(me.id, conversationId, messageId);
    } catch {
      // Read receipts are best-effort.
    }
  });

  socket.on('message:reaction:add', async (payload: ReactionPayload, callback?: unknown) => {
    const ack = ackOf(callback);
    await guarded(ack, () =>
      addReaction(
        me.id,
        requireString(payload?.messageId, 'messageId'),
        requireString(payload?.reaction, 'reaction'),
      ),
    );
  });

  socket.on('message:reaction:remove', async (payload: ReactionPayload, callback?: unknown) => {
    const ack = ackOf(callback);
    await guarded(ack, () =>
      removeReaction(
        me.id,
        requireString(payload?.messageId, 'messageId'),
        requireString(payload?.reaction, 'reaction'),
      ),
    );
  });

  socket.on('typing:start', (payload: { conversationId?: string }) => {
    const conversationId = payload?.conversationId;
    if (typeof conversationId !== 'string') return;
    socket.to(conversationRoom(conversationId)).emit('typing:started', { conversationId, employeeId: me.id });
  });

  socket.on('typing:stop', (payload: { conversationId?: string }) => {
    const conversationId = payload?.conversationId;
    if (typeof conversationId !== 'string') return;
    socket.to(conversationRoom(conversationId)).emit('typing:stopped', { conversationId, employeeId: me.id });
  });

  socket.on('disconnect', () => {
    void (async () => {
      if (trackDisconnected(me.id)) await setPresence(me.id, false);
    })();
  });

  // Async setup: auto-join every conversation room so background
  // delivery/notifications work without the client opening each thread first,
  // then announce presence.
  const conversationIds = await listConversationIds(me.id);
  for (const conversationId of conversationIds) socket.join(conversationRoom(conversationId));

  if (trackConnected(me.id)) await setPresence(me.id, true);
}

interface MessageSendPayload {
  conversationId?: string;
  content?: string;
  clientMessageId?: string | null;
  replyToMessageId?: string | null;
}

interface MessageEditPayload {
  messageId?: string;
  content?: string;
}

interface ReactionPayload {
  messageId?: string;
  reaction?: string;
}
