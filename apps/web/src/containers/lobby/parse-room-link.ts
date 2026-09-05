/**
 * Join-by-link parsing (CAM-17 L1): a pasted room URL or a bare UUID →
 * gameId, or null for garbage. Pure and client-side only — the server
 * decides everything else (whether the room exists, is open, has space).
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseRoomLink(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === "") return null
  if (UUID_PATTERN.test(trimmed)) return trimmed.toLowerCase()

  let url: URL
  try {
    // Pasted links often lose their scheme; give the parser a fighting
    // chance without ever navigating anywhere ourselves.
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const segments = url.pathname.split("/").filter((segment) => segment !== "")
  const roomIndex = segments.indexOf("room")
  const candidate = roomIndex >= 0 ? segments[roomIndex + 1] : undefined
  return candidate !== undefined && UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : null
}
