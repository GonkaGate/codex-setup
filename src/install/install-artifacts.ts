import {
  resolveInstallPaths,
  resolveProjectRoot,
  type InstallPaths,
} from "./settings-paths.js";
import {
  createTokenCommandConfig,
  type TokenCommandConfig,
} from "./token-helper.js";

export interface InstallArtifacts {
  installPaths: InstallPaths;
  tokenCommand: TokenCommandConfig;
}

export interface BuildInstallArtifactsInput {
  environment?: NodeJS.ProcessEnv;
  nodeExecutable: string;
  platform: NodeJS.Platform;
  projectRoot: string;
}

export interface ResolveInstallArtifactsInput extends Omit<
  BuildInstallArtifactsInput,
  "projectRoot"
> {
  cwd: string;
}

export function buildInstallArtifacts(
  input: BuildInstallArtifactsInput,
): InstallArtifacts {
  const installPaths = resolveInstallPaths({
    environment: input.environment,
    projectRoot: input.projectRoot,
  });

  return {
    installPaths,
    tokenCommand: createTokenCommandConfig({
      codexHome: installPaths.codexHome,
      nodeExecutable: input.nodeExecutable,
      platform: input.platform,
      tokenPath: installPaths.tokenPath,
    }),
  };
}

export async function resolveInstallArtifacts(
  input: ResolveInstallArtifactsInput,
): Promise<InstallArtifacts> {
  return buildInstallArtifacts({
    environment: input.environment,
    nodeExecutable: input.nodeExecutable,
    platform: input.platform,
    projectRoot: await resolveProjectRoot(input.cwd),
  });
}
