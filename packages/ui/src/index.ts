/**
 * `@cambio/ui` — shadcn primitives, shared components, styles.
 *
 * May not import anything app-specific (§3.1): no `@cambio/domain`, no
 * `@cambio/application`, no `@cambio/contracts`. Components take props; they do
 * not know what a Cambio is.
 *
 * This is a "just-in-time" package — it ships TypeScript source and is compiled
 * by the consuming app's bundler, so there is no build step.
 */
export * from "./components/button.js"
export * from "./lib/utils.js"
