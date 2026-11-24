# Requirements and implementation plan

Source inspected directly: Realtime Chat App _ Sapphire IQ.pdf, nine pages. Pages 4–8 define the five modules; pages 2 and 9 define the combined outcome.

1. React/Vite client, Express/Mongoose backend, User/Conversation/Message models, JWT registration/login, protected API and client routes.
2. User search, unique private conversations, group conversations, REST send/load, cursor-paginated persisted history, sidebar and composer.
3. JWT-authenticated Socket.io connections, membership-authorized conversation rooms, database commit before broadcast.
4. Multi-socket online presence, expiring typing indicators, persisted per-conversation read sequence and unread counts.
5. Admin-only member additions, validated Multer/Cloudinary image messages, Vercel client and Render WebSocket backend configuration with exact-origin CORS.

Validation: database-backed integration tests with a disposable replica set; real Socket.io clients; frontend tests, production build, and two-user browser smoke test. MongoDB transactions require Atlas or a replica set. No deployment is claimed without running it using supplied credentials.
