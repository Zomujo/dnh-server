# Chat Backend — Full Context for AI Agents

This document contains everything an AI agent needs to understand and modify the peer-to-peer chat backend. Read this fully before making any changes.

---

## Overview

The chat module (`src/features/chat/`) provides real-time messaging between patients and HCPs (clinicians/pharmacy staff). It uses **Socket.IO** for bidirectional real-time communication and REST endpoints for session listing, message history, and media uploads.

- Patients authenticate via **Firebase ID tokens** (clientType: `'patient'`)
- HCPs authenticate via **Chronic Care JWT** (clientType: `'hcp'`)
- Messages, rooms, and media are stored in **MongoDB**
- **Push notifications** are sent via Firebase Cloud Messaging for new messages
- **Presence tracking** is handled in-memory via a `Map<string, Set<string>>` (userId → socket IDs)

---

## Auth Architecture

### HTTP Auth
- **Client endpoints** (`/chat/client/*`) — `@Authorize(UserType.DH_CLIENTS)` → Firebase `verifyIdToken`
- **HCP endpoints** (`/chat/hcp/*`) — `@CustomApiResponse` includes `'authorizeChronicCare'` variant + `@Roles(PersonnelRoles.CLINICIAN)` → JWT verification

### Room membership
Every room-scoped operation checks that the caller is one of the room's `participants` (`ChatService.assertParticipant`). A room the caller isn't in returns **404 `Room not found`**, the same as a nonexistent room.
- REST: `GET .../rooms/:roomId/messages` and `POST .../rooms/:roomId/media`
- WebSocket: `sendMessage` and `markRead` (DB check); `typing` and `audioRecording` are dropped unless the socket joined the room via `joinPrivateChat`
- `editMessage` / `deleteMessage` broadcast to the message's own `roomId`, not the one in the payload

### WebSocket Auth (`WsAuthVerifier`)
- Extracts `token` and `clientType` from `socket.handshake.auth`
- `clientType === 'patient'` → `FirebaseService.verifyAsync(token)` → `{ uid, ... }`
- `clientType === 'hcp'` → `AuthService.verifyChronicCareToken(token)` → `{ sub, role, email }`
- Stores result in `client.data.user`
- Disconnects with error on failure
- After auth, emits `userConnected` event to the client with `{ id, role, email? }`

---

## MongoDB Schemas

### ChatRoom (`entities/room.entity.ts`)
```
{
  _id: ObjectId,
  participants: string[],          // [patientUserId, hcpObjectId] — string IDs
  createdAt: Date,
  updatedAt: Date
}
```
- Index: `{ participants: 1 }` — used for `getOrCreateRoom` lookup
- `participants` is an unsorted array of 2 string IDs

### ChatMessage (`entities/message.entity.ts`)
```
{
  _id: ObjectId,
  roomId: string,                  // ChatRoom._id as string
  senderId: string,                // who sent it (patient UID or HCP ObjectId)
  messageType: string,             // 'text' | 'image' | 'video' | 'audio'
  content: string,                 // text content or Firebase Storage URL
  isRead: boolean,                 // default: false
  parentMessageId: ObjectId | null,// reference to replied-to message
  edited: boolean,                 // default: false
  deletedFor: string[],            // user IDs who soft-deleted for themselves
  deletedForEveryone: boolean,     // default: false
  createdAt: Date,
  updatedAt: Date
}
```
- Schema `toJSON` transform converts `_id` → `id`
- Indexes: `{ roomId: 1, _id: -1 }` for paginated message queries
- `deletedForEveryone: true` → content is replaced with `"This message was deleted"` at query time (original kept in DB)
- `deletedFor: string[]` → per-user soft delete

---

## File Structure

```
src/features/chat/
├── chat.module.ts          — Module definition
├── chat.controller.ts      — REST endpoints (media upload, sessions, history)
├── chat.gateway.ts         — WebSocket event handlers
├── chat.service.ts         — Business logic (CRUD, pagination, push notifications)
├── ws-auth.verifier.ts     — Dual-auth WebSocket guard
├── entities/
│   ├── room.entity.ts      — ChatRoom schema
│   └── message.entity.ts   — ChatMessage schema
├── dto/
│   ├── chat-session.dto.ts — Session response DTOs
│   ├── chat-pagination.dto.ts — Page/limit query DTOs
│   └── media-upload.dto.ts — File upload DTO
└── index.ts                — Barrel exports
```

---

## WebSocket Events

### Connection
```ts
const socket = io('https://api.example.com', {
  transports: ['websocket'],
  auth: { token: '<jwt-or-firebase-token>', clientType: 'patient' | 'hcp' },
});
```

