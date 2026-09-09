// Allows `node --import ./tests/ts-extension-resolver.mjs --test tests/*.test.ts`
// to work without a build step by hooking TypeScript extension loading.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("ts-node/esm", pathToFileURL("./"));
