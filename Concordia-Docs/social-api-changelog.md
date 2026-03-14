# Concordia-Social API — Changelog

## v1.0.0 — March 13, 2026

Initial release.

### Friends

- `GET /api/friends` — list accepted friends with hydrated Federation profiles
- `GET /api/friends/incoming` — list pending friend requests sent to you
- `GET /api/friends/outgoing` — list pending friend requests you have sent
- `POST /api/friends/requests` — send a friend request; auto-accepts if the target had already sent you one
- `PATCH /api/friends/requests/:id` — accept or decline a pending request
- `DELETE /api/friends/:id` — unfriend

### Users

- `GET /api/users/search` — search for users by username prefix (proxied from the Federation internal API)

### Conversations

- `GET /api/conversations` — list all DM conversations ordered by most-recently-active, with last-message preview
- `POST /api/conversations` — open or retrieve the 1:1 conversation with a given user (idempotent)
- `GET /api/conversations/:id` — single conversation with hydrated participant profile
- `GET /api/conversations/:id/messages` — paginated message history (cursor-based on message ID, oldest-first)

### Messages

- `PATCH /api/messages/:id` — edit your own message
- `DELETE /api/messages/:id` — delete your own message

### WebSocket

- `dm:join` / `dm:leave` — join or leave a conversation room
- `dm:send` — send a message in real time
- `dm:edit` / `dm:delete` — edit or delete your own message in real time
- `typing:start` / `typing:stop` — typing indicators
- Server events: `dm:joined`, `dm:new`, `dm:edited`, `dm:deleted`, `typing:update`, `fr:received`, `fr:accepted`, `fr:declined`, `error`
