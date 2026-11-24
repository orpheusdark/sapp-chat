# Vercel frontend + Render backend

Configuration is included; actual deployment needs your service accounts and environment settings. The backend is a continuously running WebSocket-capable web service. Do not deploy Socket.io as Vercel serverless functions.

## Database and images

Create an Atlas database and database user scoped to it. Copy its URI including a database name, encoding reserved characters in the password. Atlas supports transactions. Permit Render's documented outbound IPs for your region in Atlas network access. Use specific egress IPs where available.

Copy your Cloudinary cloud name, API key and API secret. The server uses authenticated SDK uploads; no unsigned browser preset is needed. Never put the secret in Vercel frontend variables. Delivery is via normal HTTPS image URLs, accessible by URL; see the README for stricter private media needs.

## Render

Import this GitHub repository as a Blueprint using `render.yaml`, or create a Node web service using the repository root:

| Setting     | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| Build       | `npm ci --workspace backend --include-workspace-root=false` |
| Start       | `npm start --workspace backend`                             |
| Health path | `/api/health`                                               |
| Node        | 22.x (latest supported patch)                               |
| Instances   | 1                                                           |

Set these backend environment variables:

| Variable                | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`              | `production`                                                         |
| `MONGODB_URI`           | Your Atlas URI                                                       |
| `JWT_SECRET`            | High-entropy secret, at least 32 characters; Blueprint generates one |
| `CLIENT_ORIGINS`        | Exact frontend origin, e.g. `https://orphchat.vercel.app`            |
| `TRUST_PROXY`           | `1` for Render's reverse proxy                                       |
| `CLOUDINARY_CLOUD_NAME` | Your cloud name                                                      |
| `CLOUDINARY_API_KEY`    | Your API key                                                         |
| `CLOUDINARY_API_SECRET` | Your API secret                                                      |

The app binds `0.0.0.0` on Render's `PORT`. REST and Socket.io share this port. Database connection and index initialization must finish before listening. Health returns 503 if MongoDB disconnects.

`CLIENT_ORIGINS` accepts comma-separated exact HTTPS origins, without paths, wildcard or trailing slash. Reserve/create your Vercel project first if you need its assigned URL; update Render if the final address differs. Save the backend URL and verify `https://YOUR-BACKEND/api/health` returns `{"status":"ok"}`. Free services may sleep and cause cold-start/reconnect delays; use an always-on plan for continuous availability.

## Vercel

Import the same repository. Keep **Root Directory at the repository root** and Framework Preset **Other**. Root `vercel.json` supplies:

- Install: `npm ci`
- Build: `npm run build`
- Output: `frontend/dist`
- SPA rewrites and security headers

Select Node 22.x. Set **`VITE_API_URL=https://YOUR-BACKEND.onrender.com`**, without `/api`. It is embedded at build time: rebuild/redeploy if it changes. Confirm direct visits and refreshes work at `/chat`, `/login` and `/register`.

Update Render `CLIENT_ORIGINS` to the final stable Vercel production origin, and restart/redeploy. Preview origins need individual allowlist entries; wildcard preview domains are deliberately unsupported. For a custom CSP allow your API HTTPS/WSS origins, Cloudinary images, `blob:` previews and Google Fonts, or self-host the fonts. No provider secret belongs in frontend settings.

## Two-device acceptance

1. Register one account per device. Start the same private chat from both devices and confirm only one conversation exists.
2. Send messages, confirm instant delivery, refresh and confirm persistence. Check the browser Network panel for a successful Socket.io WebSocket upgrade (101).
3. Check typing expiry, online/offline status, unread badges and read receipts. Closing one of multiple tabs must keep the other online.
4. Create a three-person group; members send and only admin adds. Add an online fourth user and verify immediate room delivery.
5. Share a real image and refresh. Verify Cloudinary delivery. Reject SVG and files over 5 MB.
6. Send over 30 messages, load older history. Disconnect a client, send over 30 more, reconnect and confirm all missed messages appear.
7. Sign out and check protected routes redirect to login. Review backend logs for errors without exposing secrets.

## Troubleshooting

- **CORS/socket denied:** match the address bar origin exactly in `CLIENT_ORIGINS`. Both HTTP and WebSocket handshakes check it.
- **Unreachable API:** verify the HTTPS backend origin in Vercel and rebuild after changing it. Wait for Render to wake if sleeping.
- **Transactions fail:** Atlas or replica set required; standalone MongoDB is unsupported.
- **Images 503:** configure all Cloudinary values. **502:** check provider permissions/quota. **413:** choose a smaller image.
- **429:** wait for the request window; investigate reconnect loops rather than disabling rate limits.
- **Presence differs between instances:** use one instance until shared socket/presence storage is implemented.

References: [Render WebSockets](https://render.com/docs/websocket), [Blueprint specification](https://render.com/docs/blueprint-spec), [health checks](https://render.com/docs/health-checks), [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json), [Cloudinary Node uploads](https://cloudinary.com/documentation/node_image_and_video_upload).
