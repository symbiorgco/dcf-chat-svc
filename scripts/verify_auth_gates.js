#!/usr/bin/env node
// verify_auth_gates.js — behavioral test for admin-auth gates on /roles/* routes.
//
// Strategy: patch authentication.verifyJwt on the shared require-cache object
// *before* loading the router so the router picks up the stub. Starts a
// transient HTTP server on a random port, makes real HTTP requests, then tears
// it down. No test framework required — uses Node's built-in assert + http.

"use strict";

const assert = require("assert");
const http = require("http");
const express = require("express");
const path = require("path");

const distRoot = path.resolve(__dirname, "..", "dist");

// Load the authentication module FIRST so we hold a reference to the same
// exports object the router will also receive from require-cache.
const authModule = require(path.join(distRoot, "src", "authentication"));

// Stub verifyJwt — will be swapped between test cases below.
let verifyJwtStub = async () => undefined;
authModule.verifyJwt = (...args) => verifyJwtStub(...args);

// Now load the router. It `require`s authentication internally, which returns
// the same cached exports object we just patched.
const { router } = require(path.join(distRoot, "src", "routes", "chat"));

// Minimal express app wrapping the router
const app = express();
app.use(express.json());
app.use(router);

let server;
let baseUrl;

const setup = () =>
  new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

const teardown = () =>
  new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

const request = (method, path, body, headers = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });

const run = async () => {
  await setup();
  let passed = 0;

  try {
    // ── Test 1: unauthenticated request → 401 ────────────────────────────────
    verifyJwtStub = async () => undefined;
    const res401 = await request("POST", "/roles/add", { wallet: "w1", role: "MOD" });
    assert.strictEqual(res401.status, 401, `Expected 401 unauthenticated, got ${res401.status}`);
    assert.strictEqual(res401.body.code, "UNAUTHENTICATED");
    console.log("PASS: /roles/add → 401 when no valid JWT");
    passed++;

    // ── Test 2: authenticated but non-admin → 403 ─────────────────────────────
    verifyJwtStub = async () => ({ walletId: "NonAdminWallet111111111111111111111111111111111" });
    const res403 = await request("POST", "/roles/add", { wallet: "w2", role: "MOD" }, { authorization: "Bearer fake" });
    assert.strictEqual(res403.status, 403, `Expected 403 for non-admin, got ${res403.status}`);
    assert.strictEqual(res403.body.code, "ADMIN_REQUIRED");
    console.log("PASS: /roles/add → 403 when authenticated but non-admin");
    passed++;

    // ── Test 3: unauthenticated /roles/remove → 401 ───────────────────────────
    verifyJwtStub = async () => undefined;
    const res401remove = await request("POST", "/roles/remove", { wallet: "w3", role: "MOD" });
    assert.strictEqual(res401remove.status, 401, `Expected 401 for /roles/remove, got ${res401remove.status}`);
    console.log("PASS: /roles/remove → 401 when unauthenticated");
    passed++;

    // ── Test 4: unauthenticated /roles/reload → 401 ───────────────────────────
    verifyJwtStub = async () => undefined;
    const res401reload = await request("POST", "/roles/reload", {});
    assert.strictEqual(res401reload.status, 401, `Expected 401 for /roles/reload, got ${res401reload.status}`);
    console.log("PASS: /roles/reload → 401 when unauthenticated");
    passed++;

    // ── Test 5: non-admin /roles/remove → 403 ────────────────────────────────
    verifyJwtStub = async () => ({ walletId: "NonAdminWallet222222222222222222222222222222222" });
    const res403remove = await request("POST", "/roles/remove", { wallet: "w4", role: "MOD" }, { authorization: "Bearer fake" });
    assert.strictEqual(res403remove.status, 403, `Expected 403 for non-admin /roles/remove, got ${res403remove.status}`);
    console.log("PASS: /roles/remove → 403 when non-admin");
    passed++;

    console.log(`\nAuth-gate tests: ${passed} passed`);
    process.exit(0);
  } finally {
    await teardown();
  }
};

run().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
