import assert from "node:assert/strict";
import test from "node:test";

test("bad-word/moderation path tested", async () => {
  const { verifyMessage } = await import("../chat");

  const verified = verifyMessage("visit http now");

  assert.equal(verified.error, false);
  assert.notEqual(verified.msg, "visit http now");
  assert.match(verified.msg, /\*+/);
});

test("normal message passes", async () => {
  const { verifyMessage } = await import("../chat");

  const verified = verifyMessage("hello degens");

  assert.deepEqual(verified, {
    msg: "hello degens",
    error: false,
    errorMessage: "None",
  });
});

test("chat/mod actions require auth/admin boundary: admin-only actions reject non-admin", async () => {
  const { isSendAnnouncementAuthorized } = await import("./chatGuards");

  const authorized = await isSendAnnouncementAuthorized({
    authKey: "Bearer valid-non-admin",
    verifyJwtFn: async () => ({
      walletId: "non-admin-wallet",
      nickname: "member",
      profileImageUrl: "",
      role: "MEMBER",
    }),
    isAdminWallet: () => false,
  });

  assert.equal(authorized, false);
});

test("chat/mod actions require auth/admin boundary: admin-only actions accept admins", async () => {
  const { isSendAnnouncementAuthorized } = await import("./chatGuards");

  const authorized = await isSendAnnouncementAuthorized({
    authKey: "Bearer valid-admin",
    verifyJwtFn: async () => ({
      walletId: "admin-wallet",
      nickname: "admin",
      profileImageUrl: "",
      role: "ADMIN",
    }),
    isAdminWallet: () => true,
  });

  assert.equal(authorized, true);
});

test("chat/mod actions require auth/admin boundary: unauthenticated requests reject when internal secret is unset", async () => {
  const { isSendAnnouncementAuthorized } = await import("./chatGuards");
  const originalInternalKey = process.env.INTERNAL_KEY;
  delete process.env.INTERNAL_KEY;

  try {
    // Pins the fail-closed fix: with no auth header, no internal-key header,
    // and no configured INTERNAL_KEY, the legacy `header === secret` check
    // compared undefined === undefined and authorized the request.
    const authorized = await isSendAnnouncementAuthorized({
      authKey: undefined,
      internalKey: undefined,
    });

    assert.equal(authorized, false);
  } finally {
    if (originalInternalKey === undefined) {
      delete process.env.INTERNAL_KEY;
    } else {
      process.env.INTERNAL_KEY = originalInternalKey;
    }
  }
});

test("chat/mod actions require auth/admin boundary: wrong internal key rejects announcements", async () => {
  const { isSendAnnouncementAuthorized } = await import("./chatGuards");

  const authorized = await isSendAnnouncementAuthorized({
    authKey: undefined,
    internalKey: "wrong-secret",
    internalSecret: "configured-secret",
  });

  assert.equal(authorized, false);
});

test("chat/mod actions require auth/admin boundary: matching internal key authorizes announcements", async () => {
  const { isSendAnnouncementAuthorized } = await import("./chatGuards");

  const authorized = await isSendAnnouncementAuthorized({
    authKey: undefined,
    internalKey: "configured-secret",
    internalSecret: "configured-secret",
  });

  assert.equal(authorized, true);
});
