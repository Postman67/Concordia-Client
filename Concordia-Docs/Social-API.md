# Concordia-Social — API Reference

> **Last updated:** March 13, 2026 · [Changelog](social-api-changelog.md)

> Authentication is handled entirely by the [Federation](Federation-API.md).
> Log in there, then pass the resulting JWT to every request here.
> Concordia-Social stores no passwords, emails, or display names — only Federation user UUIDs.

Base URL: `https://social.concordiachat.com` (local: `http://localhost:3001`)

All request and response bodies are JSON.

---

## Authentication

Every protected endpoint (`🔒`) requires a Federation JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are obtained from the Federation (`POST /api/auth/login`). Social verifies them locally — no round-trip to the Federation is needed per request.

---

## Health Check

### `GET /health`

Public. Returns service uptime status.

**`200 OK`**
```json
{ "status": "ok", "timestamp": "2026-03-13T10:00:00.000Z" }
```

---

## Users — `/api/users`

### `GET /api/users/search` 🔒

Search for Concordia users by username prefix. Used to find someone before sending a friend request. Results come directly from the Federation.

**Query parameters**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | ✅ | Username prefix to search (case-insensitive) |

**`200 OK`**
```json
{
  "users": [
    {
      "id": "a3f8c21d-7e44-4b1c-9f02-3d5e6a8b1c0f",
      "username": "petersmith",
      "display_name": "Peter",
      "avatar_url": "https://example.com/avatar.png",
      "banner_url": null,
      "bio": "Building Concordia.",
      "status": "online",
      "profile_link": "https://github.com/Postman67"
    }
  ]
}
```

`users` is an empty array `[]` when nothing matches.

**`400`** Missing or empty `q` · **`401`** Unauthorized · **`502`** Federation unreachable

---

## Friends — `/api/friends`

### `GET /api/friends` 🔒

Returns all accepted friends for the current user with hydrated Federation profiles.

**`200 OK`**
```json
{
  "friends": [
    {
      "friendship_id": "f1b2c3d4-...",
      "since": "2026-03-10T12:00:00.000Z",
      "user": {
        "id": "a3f8c21d-...",
        "username": "alice",
        "display_name": "Alice",
        "avatar_url": "https://example.com/alice.png",
        "banner_url": null,
        "bio": null,
        "status": "online",
        "profile_link": null
      }
    }
  ]
}
```

**`401`** Unauthorized · **`500`** Server error

---

### `GET /api/friends/incoming` 🔒

Returns all pending friend requests sent **to** the current user.

**`200 OK`**
```json
{
  "requests": [
    {
      "friendship_id": "f1b2c3d4-...",
      "sent_at": "2026-03-13T09:00:00.000Z",
      "from": {
        "id": "b7e2d14f-...",
        "username": "bob",
        "display_name": "Bob",
        "avatar_url": null,
        "banner_url": null,
        "bio": null,
        "status": "offline",
        "profile_link": null
      }
    }
  ]
}
```

**`401`** Unauthorized · **`500`** Server error

---

### `GET /api/friends/outgoing` 🔒

Returns all pending friend requests the current user has **sent**.

**`200 OK`**
```json
{
  "requests": [
    {
      "friendship_id": "f1b2c3d4-...",
      "sent_at": "2026-03-13T09:00:00.000Z",
      "to": {
        "id": "c9f3e25a-...",
        "username": "carol",
        "display_name": "Carol",
        "avatar_url": null,
        "banner_url": null,
        "bio": null,
        "status": "idle",
        "profile_link": null
      }
    }
  ]
}
```

**`401`** Unauthorized · **`500`** Server error

---

### `POST /api/friends/requests` 🔒

Send a friend request to another user.

**Request body**

| Field | Type | Rules |
|-------|------|-------|
| `addressee_id` | string | **Required.** Federation UUID of the target user. |

```json
{ "addressee_id": "b7e2d14f-3c55-4a2b-8e01-1f4d7b9c2e1a" }
```

**`201 Created`** — request sent
```json
{ "message": "Friend request sent.", "friendship_id": "f1b2c3d4-..." }
```

