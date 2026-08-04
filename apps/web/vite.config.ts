import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  server: {
    // 3000 for the web app, 3001 for the API — see .env.example.
    port: Number(process.env.WEB_PORT ?? 3000),
    // Fail loudly instead of hunting for a free port. Vite's default fallback
    // walks upward and will happily land on the API's 3001, at which point the
    // web app answers health checks with HTML and the failure looks like a
    // CORS bug for half an hour.
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // React's plugin must come after Start's.
    viteReact(),
  ],
})
