/**
 * `@cambio/ui` — the design-system generic core (17 components) + styles.
 *
 * May not import anything app-specific (lint-enforced): no `@cambio/domain`,
 * no `@cambio/application`, no `@cambio/contracts`. Components take props;
 * they do not know what a Cambio is. Game objects live in `apps/web`.
 *
 * This is a "just-in-time" package — it ships TypeScript source and is
 * compiled by the consuming app's bundler, so there is no build step.
 */
export * from "./components/alert.js"
export * from "./components/app-shell.js"
export * from "./components/badge.js"
export * from "./components/button.js"
export * from "./components/divider.js"
export * from "./components/empty-state.js"
export * from "./components/field-scaffold.js"
export * from "./components/link.js"
export * from "./components/list.js"
export * from "./components/loading.js"
export * from "./components/modal.js"
export * from "./components/panel.js"
export * from "./components/select.js"
export * from "./components/table.js"
export * from "./components/text-field.js"
export * from "./components/toast.js"
export * from "./components/toggle.js"
export * from "./lib/utils.js"
