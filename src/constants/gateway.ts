import { CONTRACT_METADATA } from "../../contract-metadata.js";

export const GONKAGATE_PROVIDER_ID = "gonkagate";
export const GONKAGATE_PROVIDER_NAME = "GonkaGate";
export const GONKAGATE_BASE_URL = "https://api.gonkagate.com/v1";
export const VERIFIED_CODEX_MIN_VERSION =
  CONTRACT_METADATA.verifiedCodex.minVersion;
export const VERIFIED_CODEX_MODEL_CATALOG_VERSION =
  CONTRACT_METADATA.verifiedCodex.modelCatalogVersion;
export const VERIFIED_CODEX_BASELINE_DATE =
  CONTRACT_METADATA.verifiedCodex.verifiedDate;
export const TOKEN_COMMAND_TIMEOUT_MS = 5_000;
export const TOKEN_REFRESH_INTERVAL_MS = 300_000;
