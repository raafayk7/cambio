import { AppShell } from "@cambio/ui"
import { createFileRoute, notFound } from "@tanstack/react-router"

import { GameSections } from "../../components/gallery/game.js"
import { GenericSections } from "../../components/gallery/generic.js"

/**
 * The component gallery (root plan F5): every design-system component in
 * every MVS state its class requires. Dev-only — production builds 404
 * (F5.2, no VITE_* var); it is also the design-gate rendered path's
 * --url input.
 */
export const Route = createFileRoute("/dev/components")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: ComponentGallery,
})

function ComponentGallery() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
        <div>
          <h1 className="font-display text-2xl">Components</h1>
          <p className="mt-1 text-sm text-ink-muted">
            The design-system core, every required state. Dev builds only.
          </p>
        </div>
        <GenericSections />
        <h1 className="font-display text-2xl">Game objects</h1>
        <GameSections />
      </div>
    </AppShell>
  )
}
