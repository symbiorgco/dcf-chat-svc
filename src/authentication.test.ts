import assert from "node:assert/strict";
import test from "node:test";

test("chat/mod actions require auth/admin boundary: missing auth token rejects chat actions", async () => {
  const { getWalletIdFromAuthToken, verifyJwt } = await import(
    "./authentication"
  );

  assert.equal(getWalletIdFromAuthToken(undefined), undefined);
  assert.equal(await verifyJwt(undefined), undefined);
});

test("chat/mod actions require auth/admin boundary: invalid auth token rejects chat actions", async () => {
  const { getWalletIdFromAuthToken, verifyJwt } = await import(
    "./authentication"
  );

  assert.equal(getWalletIdFromAuthToken("Bearer not-a-valid-jwt"), undefined);
  assert.equal(await verifyJwt("Bearer not-a-valid-jwt"), undefined);
});
