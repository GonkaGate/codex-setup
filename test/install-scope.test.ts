import assert from "node:assert/strict";
import test from "node:test";
import { PromptError } from "../src/install/install-errors.js";
import {
  createLocalScopeDetails,
  createUserScopeDetails,
  resolveInstallScope,
} from "../src/install/install-scope.js";
import type {
  TrackedLocalProjectConfigInspection,
  UntrackedLocalProjectConfigInspection,
} from "../src/install/local-project-config.js";
import { LOCAL_PROJECT_CONFIG_RELATIVE_PATH } from "../src/install/settings-paths.js";
import { TEST_LOCAL_SCOPE_PATHS } from "./helpers/install-fixtures.js";

test("resolveInstallScope keeps user scope without local config inspection", async () => {
  let inspectCount = 0;
  let promptCount = 0;

  const resolution = await resolveInstallScope({
    inspectLocalProjectConfig: async () => {
      inspectCount += 1;
      return {
        kind: "outside_repo",
      };
    },
    installPaths: TEST_LOCAL_SCOPE_PATHS,
    promptForTrackedLocalConfigAction: async () => {
      promptCount += 1;
      return "user";
    },
    requestedScope: "user",
  });

  assert.deepEqual(resolution, {
    ...createUserScopeDetails(false),
  });
  assert.equal(inspectCount, 0);
  assert.equal(promptCount, 0);
});

test("resolveInstallScope keeps local scope when the project config is outside git", async () => {
  let promptCount = 0;

  const resolution = await resolveInstallScope({
    inspectLocalProjectConfig: async () => ({
      kind: "outside_repo",
    }),
    installPaths: TEST_LOCAL_SCOPE_PATHS,
    promptForTrackedLocalConfigAction: async () => {
      promptCount += 1;
      return "user";
    },
    requestedScope: "local",
  });

  assert.deepEqual(resolution, {
    ...createLocalScopeDetails(TEST_LOCAL_SCOPE_PATHS),
  });
  assert.equal(promptCount, 0);
});

test("resolveInstallScope returns an exclude target for untracked local configs", async () => {
  const untrackedInspection = createUntrackedInspection();

  const resolution = await resolveInstallScope({
    inspectLocalProjectConfig: async () => untrackedInspection,
    installPaths: TEST_LOCAL_SCOPE_PATHS,
    promptForTrackedLocalConfigAction: async () => "user",
    requestedScope: "local",
  });

  assert.deepEqual(resolution, {
    ...createLocalScopeDetails(TEST_LOCAL_SCOPE_PATHS),
    localProjectConfigExcludeTarget: {
      gitDir: untrackedInspection.gitContext.gitDir,
      repoRelativeConfigPath: untrackedInspection.repoRelativeConfigPath,
    },
  });
});

test("resolveInstallScope switches tracked local config to user scope when requested", async () => {
  let promptTarget = "";
  const trackedInspection = createTrackedInspection();

  const resolution = await resolveInstallScope({
    inspectLocalProjectConfig: async () => trackedInspection,
    installPaths: TEST_LOCAL_SCOPE_PATHS,
    promptForTrackedLocalConfigAction: async (repoRelativeConfigPath) => {
      promptTarget = repoRelativeConfigPath;
      return "user";
    },
    requestedScope: "local",
  });

  assert.deepEqual(resolution, {
    ...createUserScopeDetails(true),
  });
  assert.equal(promptTarget, trackedInspection.repoRelativeConfigPath);
});

test("resolveInstallScope can cancel tracked local config installs", async () => {
  await assert.rejects(
    () =>
      resolveInstallScope({
        inspectLocalProjectConfig: async () => createTrackedInspection(),
        installPaths: TEST_LOCAL_SCOPE_PATHS,
        promptForTrackedLocalConfigAction: async () => "cancel",
        requestedScope: "local",
      }),
    (error: unknown) => {
      assert.equal(error instanceof PromptError, true);

      if (!(error instanceof PromptError)) {
        return false;
      }

      assert.equal(error.code, "cancelled");
      assert.match(error.message, /Installation cancelled\./);
      return true;
    },
  );
});

function createTrackedInspection(): TrackedLocalProjectConfigInspection {
  return {
    gitContext: {
      gitDir: "/Users/test/project/.git",
      repoRoot: TEST_LOCAL_SCOPE_PATHS.projectRoot,
    },
    kind: "tracked",
    repoRelativeConfigPath: LOCAL_PROJECT_CONFIG_RELATIVE_PATH,
  };
}

function createUntrackedInspection(): UntrackedLocalProjectConfigInspection {
  return {
    excludeTarget: {
      gitDir: "/Users/test/project/.git",
      repoRelativeConfigPath: LOCAL_PROJECT_CONFIG_RELATIVE_PATH,
    },
    gitContext: {
      gitDir: "/Users/test/project/.git",
      repoRoot: TEST_LOCAL_SCOPE_PATHS.projectRoot,
    },
    kind: "untracked",
    repoRelativeConfigPath: LOCAL_PROJECT_CONFIG_RELATIVE_PATH,
  };
}
