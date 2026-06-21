#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
process.chdir(repoRoot);

const roleStateFile = path.join(repoRoot, "roles.json");
const bannedStateFile = path.join(repoRoot, "banned.json");

const backupFile = (filePath) => {
  if (!fs.existsSync(filePath)) return undefined;

  const backupPath = `${filePath}.verify-backup.${process.pid}`;
  fs.renameSync(filePath, backupPath);
  return backupPath;
};

const restoreFile = (filePath, backupPath) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  if (backupPath) {
    fs.renameSync(backupPath, filePath);
  }
};

const assertRoleError = (fn, code) => {
  try {
    fn();
  } catch (err) {
    assert.strictEqual(err.code, code);
    return;
  }

  throw new Error(`Expected ${code}`);
};

const roleBackup = backupFile(roleStateFile);
const bannedBackup = backupFile(bannedStateFile);

try {
  fs.writeFileSync(bannedStateFile, "[]\n", "utf-8");

  const roles = require("../dist/src/roles");
  const chat = require("../dist/src/chat");
  const { getRole } = require("../dist/src/authentication");
  const staticAdmins = require("../dist/src/admins.json");
  const staticMods = require("../dist/src/mods.json");
  const staticHelpfulDegens = require("../dist/src/helpful_degens.json");
  const revokedHelpfulDegenWallet =
    "4jiW4qvmJqqf8P97ZSPQXCawx3oTfrsyd5gG32HuKsB7";

  const seededRoles = roles.getRoles();
  assert.deepStrictEqual(seededRoles.ADMIN, staticAdmins);
  assert.deepStrictEqual(seededRoles.MOD, staticMods);
  assert.deepStrictEqual(seededRoles.HELPFUL_DEGEN, staticHelpfulDegens);
  assert.strictEqual(
    seededRoles.HELPFUL_DEGEN.includes(revokedHelpfulDegenWallet),
    false,
  );
  assert.ok(fs.existsSync(roleStateFile));

  const adminWallet = "VerifyAdmin111111111111111111111111111111111111";
  const modWallet = "VerifyMod11111111111111111111111111111111111111";
  const hdWallet = "VerifyHD111111111111111111111111111111111111111";

  roles.addRole(adminWallet, "ADMIN");
  assert.strictEqual(roles.hasRole(adminWallet, "ADMIN"), true);
  assert.strictEqual(roles.getExplicitRole(adminWallet), "ADMIN");
  assert.strictEqual(getRole(adminWallet), "ADMIN");
  assert.strictEqual(chat.canModerateChat(adminWallet), true);

  roles.removeRole(adminWallet);
  assert.strictEqual(roles.hasRole(adminWallet, "ADMIN"), false);
  assert.strictEqual(getRole(adminWallet), "MEMBER");
  assert.strictEqual(chat.canModerateChat(adminWallet), false);

  roles.addRole(hdWallet, "HELPFUL_DEGEN");
  assert.strictEqual(chat.isHelpfulDegen(hdWallet), true);
  assert.strictEqual(chat.isAllowedToChat(hdWallet), true);
  assert.strictEqual(getRole(hdWallet), "HELPFUL_DEGEN");
  assert.strictEqual(chat.canModerateChat(hdWallet), false);

  roles.removeRole(hdWallet, "HELPFUL_DEGEN");
  assert.strictEqual(chat.isHelpfulDegen(hdWallet), false);
  assert.strictEqual(getRole(hdWallet), "MEMBER");

  assertRoleError(() => roles.addRole("", "ADMIN"), "MISSING_WALLET");
  assertRoleError(
    () => roles.addRole("WalletForInvalidRole", "OWNER"),
    "INVALID_ROLE",
  );

  roles.addRole(modWallet, "MOD");
  assertRoleError(() => roles.addRole(modWallet, "MOD"), "ROLE_ALREADY_ASSIGNED");
  roles.removeRole(modWallet, "MOD");
  assertRoleError(() => roles.removeRole(modWallet, "MOD"), "ROLE_NOT_ASSIGNED");

  roles.addRole(adminWallet, "ADMIN");
  const rolesBeforeMalformedReload = roles.getRoles();
  fs.writeFileSync(roleStateFile, "{not valid json", "utf-8");
  assertRoleError(() => roles.reloadRoles(), "MALFORMED_ROLE_STORE");
  assert.deepStrictEqual(roles.getRoles(), rolesBeforeMalformedReload);

  roles.saveRoles(rolesBeforeMalformedReload);
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(roleStateFile, "utf-8")),
    rolesBeforeMalformedReload,
  );

  const websocketSource = fs.readFileSync(
    path.join(repoRoot, "src/websockets.ts"),
    "utf-8",
  );
  assert.strictEqual(
    /isHelpfulDegen\(chatProfile\.walletId\)/.test(websocketSource),
    false,
  );

  const routesSource = fs.readFileSync(
    path.join(repoRoot, "src/routes/chat.ts"),
    "utf-8",
  );
  assert.strictEqual(
    /isHelpfulDegen\(chatProfile\.walletId\)/.test(routesSource),
    false,
  );

  console.log("Role store verification passed");
} finally {
  restoreFile(roleStateFile, roleBackup);
  restoreFile(bannedStateFile, bannedBackup);
}
