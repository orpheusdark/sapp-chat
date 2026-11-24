# Design and consistency

**User:** name, normalized unique email, non-selected bcrypt hash. **Conversation:** members, group name/admin or canonical unique directKey, sequence, member readSeq map, preview. **Message:** conversation, authenticated sender, sequence, retry UUID, text, server-generated image metadata, timestamps.

Unique indexes protect directKey, `(conversation,seq)` and `(conversation,sender,clientId)`. Indexes initialize before listening. Concurrent chat creation/retries are verified against MongoDB.

## Save before emit

The shared send service checks membership/retry, increments the sequence, updates the preview and inserts the message in one transaction. It populates and emits only after commit. Failure rolls back both sequence and message; the integration test injects a write failure. A retry returns the original message without rebroadcasting. REST and socket sends share the service; the UI merges echoes by database ID.

Broadcasts can arrive out of order; sequence sorting restores order. A crash after commit but before emit leaves a saved message available through reconnect/visibility catch-up. A durable outbox would be needed for guaranteed background delivery without reconnect.

## Read and history

Unread counts count messages after the member's readSeq, excluding their own sends. `$max` prevents stale tabs moving read state backward. The client sends the sequence actually received while the page is visible, rather than clearing the database's current unread total. Messages after that snapshot stay unread. Read writes do not update conversation timestamps, so reading doesn't reorder the sidebar.

Member addition and sends serialize through conversation transactions; new members start readSeq at the addition point. They can view older group history. Older-history queries scan descending then return ascending display order. Reconnect catches up in ascending forward pages, even after more than 100 missed messages. Its synchronization watermark advances only through fetched history or consecutive live sequences, so a newer live event during reconnect cannot skip an older gap. Read-state writes and sidebar refreshes are batched over short windows to avoid request amplification during message bursts. A sidebar request generation prevents stale responses overwriting newer state.

## Live access

Sockets authenticate before connection, join personal/member rooms and are disconnected when the JWT expires. Every join/send/read/typing action checks membership. Member additions subscribe existing sockets before notifications. Presence counts sockets so one disconnected tab does not mark another offline. Typing is stopped on navigation, inactivity/disconnect and receiver expiry.

## Boundaries

Exact-origin CORS and WebSocket checks; JWT algorithm/issuer/audience verification; membership/admin authorization; bounded schemas; escaped literal search regexes; request/upload limits; rate limits; Helmet; masked internal errors; React text rendering. Provider secrets stay server-side. README documents sessionStorage, public-by-URL media, orphan cleanup, no global token revocation and single-instance limits.
