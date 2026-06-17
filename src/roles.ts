// PERSISTENCE MODEL — EPHEMERAL RUNTIME STORE (single-instance only)
//
// roles.json is a cwd-relative file that does NOT survive container restarts or
// redeployments. On start, the in-memory store seeds from the static JSON
// defaults (admins.json / mods.json / helpful_degens.json); any role changes
// made at runtime via the /roles API are written to roles.json but are LOST on
// the next deploy (the container image does not include runtime-mutated state).
//
// Deployment contract:
//   - Source of truth: admins.json / mods.json / helpful_degens.json in the
//     repository. Permanent role grants or revocations must be committed there.
//   - Runtime mutations (/roles/add, /roles/remove) are intentionally ephemeral:
//     they apply until the next deploy. Operators relying on these across deploys
//     must update the static JSON files instead.
//   - This service runs as a single replica (confirmed: ECS task desiredCount=1,
//     Dockerfile uses pm2-runtime with a single process). The per-process in-
//     memory store is therefore consistent across all request handlers.
//     Multi-replica deployments would require migrating to a shared store.
import fs from "fs";
import admins from "./admins.json";
import mods from "./mods.json";
import helpfulDegens from "./helpful_degens.json";

export const ROLE_STATE_FILE = "./roles.json";

export const EXPLICIT_ROLES = ["ADMIN", "MOD", "HELPFUL_DEGEN"] as const;
export type ExplicitRole = (typeof EXPLICIT_ROLES)[number];
export type RoleAssignments = Record<ExplicitRole, string[]>;

const DEFAULT_ROLES: RoleAssignments = {
  ADMIN: admins,
  MOD: mods,
  HELPFUL_DEGEN: helpfulDegens,
};

export class RoleStoreError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const roleSet = new Set<string>(EXPLICIT_ROLES);

const cloneRoles = (roles: RoleAssignments): RoleAssignments => ({
  ADMIN: [...roles.ADMIN],
  MOD: [...roles.MOD],
  HELPFUL_DEGEN: [...roles.HELPFUL_DEGEN],
});

const normalizeWallet = (wallet: unknown): string => {
  if (typeof wallet !== "string" || wallet.trim().length === 0) {
    throw new RoleStoreError("MISSING_WALLET", "wallet is required");
  }

  return wallet.trim();
};

export const isExplicitRole = (role: unknown): role is ExplicitRole => {
  return typeof role === "string" && roleSet.has(role);
};

const normalizeRole = (role: unknown): ExplicitRole => {
  if (!isExplicitRole(role)) {
    throw new RoleStoreError(
      "INVALID_ROLE",
      "role must be one of ADMIN, MOD, or HELPFUL_DEGEN",
    );
  }

  return role;
};

const normalizeRoles = (input: unknown): RoleAssignments => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RoleStoreError(
      "INVALID_ROLE_STORE",
      "roles state must be a JSON object",
    );
  }

  const raw = input as Record<string, unknown>;
  const keys = Object.keys(raw);
  const invalidKey = keys.find((key) => !isExplicitRole(key));
  if (invalidKey) {
    throw new RoleStoreError(
      "INVALID_ROLE_STORE",
      `unsupported role key: ${invalidKey}`,
    );
  }

  return EXPLICIT_ROLES.reduce((roles, role) => {
    const wallets = raw[role] ?? [];
    if (!Array.isArray(wallets)) {
      throw new RoleStoreError(
        "INVALID_ROLE_STORE",
        `${role} must be an array of wallets`,
      );
    }

    roles[role] = Array.from(
      new Set(
        wallets.map((wallet) => {
          if (typeof wallet !== "string" || wallet.trim().length === 0) {
            throw new RoleStoreError(
              "INVALID_ROLE_STORE",
              `${role} contains an invalid wallet`,
            );
          }

          return wallet.trim();
        }),
      ),
    );

    return roles;
  }, {} as RoleAssignments);
};

export const saveRoles = (roles: RoleAssignments): RoleAssignments => {
  const normalized = normalizeRoles(roles);
  const tempFile = `${ROLE_STATE_FILE}.${process.pid}.${Date.now()}.tmp`;

  fs.writeFileSync(tempFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  fs.renameSync(tempFile, ROLE_STATE_FILE);

  currentRoles = normalized;
  return cloneRoles(currentRoles);
};

const readRolesFile = (): RoleAssignments => {
  try {
    const raw = fs.readFileSync(ROLE_STATE_FILE, "utf-8");
    return normalizeRoles(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return saveRoles(DEFAULT_ROLES);
    }

    if (err instanceof RoleStoreError) {
      throw err;
    }

    if (err instanceof SyntaxError) {
      throw new RoleStoreError(
        "MALFORMED_ROLE_STORE",
        `${ROLE_STATE_FILE} contains malformed JSON`,
      );
    }

    throw err;
  }
};

let currentRoles: RoleAssignments;

export const loadRoles = (): RoleAssignments => {
  currentRoles = readRolesFile();
  return cloneRoles(currentRoles);
};

export const reloadRoles = (): RoleAssignments => {
  return loadRoles();
};

export const getRoles = (): RoleAssignments => {
  if (!currentRoles) {
    return loadRoles();
  }

  return cloneRoles(currentRoles);
};

export const hasRole = (wallet: string, role: ExplicitRole): boolean => {
  const normalizedWallet = normalizeWallet(wallet);
  return getRoles()[role].includes(normalizedWallet);
};

export const getExplicitRole = (wallet: string): ExplicitRole | undefined => {
  const normalizedWallet = normalizeWallet(wallet);
  const roles = getRoles();

  return EXPLICIT_ROLES.find((role) => roles[role].includes(normalizedWallet));
};

export const addRole = (
  wallet: unknown,
  role: unknown,
): RoleAssignments => {
  const normalizedWallet = normalizeWallet(wallet);
  const normalizedRole = normalizeRole(role);
  const nextRoles = getRoles();

  if (nextRoles[normalizedRole].includes(normalizedWallet)) {
    throw new RoleStoreError(
      "ROLE_ALREADY_ASSIGNED",
      "wallet already has this role",
      409,
    );
  }

  nextRoles[normalizedRole].push(normalizedWallet);
  return saveRoles(nextRoles);
};

export const removeRole = (
  wallet: unknown,
  role?: unknown,
): RoleAssignments => {
  const normalizedWallet = normalizeWallet(wallet);
  const nextRoles = getRoles();
  const rolesToRemove = role === undefined ? EXPLICIT_ROLES : [normalizeRole(role)];

  let removed = false;
  rolesToRemove.forEach((roleToRemove) => {
    const originalLength = nextRoles[roleToRemove].length;
    nextRoles[roleToRemove] = nextRoles[roleToRemove].filter(
      (existingWallet) => existingWallet !== normalizedWallet,
    );
    if (nextRoles[roleToRemove].length !== originalLength) {
      removed = true;
    }
  });

  if (!removed) {
    throw new RoleStoreError(
      "ROLE_NOT_ASSIGNED",
      "wallet does not have the requested role",
      404,
    );
  }

  return saveRoles(nextRoles);
};

loadRoles();
