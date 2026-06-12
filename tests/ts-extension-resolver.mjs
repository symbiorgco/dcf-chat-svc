import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const canTryTsExtension =
        error?.code === "ERR_MODULE_NOT_FOUND" &&
        context.parentURL &&
        (specifier.startsWith("./") || specifier.startsWith("../"));

      if (!canTryTsExtension) {
        throw error;
      }

      const tsUrl = new URL(`${specifier}.ts`, context.parentURL);
      if (!existsSync(fileURLToPath(tsUrl))) {
        throw error;
      }

      return {
        shortCircuit: true,
        url: tsUrl.href,
      };
    }
  },
});
