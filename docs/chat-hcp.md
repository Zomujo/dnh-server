# Chat Module — HCP (Web / Dashboard)

> **For AI agents**: This document describes the HCP-facing chat API contract. If you are an AI agent tasked with implementing or modifying frontend code that consumes this API, first review the existing codebase to match its conventions (state management, HTTP client, socket setup, UI patterns). Ask clarifying questions before implementing anything — do not assume frameworks, libraries, or patterns not already present in the codebase.

All `hcp`-prefixed endpoints are protected by **Chronic Care JWT** (`Authorization: Bearer <jwt>`). The JWT `sub` claim must be the HCP's MongoDB ObjectId (matching a `Personnel` document).

---

## Auth Setup

1. Log in via the chronic care auth endpoint — receive a JWT
2. Attach to every HTTP request: `Authorization: Bearer <jwt>`
3. For WebSocket, pass the token in `auth.token` + `auth.clientType = 'hcp'`

---

## WebSocket (Real-time Chat)

**Connection**
```ts
import { io } from 'socket.io-client';

const socket = io('https://api.example.com', {
  transports: ['websocket'],
  auth: {
    token: jwtToken,
    clientType: 'hcp',
  },
});

socket.on('connect', () => console.log('connected'));
```

### Events

| Direction | Event | Payload | Notes |
|---|---|---|---|
| Server → Client | `userConnected` | `{ id: string, role: string, email?: string }` | Emitted after successful auth handshake. Store `id` as the current user's ID. |
| Client → Server | `joinPrivateChat` | `{ recipientId: string }` | `recipientId` = Patient's Firebase UID (`user_xxx`). Server returns the room. |
| Server → Client | `roomJoined` | `{ roomId: string }` | Room was created/found; you've joined it. |
| Client → Server | `sendMessage` | `{ roomId: string, content: string, messageType?: string, parentMessageId?: string }` | Default `messageType` is `'text'`. Include `parentMessageId` to reply. Send media through the media upload endpoint: a media `content` URL that isn't stored under this room is returned unsigned (unreadable). |
| Server → Client | `newMessage` | `ChatMessage` object | Broadcast to all room participants. Contains `id`, `senderId`, `roomId`, `messageType`, `content`, `isRead`, `parentMessageId` (populated or null), `edited`, `createdAt`. |
| Client → Server | `editMessage` | `{ roomId: string, messageId: string, content: string }` | Edit your own text message. |
| Server → Client | `messageEdited` | `{ id: string, content: string, edited: true }` | Broadcast to the room after edit; update the message in-place. |
| Client → Server | `deleteMessage` | `{ roomId: string, messageId: string, deleteFor: 'me' \| 'everyone' }` | Delete a message. `'me'` only removes from your view; `'everyone'` replaces content with a deleted placeholder for all participants. |
| Server → Client | `messageDeleted` | `{ id: string, roomId: string, deletedForEveryone: boolean, deletedBy?: string }` | `deletedForEveryone: true` → show "This message was deleted". `false` → remove the message from your list. |
| Client → Server | `typing` | `{ roomId: string, isTyping: boolean }` | Start/stop typing indicator. |
| Server → Client | `userTyping` | `{ roomId: string, userId: string, isTyping: boolean }` | Other participant's typing state. |
| Client → Server | `audioRecording` | `{ roomId: string, isRecording: boolean }` | Start/stop audio recording indicator. |
| Server → Client | `userAudioRecording` | `{ roomId: string, userId: string, isRecording: boolean }` | Other participant's recording state. |
| Client → Server | `markRead` | `{ roomId: string }` | Marks own unread messages as read. |
| Server → Client | `messagesRead` | `{ roomId: string, readBy: string }` | Notifies the sender that their messages have been read. |
| Server → Client | `userStatus` | `{ userId: string, online: boolean, lastSeen: string \| null }` | Presence update — use to show "Online" / "last seen" for the other participant when `userId !== myId`. |

### Flow

