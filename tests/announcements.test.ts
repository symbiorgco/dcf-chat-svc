import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicTipAnnouncement,
  getPublicRfpWinnerNames,
} from "../src/announcements";

const privateSender = {
  nickname: "Secret Sender",
  profileImageUrl: "https://example.com/private-sender.png",
  walletId: "sender-wallet",
  privateMode: true,
  role: "MEMBER",
};

const publicSender = {
  nickname: "Public Sender",
  profileImageUrl: "https://example.com/public-sender.png",
  walletId: "public-sender-wallet",
  role: "MEMBER",
};

test("tip announcements mask private sender and recipient names", () => {
  const projection = buildPublicTipAnnouncement(
    privateSender,
    {
      nickname: "Secret Recipient",
      profileImageUrl: "https://example.com/private-recipient.png",
      walletId: "recipient-wallet",
      privateMode: true,
    },
    0.01234,
  );

  assert.equal(
    projection.message,
    "Anonymous Degen tipped 0.012 SOL to Anonymous Degen!",
  );
  assert.deepEqual(projection.metadata, {
    type: "tip",
    amount: "0.012",
    from: "Anonymous Degen",
    to: "Anonymous Degen",
  });
  assert.equal(projection.message.includes("Secret Sender"), false);
  assert.equal(projection.message.includes("Secret Recipient"), false);
});

test("tip announcements preserve non-private nicknames", () => {
  const projection = buildPublicTipAnnouncement(
    publicSender,
    {
      nickname: "Public Recipient",
      profileImageUrl: "https://example.com/public-recipient.png",
      walletId: "recipient-wallet",
    },
    1,
  );

  assert.equal(
    projection.message,
    "Public Sender tipped 1.000 SOL to Public Recipient!",
  );
  assert.deepEqual(projection.metadata, {
    type: "tip",
    amount: "1.000",
    from: "Public Sender",
    to: "Public Recipient",
  });
});

test("RFP winner names mask private profiles and preserve public profiles", () => {
  const playerNames = getPublicRfpWinnerNames([
    {
      walletId: "private-winner-wallet",
      profile: {
        nickname: "Secret Winner",
        profileImageUrl: "https://example.com/private-winner.png",
        privateMode: true,
      },
    },
    {
      walletId: "public-winner-wallet",
      profile: {
        nickname: "Public Winner",
        profileImageUrl: "https://example.com/public-winner.png",
      },
    },
    {
      walletId: "missing-profile-wallet",
    },
  ]);

  assert.deepEqual(playerNames, [
    "Anonymous Degen",
    "Public Winner",
    "UNKNOWN",
  ]);
});

// Real data-source shape: fetchPersonasProfile does NOT return privateMode; the caller
// must populate it from the connected-player cache (getConnectedPlayerPrivateMode).
// These tests fail without the fix that spreads privateMode from the lookup.

test("tip recipient masked when privateMode populated from connected-player lookup (real data-source shape)", () => {
  // Simulates: personas profile (no privateMode) + getConnectedPlayerPrivateMode returns true
  const personasShape = {
    nickname: "Secret Recipient",
    aboutMe: "private user",
    profileImageUrl: "https://example.com/pic.png",
    // privateMode absent from personas API
  };

  const projection = buildPublicTipAnnouncement(
    publicSender,
    {
      ...personasShape,
      walletId: "private-recipient-wallet",
      privateMode: true, // injected by getConnectedPlayerPrivateMode in the fixed route
    },
    0.5,
  );

  assert.equal(
    projection.message.includes("Secret Recipient"),
    false,
    "private recipient nickname must not appear in announcement",
  );
  assert.equal(projection.metadata.to, "Anonymous Degen");
  assert.equal(projection.metadata.from, "Public Sender");
});

test("RFP winner masked when privateMode populated from connected-player lookup (real data-source shape)", () => {
  // Simulates: personas profile (no privateMode) + getConnectedPlayerPrivateMode returns true
  const personasShape = {
    nickname: "Secret Winner",
    aboutMe: "private user",
    profileImageUrl: "https://example.com/pic.png",
    // privateMode absent from personas API
  };

  const playerNames = getPublicRfpWinnerNames([
    {
      walletId: "private-winner-wallet",
      profile: {
        ...personasShape,
        privateMode: true, // injected by getConnectedPlayerPrivateMode in the fixed websockets handler
      },
    },
    {
      walletId: "public-winner-wallet",
      profile: { nickname: "Public Winner" },
    },
  ]);

  assert.deepEqual(playerNames, ["Anonymous Degen", "Public Winner"]);
  assert.equal(
    playerNames.includes("Secret Winner"),
    false,
    "private winner nickname must not appear in RFP broadcast",
  );
});

// Offline / disconnected user path: getConnectedPlayerPrivateMode returns undefined,
// caller applies ?? true (fail-closed). These tests verify that fail-closed privateMode
// correctly masks the user in announcements.

test("tip recipient masked when offline — fail-closed privateMode (undefined ?? true → masked)", () => {
  // Simulates: tip recipient is not connected to chat; getConnectedPlayerPrivateMode
  // returns undefined; the route now applies ?? true so privateMode is true.
  const projection = buildPublicTipAnnouncement(
    publicSender,
    {
      nickname: "Offline Private User",
      profileImageUrl: "https://example.com/offline.png",
      walletId: "offline-wallet",
      privateMode: true, // result of getConnectedPlayerPrivateMode(walletId) ?? true
    },
    0.25,
  );

  assert.equal(
    projection.message.includes("Offline Private User"),
    false,
    "offline user nickname must not appear in tip announcement",
  );
  assert.equal(projection.metadata.to, "Anonymous Degen");
});

test("RFP winner masked when offline — fail-closed privateMode (undefined ?? true → masked)", () => {
  // Simulates: RFP winner not connected; handler applies ?? true.
  const playerNames = getPublicRfpWinnerNames([
    {
      walletId: "offline-winner-wallet",
      profile: {
        nickname: "Offline Private Winner",
        profileImageUrl: "https://example.com/offline-winner.png",
        privateMode: true, // result of getConnectedPlayerPrivateMode(walletId) ?? true
      },
    },
    {
      walletId: "connected-public-wallet",
      profile: {
        nickname: "Connected Public User",
        profileImageUrl: "https://example.com/connected.png",
        privateMode: false, // explicitly non-private: not masked
      },
    },
  ]);

  assert.equal(
    playerNames.includes("Offline Private Winner"),
    false,
    "offline winner must be masked in RFP broadcast",
  );
  assert.equal(playerNames[1], "Connected Public User");
});