### Event Table

| Direction | Event | Payload | Notes |
|---|---|---|---|
| Server → Client | `userConnected` | `{ id, role, email? }` | On successful auth. `id` is the user's identifier to store locally. |
| Client → Server | `joinPrivateChat` | `{ recipientId: string }` | Creates or finds a 1-on-1 room. `recipientId` is the other participant's user ID. |
| Server → Client | `roomJoined` | `{ roomId: string }` | The user has joined the room. Every subsequent event uses this `roomId`. |
| Client → Server | `sendMessage` | `{ roomId, content, messageType?, parentMessageId? }` | Default `messageType: 'text'`. `messageType` can be `'text' \| 'image' \| 'video' \| 'audio'`. Include `parentMessageId` to reply. |
| Server → Client | `newMessage` | `ChatMessage` object | Broadcast to all room participants (including sender). |
| Client → Server | `editMessage` | `{ roomId, messageId, content }` | Only the sender can edit their own **text** messages. |
| Server → Client | `messageEdited` | `{ id, content, edited }` | Broadcast to room — update the message in-place. |
| Client → Server | `deleteMessage` | `{ roomId, messageId, deleteFor: 'me' \| 'everyone' }` | `'me'` → adds sender's userId to `deletedFor` array. `'everyone'` → sets `deletedForEveryone: true`. |
| Server → Client | `messageDeleted` | `{ id, roomId, deletedForEveryone, deletedBy? }` | `deletedForEveryone: true` → show placeholder. `false` → remove from local list. Always emitted to the sender; only emitted to others when `'everyone'`. |
| Client → Server | `typing` | `{ roomId, isTyping: boolean }` | Start/stop typing. |
| Server → Client | `userTyping` | `{ userId, isTyping }` | Broadcast to room excluding sender. |
| Client → Server | `audioRecording` | `{ roomId, isRecording: boolean }` | Start/stop audio recording. |
| Server → Client | `userAudioRecording` | `{ userId, isRecording }` | Broadcast to room excluding sender. |
| Client → Server | `markRead` | `{ roomId }` | Marks all unread messages in the room as read (for the sender of the markRead event). |
| Server → Client | `messagesRead` | `{ roomId, readBy }` | Notifies other participants that messages were read. |
| Server → Client | `userStatus` | `{ userId, online, lastSeen }` | Presence update. Emitted on connect (online: true) and disconnect (online: false + ISO timestamp). |

---

## HTTP Endpoints

### Base URL: `/api/v1`

### GET `/chat/{hcp,client}/sessions`
Paginated list of chat rooms for the authenticated user.
- Query: `page` (default 1), `limit` (default 10)
- Response: `{ rows: ChatSessionDto[], total, pageSize, page, nextPage, prevPage, totalPages }`
- Each `ChatSessionDto` has: `id`, `unread`, `otherParticipant: { id, name, role }`, `latestMessage: { id, content, messageType, senderId, createdAt } | null`
- `latestMessage` skips messages where `deletedForEveryone: true`
- `unread` is true when `latestMessage.senderId !== userId && !latestMessage.isRead`
- Sorted by most recent message/activity first (via aggregation)

### GET `/chat/{hcp,client}/rooms/:roomId/messages`
Paginated message history for a room.
- Query: `page` (default 1), `limit` (default 20)
- Response: `PaginatedDataResponseDto<ChatMessage>`
- Sorted by `createdAt: -1` (newest first)
- `.lean()` queries manually map `_id` → `id`
- When `deletedForEveryone` is true, `content` is rewritten to `"This message was deleted"`
- Messages in the user's `deletedFor` array are filtered out

