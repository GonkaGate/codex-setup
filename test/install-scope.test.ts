import assert from "node:assert/strict";
import test from "node:test";
import { resolveInstallScope } from "../src/install/install-scope.js";
import type {
  TrackedLocalProjectConfigInspection,
  UntrackedLocalProjectConfigInspection,
} from "../src/install/local-project-config.js";

const testInstallPaths = {
  projectConfigPath: "/Users/test/project/.codex/config.toml",
  projectRoot: "/Users/test/project",
};

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
    installPaths: testInstallPaths,
    promptForTrackedLocalConfigAction: async () => {
      promptCount += 1;
      return "user";
    },
    requestedScope: "user",
  });

  assert.deepEqual(resolution, {
    details: {
      finalScope: "user",
      switchedToUserScope: false,
    },
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
    installPaths: testInstallPaths,
    promptForTrackedLocalConfigAction: async () => {
      promptCount += 1;
      return "user";
    },
    requestedScope: "local",
  });

  assert.deepEqual(resolution, {
    details: {
      finalScope: "local",
      projectConfigPath: testInstallPaths.projectConfigPath,
      switchedToUserScope: false,
      trustTargetPath: testInstallPaths.projectRoot,
    },
  });
  assert.equal(promptCount, 0);
});

test("resolveInstallScope returns an exclude target for untracked local configs", async () => {
  const untrackedInspection = createUntrackedInspection();

  const resolution = await resolveInstallScope({
    inspectLocalProjectConfig: async () => untrackedInspection,
    installPaths: testInstallPaths,
    promptForTrackedLocalConfigAction: async () => "user",
    requestedScope: "local",
  });

  assert.deepEqual(resolution, {
    details: {
      finalScope: "local",
      projectConfigPath: testInstallPaths.projectConfigPath,
      switchedToUserScope: false,
      trustTargetPath: testInstallPaths.projectRoot,
    },
    localProjectConfigExcludeTarget: {
      gitDir: untrackedInspection.gitContext.gitDir,
      relativeConfigPath: untrackedInspection.relativeConfigPath,
    },
  });
});

test("resolveInstallScope switches tracked local config to user scope when requested", async () => {
  let promptTarget = "";
  const trackedInspection = createTrackedInspection();

  const resolution = await resolveInstallScope({
    inspectLocalProjectConfig: async () => trackedInspection,
    installPaths: testInstallPaths,
    promptForTrackedLocalConfigAction: async (relativeConfigPath) => {
      promptTarget = relativeConfigPath;
      return "user";
    },
    requestedScope: "local",
  });

  assert.deepEqual(resolution, {
    details: {
      finalScope: "user",
      switchedToUserScope: true,
    },
  });
  assert.equal(promptTarget, trackedInspection.relativeConfigPath);
});

test("resolveInstallScope can cancel tracked local config installs", async () => {
  await assert.rejects(
    () =>
      resolveInstallScope({
        inspectLocalProjectConfig: async () => createTrackedInspection(),
        installPaths: testInstallPaths,
        promptForTrackedLocalConfigAction: async () => "cancel",
        requestedScope: "local",
      }),
    /Installation cancelled\./,
  );
});

function createTrackedInspection(): TrackedLocalProjectConfigInspection {
  return {
    gitContext: {
      gitDir: "/Users/test/project/.git",
      repoRoot: testInstallPaths.projectRoot,
    },
    kind: "tracked",
    relativeConfigPath: ".codex/config.toml",
  };
}

function createUntrackedInspection(): UntrackedLocalProjectConfigInspection {
  return {
    excludeTarget: {
      gitDir: "/Users/test/project/.git",
      relativeConfigPath: ".codex/config.toml",
    },
    gitContext: {
      gitDir: "/Users/test/project/.git",
      repoRoot: testInstallPaths.projectRoot,
    },
    kind: "untracked",
    relativeConfigPath: ".codex/config.toml",
  };
}