```ts
// 0. On connect, receive your user ID
socket.on('userConnected', (user) => {
  myUserId = user.id;
});

// 1. Join room with a patient
socket.emit('joinPrivateChat', { recipientId: 'user_abc123' });

// 2. Listen for room response
socket.on('roomJoined', (data) => {
  currentRoomId = data.roomId;
  loadHistory(data.roomId);
});

// 3. Send a message
socket.emit('sendMessage', {
  roomId: currentRoomId,
  content: 'Take your medication twice daily.',
});

// 3b. Send a reply (include parentMessageId)
socket.emit('sendMessage', {
  roomId: currentRoomId,
  content: 'See above',
  parentMessageId: originalMessageId,
});

// 3c. Edit your own text message
socket.emit('editMessage', {
  roomId: currentRoomId,
  messageId: msgId,
  content: 'Updated instruction',
});

// 3d. Delete a message
socket.emit('deleteMessage', {
  roomId: currentRoomId,
  messageId: msgId,
  deleteFor: 'everyone', // or 'me'
});

// 4. Handle incoming messages
socket.on('newMessage', (msg) => {
  // prepend to message list or show notification
});

// 4b. Handle edited messages — update in-place
socket.on('messageEdited', ({ id, content, edited }) => {
  const msg = messages.find(m => m.id === id);
  if (msg) { msg.content = content; msg.edited = edited; render(); }
});

// 4c. Handle deleted messages
socket.on('messageDeleted', ({ id, deletedForEveryone }) => {
  if (deletedForEveryone) {
    const msg = messages.find(m => m.id === id);
    if (msg) { msg.deletedForEveryone = true; msg.content = 'This message was deleted'; render(); }
  } else {
    messages = messages.filter(m => m.id !== id);
    render();
  }
});

// 5. Typing indicator
socket.emit('typing', { roomId: currentRoomId, isTyping: true });

socket.on('userTyping', ({ userId, isTyping }) => {
  if (userId !== myId) setOtherTyping(isTyping);
});

// 6. Audio recording indicator
socket.emit('audioRecording', { roomId: currentRoomId, isRecording: true });

socket.on('userAudioRecording', ({ userId, isRecording }) => {
  if (userId !== myId) setOtherRecording(isRecording);
});

// 7. Mark as read when viewing a room
socket.emit('markRead', { roomId: currentRoomId });
socket.on('messagesRead', ({ roomId, readBy }) => {
  // update read receipts — your sent messages now show double ticks
});

// 8. Presence
socket.on('userStatus', ({ userId, online, lastSeen }) => {
  if (userId !== myId) {
    document.getElementById('status').textContent = online ? 'Online' : 'last seen ' + formatTime(lastSeen);
  }
});
```

---

## HTTP Endpoints

Base URL: `https://api.example.com/api/v1`

### List Chat Sessions (Paginated)

```http
GET /chat/hcp/sessions?page=1&limit=10
Authorization: Bearer <jwt>
```

| Param | Type | Required | Description |
|---|---|---|---|
| `page` | query | no | The page number to fetch (default: 1) |
| `limit` | query | no | Number of sessions per page (default: 10) |

**Response**
```json
{
  "success": true,
  "data": {
    "rows": [
      {
        "id": "66a1b2c3d4e5f6a7b8c9d0e1",
        "unread": false,
        "otherParticipant": {
          "id": "user_abc123",
          "name": "Jane Doe",
          "role": "patient"
        },
        "latestMessage": {
          "id": "77a1b2c3d4e5f6a7b8c9d0e2",
          "content": "I have a headache",
          "messageType": "text",
          "senderId": "user_abc123",
          "createdAt": "2026-07-02T10:30:00.000Z"
        }
      }
    ],
    "total": 1,
    "pageSize": 10,
    "page": 1,
    "nextPage": null,
    "prevPage": null,
    "totalPages": 1
  },
  "message": "Chat sessions fetched successfully"
}
```

### Get Message History (Paginated)

```http
GET /chat/hcp/rooms/{roomId}/messages?page=1&limit=20
Authorization: Bearer <jwt>
```

| Param | Type | Required | Description |
|---|---|---|---|
| `roomId` | path | yes | MongoDB ObjectId of the room |
| `page` | query | no | The page number to fetch (default: 1) |
| `limit` | query | no | Number of messages per page (default: 20) |

**Response shape** identical to the client endpoint (see `chat-client.md`).

### Upload Media

```http
POST /chat/hcp/rooms/{roomId}/media
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

file: <binary>
parentMessageId: <optional>
```

Same constraints as the client variant: max 50 MB, image/video/audio mime types only.

---

## UI Integration Tips

- **Contact list**: Fetch `GET /chat/hcp/sessions?page=1&limit=20` on dashboard load to show the sidebar with patient names and last message previews.
- **Unread count**: Listen for `newMessage` events globally; if `senderId !== myId` and the room isn't the active one, increment a badge counter.
- **Infinite scroll**: Use page-based pagination on scroll-to-top (increment `page` query parameter to load older messages; since the server returns them sorted newest first, the UI should prepend new items as they arrive).
- **Media thumbnails**: Check `messageType` — `'image'` URLs can be used directly in `<img>` tags; `'video'` and `'audio'` URLs go in `<video>` / `<audio>` controls.
