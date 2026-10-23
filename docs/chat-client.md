# Chat Module — Client (Flutter / Mobile)

> **For AI agents**: This document describes the client-facing chat API contract. If you are an AI agent tasked with implementing or modifying frontend code that consumes this API, first review the existing codebase to match its conventions (state management, HTTP client, socket setup, UI patterns). Ask clarifying questions before implementing anything — do not assume frameworks, libraries, or patterns not already present in the codebase.

All `client`-prefixed endpoints are protected by **Firebase Auth** (`Authorization: Bearer <id-token>`).

---

## Auth Setup

1. Authenticate user via Firebase (email/password, Google, etc.)
2. Extract the **Firebase ID token** (JWT) from the auth result
3. Attach to every HTTP request: `Authorization: Bearer <token>`
4. For WebSocket, pass the token in `auth.token` + `auth.clientType = 'patient'`

---

## WebSocket (Real-time Chat)

**Connection**
```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

final socket = IO.io(
  'https://api.example.com',
  IO.OptionBuilder()
    .setTransports(WebSocket) // or ['websocket']
    .setAuth({
      'token': firebaseIdToken,
      'clientType': 'patient',
    })
    .build(),
);

socket.onConnect((_) => print('connected'));
socket.onDisconnect((_) => print('disconnected'));
```

### Events

| Direction | Event | Payload | Notes |
|---|---|---|---|
| Server → Client | `userConnected` | `{ id: string, role: string, email?: string }` | Emitted after successful auth handshake. Store `id` as the current user's ID. |
| Client → Server | `joinPrivateChat` | `{ recipientId: string }` | `recipientId` = HCP's MongoDB ObjectId string. Server returns the room. |
| Server → Client | `roomJoined` | `{ roomId: string }` | Room was created/found; you've joined it. |
| Client → Server | `sendMessage` | `{ roomId: string, content: string, messageType?: 'text' \| 'image' \| 'video' \| 'audio', parentMessageId?: string }` | Default `messageType` is `'text'`. Include `parentMessageId` to reply. |
| Server → Client | `newMessage` | `ChatMessage` object | Emitted to everyone in the room. Contains `id`, `senderId`, `roomId`, `messageType`, `content`, `isRead`, `parentMessageId` (populated object or null), `edited`, `createdAt`. |
| Client → Server | `editMessage` | `{ roomId: string, messageId: string, content: string }` | Edit your own text message. Only text messages can be edited. |
| Server → Client | `messageEdited` | `{ id: string, content: string, edited: true }` | Broadcast to the room after a message is edited; update the message in-place. |
| Client → Server | `deleteMessage` | `{ roomId: string, messageId: string, deleteFor: 'me' \| 'everyone' }` | Delete a message. `'me'` hides it from your view; `'everyone'` shows a "This message was deleted" placeholder for all (sender only). |
| Server → Client | `messageDeleted` | `{ id: string, roomId: string, deletedForEveryone: boolean, deletedBy?: string }` | `deletedForEveryone: true` → replace content with a deleted-message indicator. `false` → remove the message from your local list. |
| Client → Server | `typing` | `{ roomId: string, isTyping: boolean }` | Emitted as the user starts/stops typing. |
| Server → Client | `userTyping` | `{ userId: string, isTyping: boolean }` | Other participant's typing state. |
| Client → Server | `audioRecording` | `{ roomId: string, isRecording: boolean }` | Emitted as the user starts/stops recording audio. |
| Server → Client | `userAudioRecording` | `{ userId: string, isRecording: boolean }` | Other participant's recording state. |
| Client → Server | `markRead` | `{ roomId: string }` | Marks all unread messages in the room as read (sent by the recipient). |
| Server → Client | `messagesRead` | `{ roomId: string, readBy: string }` | Notifies the sender that their messages have been read. |
| Server → Client | `userStatus` | `{ userId: string, online: boolean, lastSeen: string \| null }` | Presence update — `online: true` when user connects, `false` + `lastSeen` ISO timestamp on disconnect. Check if `userId !== myId` to update the other participant's status. |

### Flow