### POST `/chat/{hcp,client}/rooms/:roomId/media`
Upload media file to a room.
- Multipart form-data with `file` (required) and `parentMessageId` (optional query param)
- Max 50 MB, enforced by multer while streaming (`413` beyond it). Accepted types: jpeg, jpg, png, gif, mp4, mpeg, m4a, mp3, quicktime, webm
- File uploaded to Firebase Storage at `hcp_chats/{roomId}/{images|videos|audios}/{uuid}{ext}` with **no download token**; `ChatMessage` stores the token-less object URL in `content`
- `messageType` auto-detected from mime type (image/*, video/*, audio/*)
- Sender: HCP uses `@GetUser('sub')`, client uses `@GetUser('uid')`
- Returns the saved `ChatMessage` object, with `content` as a signed URL (see below)

### Media URLs are short-lived
Stored media URLs aren't publicly readable. Every read path — message history, session `latestMessage`, the media upload response and the `newMessage` broadcast for uploads — replaces media `content` with a **V4 signed URL valid for 15 minutes** (`ChatService.withSignedMedia` → `FirebaseService.signedUrlFor`). Clients must not cache these URLs; re-fetch history to get fresh ones. Legacy rows that still hold `?alt=media&token=` URLs are re-signed the same way.

---

## Presence Tracking

Implemented in `ChatGateway` via:
```ts
private readonly userSockets: Map<string, Set<string>> = new Map();
```
- On connect: `userId → socket.id` added to map
- On disconnect: socket.id removed; if set is empty, emits `userStatus` with `online: false` + `lastSeen`
- `lastSeen` stored on `client.data.lastSeen` and used from disconnect handler

---

## Push Notifications

Implemented in `ChatService.sendPushNotificationForMessage()`:
- Looks up the recipient by finding the other participant in the room
- Resolves sender name (Personnel `userName` or Patient `name`)
- Sends via `PushService.sendAugurNotification()` with:
  - `userId`: recipient's ID
  - `title`: sender's name
  - `body`: for media types, friendly labels (`🎤 Voice message`, `📷 Photo`, `🎬 Video`); for text, the original content
  - `chatId`: the room ID
  - `payload`: `{ notification_type: 'chat' }`
- Errors are caught and logged without breaking message delivery

---

## Pagination

All paginated endpoints use **page/limit offset-based pagination** (not cursor):
- `page`: 1-indexed, default 1
- `limit`: items per page, default 10 for sessions, 20 for messages
- Uses `PaginationFilterFactory.generateFilter()` from `@/common/factory`
- Session pagination uses MongoDB aggregation with `$facet`
- Message pagination uses `mongoose-paginate-v2` plugin

---

## Key Implementation Details & Gotchas

### 1. `latestMessage` in Sessions
Content is returned as-is, except media URLs, which are signed (see *Media URLs are short-lived*). Friendly labels for media types (`🎤 Voice message`, `📷 Photo`, `🎬 Video`) are a **frontend concern** — the API does not transform session content.

### 2. Delete Behavior
- **"Delete for me"**: Adds the requesting user's ID to `deletedFor: string[]` array. The `messageDeleted` event is emitted **only to the requester** with `deletedForEveryone: false`. The frontend should remove the message locally.
- **"Delete for everyone"**: Sets `deletedForEveryone: true` on the message. The original `content` is **preserved in the database**. All room participants receive `messageDeleted` with `deletedForEveryone: true`. At query time (`getPaginatedMessages`), content is rewritten to `"This message was deleted"`. Session list filters out `deletedForEveryone: true` messages when picking `latestMessage`.
- Only the **sender** can delete a message.

### 3. Edit Restrictions
- Only **text** messages can be edited
- Only the **sender** can edit
- Sets `edited: true` on the message document

### 4. `id` vs `_id`
- The ChatMessage schema has a `toJSON` transform that converts `_id` → `id`
- `.lean()` queries **bypass** the transform, so results must manually map:
  ```ts
  id: (msg as any)._id?.toString()
  ```

### 5. `parentMessageId`
- Used for reply/thread functionality
- Optional: on `sendMessage` (in body), on media upload (as query param)
- `newMessage` event returns a populated `parentMessageId` object with `{ id, content, senderId, messageType }`

### 6. Media Upload Sender
- HCP uploads: sender ID = `@GetUser('sub')` → Personnel MongoDB ObjectId
- Client uploads: sender ID = `@GetUser('uid')` → Firebase UID
- Previously hardcoded to `'system'` — always use the authenticated user

### 7. WebSocket Auth
- Never extract tokens from the client body — always from `socket.handshake.auth`
- `client.data.user` stores the decoded auth payload
- `client.data.user.role` is `'patient'` or `'hcp'`
- HCP JWT payload includes `{ sub, role, email }` — `email` is needed for `userConnected` event display

### 8. Module Dependencies
- `ChatModule` imports `AugurNotificationsModule` (for `PushService`)
- `FirebaseService` and `AuthService` are `@Global` — injectable without module import
- `MongooseModule.forFeature` registers both `ChatRoom` and `ChatMessage` models

### 9. Session Participant Name Resolution
Names are resolved per-room at query time by looking up `Personnel` (via `_id`) and `Patient` (via `userId`) — no denormalized name storage in the room schema.

### 10. Online Presence
Uses an in-memory `Map<string, Set<string>>` — **not persisted**. On server restart, all users appear offline until they reconnect. Last-seen timestamp is set from `client.data.lastSeen` (updated on first `sendMessage`).