**`200 OK`** — the other user had already sent you a request; it has been auto-accepted
```json
{ "message": "Friend request accepted (mutual)." }
```

> When auto-accepted, both users receive a `fr:accepted` WebSocket event and a DM conversation is automatically created.

| Status | Meaning |
|--------|---------|
| `400` | Missing `addressee_id`, or sending to yourself |
| `401` | Unauthorized |
| `404` | Target user not found on the Federation |
| `409` | Already friends, or request already pending |
| `429` | Cooldown active — wait 24 hours after a declined request before re-sending |
| `502` | Federation unreachable |
| `500` | Server error |

---

### `PATCH /api/friends/requests/:friendship_id` 🔒

Accept or decline a **pending** friend request sent **to you**.

**Request body**

| Field | Type | Rules |
|-------|------|-------|
| `action` | string | **Required.** `"accept"` or `"decline"` |

```json
{ "action": "accept" }
```

**`200 OK`**
```json
{ "message": "Friend request accepted." }
```

> On accept, the requester receives a `fr:accepted` WebSocket event and a DM conversation is automatically created for the pair.
> On decline, the requester receives a `fr:declined` WebSocket event.

| Status | Meaning |
|--------|---------|
| `400` | Invalid `action` value |
| `401` | Unauthorized |
| `403` | The request was not sent to you |
| `404` | Friend request not found |
| `409` | Request is no longer pending |
| `500` | Server error |

---

### `DELETE /api/friends/:friendship_id` 🔒

Remove an accepted friend. Either user in the friendship can call this.

**`204 No Content`** on success.

| Status | Meaning |
|--------|---------|
| `401` | Unauthorized |
| `404` | Friendship not found or not accepted |
| `500` | Server error |

---

## Conversations — `/api/conversations`

### `GET /api/conversations` 🔒

Returns all DM conversations for the current user, ordered by most-recently-active first. Includes a preview of the last message in each conversation.

**`200 OK`**
```json
{
  "conversations": [
    {
      "id": "c1d2e3f4-...",
      "with": {
        "id": "a3f8c21d-...",
        "username": "alice",
        "display_name": "Alice",
        "avatar_url": "https://example.com/alice.png",
        "banner_url": null,
        "bio": null,
        "status": "online",
        "profile_link": null
      },
      "last_message": {
        "id": 42,
        "content": "Hey, are you around?",
        "sender_id": "a3f8c21d-...",
        "sent_at": "2026-03-13T11:30:00.000Z"
      },
      "created_at": "2026-03-10T12:00:00.000Z"
    }
  ]
}
```

`last_message` is `null` for conversations that have no messages yet.

**`401`** Unauthorized · **`500`** Server error

---

### `POST /api/conversations` 🔒

Open (or retrieve an existing) 1:1 DM conversation with another user. Safe to call multiple times — always returns the same conversation for a given pair.

**Request body**

| Field | Type | Rules |
|-------|------|-------|
| `user_id` | string | **Required.** Federation UUID of the other user. |

```json
{ "user_id": "a3f8c21d-7e44-4b1c-9f02-3d5e6a8b1c0f" }
```

**`200 OK`**
```json
{
  "conversation": {
    "id": "c1d2e3f4-...",
    "user_id_a": "a3f8c21d-...",
    "user_id_b": "b7e2d14f-...",
    "created_at": "2026-03-10T12:00:00.000Z"
  }
}
```

| Status | Meaning |
|--------|---------|
| `400` | Missing `user_id`, or trying to DM yourself |
| `401` | Unauthorized |
| `500` | Server error |

---

### `GET /api/conversations/:id` 🔒

Returns a single conversation with the other participant's hydrated profile. Only accessible to participants.

**`200 OK`**
```json
{
  "conversation": {
    "id": "c1d2e3f4-...",
    "user_id_a": "a3f8c21d-...",
    "user_id_b": "b7e2d14f-...",
    "created_at": "2026-03-10T12:00:00.000Z",
    "with": {
      "id": "a3f8c21d-...",
      "username": "alice",
      "display_name": "Alice",
      "avatar_url": "https://example.com/alice.png",
      "banner_url": null,
      "bio": null,
      "status": "online",
      "profile_link": null
    }
  }
}
```