```dart
// 0. On connect, receive your user ID
socket.on('userConnected', (user) {
  myUserId = user.id;
});

// 1. Join a room with an HCP
socket.emit('joinPrivateChat', { 'recipientId': hcpObjectId });

// 2. Listen for the room response
socket.on('roomJoined', (data) {
  setState(() => currentRoomId = data['roomId']);
});

// 3. Send a message
socket.emit('sendMessage', {
  'roomId': currentRoomId,
  'content': 'Hello doctor!',
});

// 3b. Send a reply (include parentMessageId)
socket.emit('sendMessage', {
  'roomId': currentRoomId,
  'content': 'Thanks!',
  'parentMessageId': originalMessageId,
});

// 3c. Edit your own text message
socket.emit('editMessage', {
  'roomId': currentRoomId,
  'messageId': msgId,
  'content': 'Updated text',
});

// 3d. Delete a message
socket.emit('deleteMessage', {
  'roomId': currentRoomId,
  'messageId': msgId,
  'deleteFor': 'everyone', // or 'me'
});

// 4. Receive messages
socket.on('newMessage', (msg) {
  messages.add(ChatMessage.fromJson(msg));
});

// 4b. Handle edited messages
socket.on('messageEdited', ({ id, content, edited }) {
  final index = messages.indexWhere((m) => m.id == id);
  if (index != -1) {
    messages[index].content = content;
    messages[index].edited = edited;
    setState(() {});
  }
});

// 4c. Handle deleted messages
socket.on('messageDeleted', ({ id, deletedForEveryone }) {
  if (deletedForEveryone) {
    final index = messages.indexWhere((m) => m.id == id);
    if (index != -1) {
      messages[index].deletedForEveryone = true;
      messages[index].content = 'This message was deleted';
      setState(() {});
    }
  } else {
    messages.removeWhere((m) => m.id == id);
    setState(() {});
  }
});

// 5. Typing indicator
socket.emit('typing', { 'roomId': currentRoomId, 'isTyping': true });
socket.on('userTyping', (data) {
  // show/hide typing indicator based on data['isTyping']
});

// 6. Audio recording indicator
socket.emit('audioRecording', { 'roomId': currentRoomId, 'isRecording': true });
socket.on('userAudioRecording', (data) {
  // show/hide recording indicator based on data['isRecording']
});

// 7. Mark messages as read when viewing a room
socket.emit('markRead', { 'roomId': currentRoomId });
socket.on('messagesRead', ({ roomId, readBy }) {
  // Update read receipts — messages where senderId == myUserId now show double ticks
});

// 8. Listen for presence updates
socket.on('userStatus', ({ userId, online, lastSeen }) {
  if (userId != myUserId) {
    setStatus(online ? 'Online' : 'last seen ${formatTime(lastSeen)}');
  }
});
```

---

## HTTP Endpoints

Base URL: `https://api.example.com/api/v1`

### List Chat Sessions (Paginated)

```http
GET /chat/client/sessions?page=1&limit=10
Authorization: Bearer <firebase-token>
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
          "id": "66f1a2b3c4d5e6f7a8b9c0d1",
          "name": "Dr. John Doe",
          "role": "hcp"
        },
        "latestMessage": {
          "id": "77a1b2c3d4e5f6a7b8c9d0e2",
          "content": "Hello, how are you?",
          "messageType": "text",
          "senderId": "66f1a2b3c4d5e6f7a8b9c0d1",
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

Sorted by most recent message/activity first. `latestMessage` is `null` if no messages yet.

### Get Message History (Paginated)

```http
GET /chat/client/rooms/{roomId}/messages?page=1&limit=20
Authorization: Bearer <firebase-token>
```

| Param | Type | Required | Description |
|---|---|---|---|
| `roomId` | path | yes | MongoDB ObjectId of the room |
| `page` | query | no | The page number to fetch (default: 1) |
| `limit` | query | no | Number of messages per page (default: 20) |

**Pagination**: Messages are returned sorted by `createdAt: -1` (newest first). Page 1 will contain the most recent messages.

**Response**
```json
{
  "success": true,
  "data": {
    "rows": [
      {
        "id": "66a1b2c3d4e5f6a7b8c9d0e1",
        "senderId": "user_abc123",
        "roomId": "66a1b2c3d4e5f6a7b8c9d0e1",
        "messageType": "text",
        "content": "Hello doctor!",
        "isRead": true,
        "parentMessageId": {
          "id": "66a1b2c3d4e5f6a7b8c9d0e1",
          "content": "Original message",
          "senderId": "user_abc123",
          "messageType": "text"
        },
        "edited": false,
        "deletedForEveryone": false,
        "deletedFor": [],
        "createdAt": "2026-07-02T10:30:00.000Z",
        "updatedAt": "2026-07-02T10:30:00.000Z"
      }
    ],
    "total": 1,
    "pageSize": 20,
    "page": 1,
    "nextPage": null,
    "prevPage": null,
    "totalPages": 1
  },
  "message": "Messages fetched successfully"
}
```

### Upload Media

```http
POST /chat/client/rooms/{roomId}/media
Authorization: Bearer <firebase-token>
Content-Type: multipart/form-data

file: <binary>
parentMessageId: <optional - string>
```

| Field | Type | Required | Description |
|---|---|---|---|
| `roomId` | path | yes | Room to upload to |
| `file` | file | yes | Max 50 MB — jpeg, jpg, png, gif, mp4, mpeg, m4a, mp3, quicktime, webm |
| `parentMessageId` | query | no | If this media is a reply to another message |

Returns the saved `ChatMessage` with a signed Firebase Storage URL in `content`. Media URLs (here and in history) **expire after 15 minutes** — re-fetch history rather than caching them. Files over 50 MB are rejected with `413`.
