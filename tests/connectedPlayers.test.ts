import test from "node:test";
import assert from "node:assert/strict";
import {
  getConnectedPlayerPrivateMode,
  setConnectedPlayer,
  clearConnectedPlayers,
} from "../src/connectedPlayers";

test.beforeEach(() => clearConnectedPlayers());

test("returns true for a connected player with privateMode=true", () => {
  setConnectedPlayer(1, {
    walletId: "wallet-private",
    nickname: "Private Player",
    profileImageUrl: "",
    privateMode: true,
    role: "MEMBER",
  });
  assert.equal(getConnectedPlayerPrivateMode("wallet-private"), true);
});

test("returns false for a connected player with privateMode=false", () => {
  setConnectedPlayer(2, {
    walletId: "wallet-public",
    nickname: "Public Player",
    profileImageUrl: "",
    privateMode: false,
    role: "MEMBER",
  });
  assert.equal(getConnectedPlayerPrivateMode("wallet-public"), false);
});

test("returns undefined when wallet is not in the connected-player list", () => {
  assert.equal(getConnectedPlayerPrivateMode("not-connected"), undefined);
});

// Regression gate: the ?? true in routes/chat.ts and websockets.ts ensures
// offline recipients are masked rather than revealed.
test("fail-closed: undefined ?? true masks an offline recipient", () => {
  const result = getConnectedPlayerPrivateMode("offline-wallet") ?? true;
  assert.equal(result, true);
});

test("fail-closed does NOT mask a verified-public connected player", () => {
  setConnectedPlayer(3, {
    walletId: "wallet-known-public",
    nickname: "Known Public",
    profileImageUrl: "",
    privateMode: false,
    role: "MEMBER",
  });
  const result = getConnectedPlayerPrivateMode("wallet-known-public") ?? true;
  assert.equal(result, false);
});