**`401`** Unauthorized · **`404`** Conversation not found or not a participant · **`500`** Server error

---

### `GET /api/conversations/:id/messages` 🔒

Fetches message history for a conversation. Returns messages in **chronological order** (oldest first). Only accessible to participants.

**Query parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | `50` | Max messages to return (capped at 200) |
| `before` | message ID | — | Return messages with an ID lower than this (pagination cursor) |

**`200 OK`**
```json
{
  "messages": [
    {
      "id": 41,
      "sender_id": "b7e2d14f-...",
      "content": "Hey!",
      "is_edited": false,
      "created_at": "2026-03-13T11:29:00.000Z",
      "edited_at": null
    },
    {
      "id": 42,
      "sender_id": "a3f8c21d-...",
      "content": "Hey, are you around?",
      "is_edited": false,
      "created_at": "2026-03-13T11:30:00.000Z",
      "edited_at": null
    }
  ]
}
```

**Pagination — load older messages**

Take the `id` of the oldest message you currently have and pass it as `before`:

```
GET /api/conversations/c1d2e3f4-.../messages?limit=50&before=41
```

**`401`** Unauthorized · **`404`** Conversation not found or not a participant · **`500`** Server error

---

## Messages — `/api/messages`

These REST endpoints are an alternative to the socket `dm:edit` / `dm:delete` events. Either approach works — both broadcast real-time updates to the conversation room.

> **Authorization rule:** A user can only edit or delete their **own** messages. There are no roles or elevated permissions in DMs.

---

### `PATCH /api/messages/:id` 🔒

Edit the content of your own message.

**Request body**

| Field | Type | Rules |
|-------|------|-------|
| `content` | string | **Required.** 1–2000 characters. |

```json
{ "content": "Updated message content." }
```

**`200 OK`**
```json
{
  "id": 42,
  "conversation_id": "c1d2e3f4-...",
  "content": "Updated message content.",
  "is_edited": true,
  "edited_at": "2026-03-13T11:35:00.000Z"
}
```

Also broadcasts a `dm:edited` event to all sockets in the conversation room.

| Status | Meaning |
|--------|---------|
| `400` | Invalid message ID, missing content, or content exceeds 2000 chars |
| `401` | Unauthorized |
| `404` | Message not found, or it is not your message |
| `500` | Server error |

---

### `DELETE /api/messages/:id` 🔒

Delete your own message.

**`204 No Content`** on success.

Also broadcasts a `dm:deleted` event to all sockets in the conversation room.

| Status | Meaning |
|--------|---------|
| `400` | Invalid message ID |
| `401` | Unauthorized |
| `404` | Message not found, or it is not your message |
| `500` | Server error |

---

## WebSocket Events

