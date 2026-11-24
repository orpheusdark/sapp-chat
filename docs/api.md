# API and events

Base `BACKEND_ORIGIN/api`. Protected requests use `Authorization: Bearer TOKEN`. Errors use `{error:"message"}`. IDs are ObjectId strings, dates ISO 8601. Sender identity always comes from the JWT.

| Method | Route                                            | Input / result                                              |
| ------ | ------------------------------------------------ | ----------------------------------------------------------- |
| GET    | `/health`                                        | `{status:"ok"}` or 503                                      |
| POST   | `/auth/register`                                 | `{name,email,password}` -> 201 `{user,token}`               |
| POST   | `/auth/login`                                    | `{email,password}` -> `{user,token}`                        |
| GET    | `/auth/me`                                       | Public current user                                         |
| GET    | `/users?q=jamie`                                 | Up to 20 matches, excluding self                            |
| GET    | `/conversations`                                 | Member chats with members, preview, readSeq and unreadCount |
| POST   | `/conversations/direct`                          | `{userId}` -> existing/new private chat (200)               |
| POST   | `/conversations/group`                           | `{name,memberIds:[id,id]}` -> group (201), creator included |
| POST   | `/conversations/:id/members`                     | `{userId}` -> group, admin only; idempotent addition        |
| GET    | `/conversations/:id/messages?limit=30&before=42` | Older page                                                  |
| GET    | `/conversations/:id/messages?limit=100&after=42` | Forward catch-up                                            |
| POST   | `/conversations/:id/messages`                    | `{text,clientId:UUID}` -> Message (201, retry 200)          |
| POST   | `/conversations/:id/images`                      | multipart `image`, `clientId`, optional `text` -> Message   |
| POST   | `/conversations/:id/read`                        | `{seq:integer}` -> `{seq}`, monotonic watermark             |

History returns `{messages:[...],nextCursor:number|null}` in ascending display order. Pass nextCursor as `before` for older history or `after` for catch-up. Do not combine both. Limits are 1–100, default 30. Sequence cursors remain stable during new inserts.

Message: `_id`, `conversation`, populated `sender`, `seq`, `clientId`, `text`, optional `image:{url,publicId,width,height}`, timestamps. The same `(conversation,sender,clientId)` is stored once. Retry an unchanged operation with the same UUID; an edited draft is a new operation.

Validation: names 2–60, emails <=254, passwords 8–128 (not trimmed), group names 2–80, groups 3–100 people, text <=4000, JSON <=32 KB. Images <=5 MB and signatures JPEG/PNG/GIF/WebP only. No arbitrary image URL attachments. Empty text requires an image.

Status codes: 400 validation, 401 token/credentials, 403 origin/admin restriction, 404 inaccessible/missing conversation, 409 email conflict, 413 upload size, 429 rate limit, 503 missing Cloudinary configuration. Internal errors are masked.

## Socket.io

`io(BACKEND_ORIGIN,{auth:{token}})`. JWT verified before connecting; sockets disconnect at expiry. No token query parameter. Browser origins are checked. The server joins a personal `user:ID` room and authorized `conversation:ID` rooms, then emits `session:ready`. Creation/addition dynamically subscribes member sockets.

Client events acknowledge with `{data:...}` or `{error:"..."}`:

| Event               | Payload                           |
| ------------------- | --------------------------------- |
| `conversation:join` | `{conversationId}`                |
| `message:send`      | `{conversationId,text,clientId}`  |
| `conversation:read` | `{conversationId,seq}`            |
| `typing`            | `{conversationId,active:boolean}` |

Server events:

| Event                  | Payload                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `session:ready`        | Refresh memberships and catch up                              |
| `message:new`          | Committed Message, conversation room only                     |
| `conversation:updated` | `{conversationId}`, refresh metadata                          |
| `conversation:read`    | `{conversationId,userId,seq}`                                 |
| `presence`             | Online user IDs; counts multiple sockets                      |
| `typing`               | `{conversationId,userId,name,active}`, receiver timeout ~3.2s |

Reconcile REST responses/socket echoes by `_id` and order by `seq`. A group read receipt means at least one other member has read it. Presence is visible to authenticated accounts; typing is ephemeral. REST rate limits are per IP; socket limits per connection. All incoming chat actions check membership; do not trust client-provided sender fields.
