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
