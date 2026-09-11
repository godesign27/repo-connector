import { createConnector, type ConnectorService } from "@/core/connector";
import { decrypt, encrypt, sha256Hex, signState, verifyState } from "@/db/crypto";
import { InstallationStore } from "@/db/store";
import { loadConfig, type AppConfig } from "@/lib/config";
import { GitHubProvider } from "@/providers/github";
import { MockGitHubProvider } from "@/providers/mock";
import type { GitProvider } from "@/providers/types";
import type { ProviderId } from "@/core/types";

const globalForConnector = globalThis as unknown as {
  __repoConnector?: ConnectorService;
  __repoConfig?: AppConfig;
};

function createProviders(config: AppConfig): Record<ProviderId, GitProvider> {
  if (config.mode === "mock") {
    return { github: new MockGitHubProvider(config.appBaseUrl) };
  }
  if (!config.github) {
    throw new Error("GitHub credentials are required when CONNECTOR_MODE=github");
  }
  return { github: new GitHubProvider(config.github) };
}

export function getConfig(): AppConfig {
  if (!globalForConnector.__repoConfig) {
    globalForConnector.__repoConfig = loadConfig();
  }
  return globalForConnector.__repoConfig;
}

export function getConnector(): ConnectorService {
  if (!globalForConnector.__repoConnector) {
    const config = getConfig();
    const store = new InstallationStore(config.databasePath);
    const providers = createProviders(config);
    globalForConnector.__repoConnector = createConnector({
      store,
      getProvider: (id) => {
        const provider = providers[id];
        if (!provider) {
          throw new Error(`Unsupported provider '${id}'`);
        }
        return provider;
      },
      signState: (clientId) => signState(config.encryptionKey, clientId),
      verifyState: (state) => verifyState(config.encryptionKey, state),
      encrypt: (value) => encrypt(value, config.encryptionKey),
      decrypt: (value) => decrypt(value, config.encryptionKey),
      hash: sha256Hex,
    });
  }
  return globalForConnector.__repoConnector;
}
