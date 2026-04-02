import packageJson from "./package.json" with { type: "json" };

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
  supportedModels: [
    {
      key: "gpt-5.4",
      displayName: "GPT-5.4",
      modelId: "gpt-5.4",
      description: "Current validated GonkaGate model for Codex CLI.",
      isDefault: true,
    },
  ],
  verifiedCodex: {
    minVersion: "0.118.0",
    modelCatalogVersion: "rust-v0.118.0",
    verifiedDate: "2026-04-02",
  },
};
