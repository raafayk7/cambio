import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// The repo keeps a single .env at the root, not one per app.
const envDir = fileURLToPath(new URL("../..", import.meta.url))

export default defineConfig(({ mode }) => {
  // "" loads every key, not just VITE_-prefixed ones, so WEB_PORT is readable
  // here. Only VITE_ vars are ever exposed to client code.
  const env = loadEnv(mode, envDir, "")
  // Empty/unset (the default) disables every tunnel accommodation below —
  // see the `allowedHosts`/`proxy` comment further down.
  const tunnelHost = env.VITE_TUNNEL_HOST?.trim() || undefined

  return {
    envDir,
    server: {
      // 3000 for the web app, 3001 for the API — see .env.example.
      port: Number(env.WEB_PORT ?? 3000),
      // Fail loudly instead of hunting for a free port. Vite's default fallback
      // walks upward and will happily land on the API's 3001, at which point the
      // web app answers health checks with HTML and the failure looks like a
      // CORS bug for half an hour.
      strictPort: true,
      // Ad-hoc tunnel support (ngrok or similar), opt-in only: set
      // VITE_TUNNEL_HOST to the tunnel's bare host (e.g.
      // "abcd-1-2-3-4.ngrok-free.app") and everything below activates;
      // leave it unset and this block is dead code — zero effect on the
      // default two-port dev setup. Exact-match (not a wildcard suffix),
      // so only THIS session's specific tunnel host is trusted, and it
      // stops being trusted the moment the var is cleared or changed.
      ...(tunnelHost
        ? {
            // Past Vite's DNS-rebinding check, which otherwise 403s any
            // Host header it doesn't recognize.
            allowedHosts: [tunnelHost],
            // Routes the API and realtime WS through this same origin.
            // Needed because two independent tunnel subdomains count as
            // cross-SITE under the public suffix list, so the session
            // cookie (SameSite=Lax) would never survive a direct
            // cross-tunnel fetch — proxying sidesteps that without
            // touching the cookie's SameSite/Secure policy. Inert unless
            // the client also switches to same-origin requests (see
            // `VITE_TUNNEL_HOST` in api.ts/realtime.ts).
            proxy: {
              "/health": "http://localhost:3001",
              "/users": "http://localhost:3001",
              "/me": "http://localhost:3001",
              "/lobbies": "http://localhost:3001",
              "/games": "http://localhost:3001",
              // Realtime is multi-tenant, routed by Host header — it
              // 404s a bare "localhost" Host (see docker-compose.yml's
              // realtime healthcheck note), so the proxy target must be
              // the exact host the tenant is registered under, with
              // changeOrigin so that becomes the outbound Host header
              // instead of the tunnel's.
              "/socket": {
                target: "http://realtime-dev.localhost:4000",
                ws: true,
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
    plugins: [
      tailwindcss(),
      tanstackStart(),
      // React's plugin must come after Start's.
      viteReact(),
    ],
  }
})