Socket URL: `wss://social.concordiachat.com`
Library: [Socket.io v4](https://socket.io/docs/v4/)

### Connection

Authenticate by passing the Federation JWT in the `auth` handshake option:

```js
import { io } from 'socket.io-client';

const socket = io('https://social.concordiachat.com', {
  auth: { token: '<federation_jwt>' }
});

socket.on('connect_error', (err) => {
  // err.message: 'Authentication required.' or 'Invalid or expired token.'
});
```

On successful connection the socket is automatically placed in `user:<userId>` — a personal room used for friend request notifications.

---

### Rooms

| Room | Joined by | Used for |
|------|-----------|----------|
| `user:<userId>` | Automatically on connect | FR notifications targeted at you |
| `conv:<conversationId>` | Emitting `dm:join` | Real-time messages and typing in a conversation |

---

### Client → Server events

#### `dm:join`

Join a conversation room to receive real-time messages. The socket must join before sending, editing, or deleting.

**Payload:** `conversationId` (string — UUID)

```js
socket.emit('dm:join', 'c1d2e3f4-...');
socket.on('dm:joined', ({ conversationId }) => console.log('Joined', conversationId));
```

The server verifies the caller is a participant. If not, an `error` event is emitted.

---

#### `dm:leave`

Leave a conversation room.

**Payload:** `conversationId` (string — UUID)

```js
socket.emit('dm:leave', 'c1d2e3f4-...');
```

---

#### `dm:send`

Send a message to a conversation. The socket must have joined the room first.

**Payload**

| Field | Type | Rules |
|-------|------|-------|
| `conversationId` | string | **Required.** UUID |
| `content` | string | **Required.** 1–2000 characters |

```js
socket.emit('dm:send', { conversationId: 'c1d2e3f4-...', content: 'Hello!' });
```

On success, `dm:new` is broadcast to everyone in the room (including the sender).

---

#### `dm:edit`

Edit one of your own messages. Equivalent to `PATCH /api/messages/:id`.

**Payload**

| Field | Type | Rules |
|-------|------|-------|
| `messageId` | number | **Required.** |
| `content` | string | **Required.** 1–2000 characters |

```js
socket.emit('dm:edit', { messageId: 42, content: 'Updated content.' });
```

On success, `dm:edited` is broadcast to everyone in the room.

---

#### `dm:delete`

Delete one of your own messages. Equivalent to `DELETE /api/messages/:id`.

**Payload**

| Field | Type | Rules |
|-------|------|-------|
| `messageId` | number | **Required.** |

```js
socket.emit('dm:delete', { messageId: 42 });
```

On success, `dm:deleted` is broadcast to everyone in the room.

---

#### `typing:start`

Notify the other participant that you are typing.

**Payload:** `conversationId` (string — UUID)

```js
socket.emit('typing:start', 'c1d2e3f4-...');
```

---

#### `typing:stop`

Notify the other participant that you have stopped typing. Also call this when a message is sent.

**Payload:** `conversationId` (string — UUID)

```js
socket.emit('typing:stop', 'c1d2e3f4-...');
```

---

### Server → Client events

#### `dm:joined`

Room: **requesting socket only**
Confirmation that you successfully joined a conversation room.

```json
{ "conversationId": "c1d2e3f4-..." }
```

---

#### `dm:new`

Room: **conv:\<conversationId\>** (all participants in the room)
Fired when a new message is sent via `dm:send`.

```json
{
  "id": 43,
  "conversation_id": "c1d2e3f4-...",
  "sender_id": "a3f8c21d-...",
  "content": "Hello!",
  "is_edited": false,
  "created_at": "2026-03-13T11:40:00.000Z"
}
```

---

#### `dm:edited`

Room: **conv:\<conversationId\>** (all participants in the room)
Fired when a message is edited via `dm:edit` or `PATCH /api/messages/:id`.

```json
{
  "id": 42,
  "conversation_id": "c1d2e3f4-...",
  "content": "Updated content.",
  "is_edited": true,
  "edited_at": "2026-03-13T11:35:00.000Z"
}
```

---

#### `dm:deleted`

Room: **conv:\<conversationId\>** (all participants in the room)
Fired when a message is deleted via `dm:delete` or `DELETE /api/messages/:id`.

```json
{
  "message_id": 42,
  "conversation_id": "c1d2e3f4-..."
}
```

---

#### `typing:update`

Room: **conv:\<conversationId\>** (other participants only — not the sender)
Fired in response to `typing:start` / `typing:stop`.

```json
{
  "conversationId": "c1d2e3f4-...",
  "user": { "id": "a3f8c21d-..." },
  "isTyping": true
}
```

---

#### `fr:received`

Room: **user:\<userId\>** (addressee only)
Fired when another user sends you a friend request.

```json
{
  "friendship_id": "f1b2c3d4-...",
  "from": { "id": "b7e2d14f-..." }
}
```

---

#### `fr:accepted`

Room: **user:\<userId\>** (both users)
Fired when a friend request is accepted (either via `PATCH /api/friends/requests/:id` or auto-accepted when both users send requests simultaneously).

```json
{ "friendship_id": "f1b2c3d4-..." }
```

---

#### `fr:declined`

Room: **user:\<userId\>** (requester only)
Fired when the addressee declines a pending friend request.

```json
{ "friendship_id": "f1b2c3d4-..." }
```

---

#### `error`

Room: **requesting socket only**
Emitted when any socket operation fails.

```json
{ "message": "Conversation not found." }
```
