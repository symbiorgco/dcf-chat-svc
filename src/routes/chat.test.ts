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
