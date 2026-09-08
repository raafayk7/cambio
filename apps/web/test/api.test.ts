import { decodeSessionUser } from "@cambio/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError, apiRequest } from "../src/services/api.js"

/**
 * W1 — the service seam (CAM-17). Fetch is mocked here; every claim about
 * the wire itself (routes, statuses, bodies) is pinned by the api suites.
 */

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("apiRequest (W1)", () => {
  it("sends credentials: include on every call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { userId: "0b8f8dc1-6be5-4de1-a53c-01e8b38190b0", name: "Nadia" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    await apiRequest("/me", { decode: decodeSessionUser }).catch(() => undefined)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/me$/)
    expect(init.credentials).toBe("include")
    expect(init.method).toBe("GET")
  })

  it("JSON-encodes a POST body and sets the content-type header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(201, { userId: "6f5c1b9e-8a70-4f5e-9c69-6a2f66e3a111", name: "Nadia" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    await apiRequest("/users", {
      method: "POST",
      body: { name: "Nadia" },
      decode: decodeSessionUser,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe("POST")
    expect(init.body).toBe(JSON.stringify({ name: "Nadia" }))
    expect(init.headers).toEqual({ "content-type": "application/json" })
    expect(init.credentials).toBe("include")
  })

  it("decodes a 2xx body through the contracts schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { userId: "6f5c1b9e-8a70-4f5e-9c69-6a2f66e3a111", name: "Nadia" }),
        ),
    )

    const user = await apiRequest("/me", { decode: decodeSessionUser })
    expect(user).toEqual({ userId: "6f5c1b9e-8a70-4f5e-9c69-6a2f66e3a111", name: "Nadia" })
  })

  it("throws on an undecodable 2xx body — never silently-wrong state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { nonsense: true })))

    await expect(apiRequest("/me", { decode: decodeSessionUser })).rejects.toThrow()
  })

  it("maps a non-2xx error body to a typed ApiError {status, tag, message}", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(409, { error: { tag: "LobbyFull", message: "conflict" } })),
    )

    const failure = await apiRequest("/me", { decode: decodeSessionUser }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(ApiError)
    const apiError = failure as ApiError
    expect(apiError.status).toBe(409)
    expect(apiError.tag).toBe("LobbyFull")
    expect(apiError.message).toBe("conflict")
  })

  it("issues bare same-origin relative requests when VITE_API_URL is missing (C11)", async () => {
    // API_URL is computed at module scope, so the stubbed env must be seen by
    // a FRESH module instance: stub, reset the module registry, re-import.
    // The suite-startup import at the top of this file saw the original env.
    vi.stubEnv("VITE_API_URL", undefined)
    vi.stubEnv("VITE_TUNNEL_HOST", undefined)
    vi.resetModules()
    const freshApi = await import("../src/services/api.js")

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { userId: "0b8f8dc1-6be5-4de1-a53c-01e8b38190b0", name: "Nadia" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    await freshApi.apiRequest("/me", { decode: decodeSessionUser })

    const [url] = fetchMock.mock.calls[0] as [string]
    // The bare relative path — never a localhost-prefixed absolute URL baked
    // into a prod bundle (today's silent-failure shape, CAM-32 C11).
    expect(url).toBe("/me")
  })

  it("falls back to a generic ApiError when the error body is undecodable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("gateway exploded", { status: 502 })),
    )

    const failure = await apiRequest("/me", { decode: decodeSessionUser }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(502)
    expect((failure as ApiError).tag).toBe("Unknown")
  })
})
