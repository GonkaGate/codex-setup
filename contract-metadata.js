import packageJson from "./package.json" with { type: "json" };
import {
  SUPPORTED_MODELS_CONTRACT,
  VERIFIED_CODEX_CONTRACT,
} from "./contract-definitions.js";

const [binName, binPath] = Object.entries(packageJson.bin ?? {})[0] ?? [];

if (!binName || !binPath) {
  throw new Error("Expected package.json to declare the installer bin entry.");
}

export const CONTRACT_METADATA = {
  binName,
  binPath,
  cliVersion: packageJson.version,
  packageName: packageJson.name,
  publicEntrypoint: `npx ${packageJson.name}`,
  supportedModels: SUPPORTED_MODELS_CONTRACT,
  verifiedCodex: VERIFIED_CODEX_CONTRACT,
};
