import assert from "node:assert/strict";
import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
  GONKAGATE_PROVIDER_NAME,
} from "../../src/constants/gateway.js";
import type { TomlTable } from "../../src/install/toml-config.js";
import {
  expectTomlBoolean,
  expectTomlString,
  expectTomlStringArray,
  expectTomlTable,
} from "./structured-data.js";
import type { TokenCommandConfig } from "../../src/install/token-helper.js";
import { DEFAULT_TEST_MODEL } from "./install-fixtures.js";

interface ActivationConfigExpectation {
  configLabel?: string;
  modelCatalogPath: string;
  modelId?: string;
}

interface ProviderConfigExpectation {
  codexHome: string;
  configLabel?: string;
  tokenCommand: TokenCommandConfig;
}

export function expectGonkagateActivationConfig(
  config: TomlTable,
  expectation: ActivationConfigExpectation,
): void {
  const configLabel = expectation.configLabel ?? "config";

  assert.equal(
    expectTomlString(config.model_provider, `${configLabel}.model_provider`),
    GONKAGATE_PROVIDER_ID,
  );
  assert.equal(
    expectTomlString(config.model, `${configLabel}.model`),
    expectation.modelId ?? DEFAULT_TEST_MODEL.modelId,
  );
  assert.equal(
    expectTomlString(
      config.model_catalog_json,
      `${configLabel}.model_catalog_json`,
    ),
    expectation.modelCatalogPath,
  );
}

export function expectGonkagateProviderConfig(
  config: TomlTable,
  expectation: ProviderConfigExpectation,
): void {
  const configLabel = expectation.configLabel ?? "config";
  const modelProviders = expectTomlTable(
    config.model_providers,
    `${configLabel}.model_providers`,
  );
  const provider = expectTomlTable(
    modelProviders[GONKAGATE_PROVIDER_ID],
    `${configLabel}.model_providers.${GONKAGATE_PROVIDER_ID}`,
  );
  const auth = expectTomlTable(
    provider.auth,
    `${configLabel}.model_providers.${GONKAGATE_PROVIDER_ID}.auth`,
  );

  assert.equal(
    expectTomlString(
      provider.name,
      `${configLabel}.model_providers.${GONKAGATE_PROVIDER_ID}.name`,
    ),
    GONKAGATE_PROVIDER_NAME,
  );
  assert.equal(
    expectTomlString(provider.base_url, `${configLabel}.provider.base_url`),
    GONKAGATE_BASE_URL,
  );
  assert.equal(
    expectTomlString(provider.wire_api, `${configLabel}.provider.wire_api`),
    "responses",
  );
  assert.equal(
    expectTomlBoolean(
      provider.supports_websockets,
      `${configLabel}.provider.supports_websockets`,
    ),
    false,
  );
  assert.equal(
    expectTomlString(auth.cwd, `${configLabel}.provider.auth.cwd`),
    expectation.codexHome,
  );
  assert.equal(
    expectTomlString(auth.command, `${configLabel}.provider.auth.command`),
    expectation.tokenCommand.command,
  );

  if (expectation.tokenCommand.args.length > 0) {
    assert.deepEqual(
      expectTomlStringArray(auth.args, `${configLabel}.provider.auth.args`),
      expectation.tokenCommand.args,
    );
    return;
  }

  assert.equal(auth.args, undefined);
}

export function expectTrustedProjectConfig(
  config: TomlTable,
  projectRoot: string,
  configLabel = "config",
): void {
  const projects = expectTomlTable(config.projects, `${configLabel}.projects`);
  const trustedProject = expectTomlTable(
    projects[projectRoot],
    `${configLabel}.projects.${projectRoot}`,
  );

  assert.equal(
    expectTomlString(
      trustedProject.trust_level,
      `${configLabel}.projects.${projectRoot}.trust_level`,
    ),
    "trusted",
  );
}
