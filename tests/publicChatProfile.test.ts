import test from "node:test";
import assert from "node:assert/strict";
import {
  toPublicChatProfile,
  ANONYMOUS_DEGEN_NAME,
  ANONYMOUS_WALLET_ID,
} from "../src/publicChatProfile";

test("masks nickname and walletId when privateMode is true", () => {
  const result = toPublicChatProfile({
    walletId: "real-wallet-abc",
    nickname: "SecretUser",
    profileImageUrl: "https://example.com/avatar.png",
    privateMode: true,
  });

  assert.equal(result.nickname, ANONYMOUS_DEGEN_NAME);
  assert.equal(result.walletId, ANONYMOUS_WALLET_ID);
  assert.equal(result.profileImageUrl, undefined);
  assert.equal(result.nickname.includes("SecretUser"), false);
  assert.equal(result.walletId.includes("real-wallet-abc"), false);
});

test("preserves nickname and walletId when privateMode is false", () => {
  const result = toPublicChatProfile({
    walletId: "public-wallet-xyz",
    nickname: "PublicUser",
    profileImageUrl: "https://example.com/pub.png",
    privateMode: false,
  });

  assert.equal(result.nickname, "PublicUser");
  assert.equal(result.walletId, "public-wallet-xyz");
  assert.equal(result.profileImageUrl, "https://example.com/pub.png");
});

test("preserves nickname and walletId when privateMode is absent", () => {
  const result = toPublicChatProfile({
    walletId: "public-wallet-xyz",
    nickname: "PublicUser",
    profileImageUrl: "https://example.com/pub.png",
  });

  assert.equal(result.nickname, "PublicUser");
  assert.equal(result.walletId, "public-wallet-xyz");
});

test("ANONYMOUS_WALLET_ID is not a valid base58 pubkey (clients must not parse it as an on-chain address)", () => {
  assert.equal(ANONYMOUS_WALLET_ID, "ANONYMOUS");
  // 'ANONYMOUS' is not 32 bytes (44 base58 chars) — downstream code must handle gracefully
  assert.ok(ANONYMOUS_WALLET_ID.length < 32);
});
