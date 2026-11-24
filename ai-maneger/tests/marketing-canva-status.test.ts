import assert from "node:assert/strict";
import test from "node:test";

import { checkCanvaStatus, mapCanvaStatus } from "../lib/marketing/integration-status";
import type { MarketingStore } from "../types/marketing";

const NOW = Date.parse("2026-11-24T00:00:00.000Z");
const FUTURE = "2026-12-01T00:00:00.000Z";
const PAST = "2026-11-01T00:00:00.000Z";

function makeStore(overrides: Partial<MarketingStore> = {}): MarketingStore {
  return {
    id: "store_1",
    tenantKey: "ootsuki",
    name: "食事処おおつき",
    gbpLocationId: "17825904278186631034",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(response: Response | (() => never)) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    if (typeof response === "function") response();
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const OPTIONS = { baseUrl: "https://meo.example.com", apiKey: "secret" };

test("mapCanvaStatus reports disconnected when Canva OAuth is not configured", () => {
  assert.equal(mapCanvaStatus({ configured: false, connected: false }, NOW), "disconnected");
});

test("mapCanvaStatus reports disconnected when nobody connected Canva", () => {
  assert.equal(mapCanvaStatus({ configured: true, connected: false }, NOW), "disconnected");
});

test("mapCanvaStatus reports connected while the token is valid", () => {
  const status = mapCanvaStatus(
    { configured: true, connected: true, expiresAt: FUTURE, hasRefreshToken: false },
    NOW,
  );
  assert.equal(status, "connected");
});

test("mapCanvaStatus keeps connected when expired but a refresh token exists", () => {
  const status = mapCanvaStatus(
    { configured: true, connected: true, expiresAt: PAST, hasRefreshToken: true },
    NOW,
  );
  assert.equal(status, "connected");
});

test("mapCanvaStatus reports expired when the token cannot be refreshed", () => {
  const status = mapCanvaStatus(
    { configured: true, connected: true, expiresAt: PAST, hasRefreshToken: false },
    NOW,
  );
  assert.equal(status, "expired");
});

test("mapCanvaStatus treats a missing expiry as still connected", () => {
  const status = mapCanvaStatus({ configured: true, connected: true, expiresAt: null }, NOW);
  assert.equal(status, "connected");
});

test("checkCanvaStatus asks the MEO internal endpoint with the store location", async () => {
  const { fetchImpl, calls } = stubFetch(
    jsonResponse({ configured: true, connected: true, expiresAt: FUTURE, hasRefreshToken: true }),
  );

  const status = await checkCanvaStatus(makeStore(), { ...OPTIONS, fetchImpl, now: NOW });

  assert.equal(status, "connected");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/internal\/marketing\/canva-status\?/);
  assert.match(calls[0], /gbpLocationId=17825904278186631034/);
});

test("checkCanvaStatus falls back to canvaBrandId when the endpoint is not deployed yet", async () => {
  const { fetchImpl } = stubFetch(jsonResponse({ error: "not found" }, 404));

  const connected = await checkCanvaStatus(makeStore({ canvaBrandId: "brand_1" }), {
    ...OPTIONS,
    fetchImpl,
    now: NOW,
  });
  const disconnected = await checkCanvaStatus(makeStore(), { ...OPTIONS, fetchImpl, now: NOW });

  assert.equal(connected, "connected");
  assert.equal(disconnected, "disconnected");
});

test("checkCanvaStatus reports error when the endpoint rejects the request", async () => {
  const { fetchImpl } = stubFetch(jsonResponse({ error: "invalid bearer token" }, 403));

  const status = await checkCanvaStatus(makeStore({ canvaBrandId: "brand_1" }), {
    ...OPTIONS,
    fetchImpl,
    now: NOW,
  });

  assert.equal(status, "error");
});

test("checkCanvaStatus reports error when the request throws", async () => {
  const { fetchImpl } = stubFetch(() => {
    throw new Error("network unreachable");
  });

  const status = await checkCanvaStatus(makeStore(), { ...OPTIONS, fetchImpl, now: NOW });

  assert.equal(status, "error");
});

test("checkCanvaStatus does not call the endpoint without credentials", async () => {
  const { fetchImpl, calls } = stubFetch(jsonResponse({}));

  const status = await checkCanvaStatus(makeStore({ canvaBrandId: "brand_1" }), {
    baseUrl: "",
    apiKey: "",
    fetchImpl,
    now: NOW,
  });

  assert.equal(status, "connected");
  assert.equal(calls.length, 0);
});

test("checkCanvaStatus does not call the endpoint without a GBP location id", async () => {
  const { fetchImpl, calls } = stubFetch(jsonResponse({}));

  const status = await checkCanvaStatus(makeStore({ gbpLocationId: undefined }), {
    ...OPTIONS,
    fetchImpl,
    now: NOW,
  });

  assert.equal(status, "disconnected");
  assert.equal(calls.length, 0);
});
