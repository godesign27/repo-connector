export type ConnectorMode = "mock" | "github";

export interface AppConfig {
  mode: ConnectorMode;
  appBaseUrl: string;
  databasePath: string;
  encryptionKey: string;
  adminSecret: string;
  apiKey: string;
  github: {
    appId: string;
    appSlug: string;
    privateKey: string;
    webhookSecret: string;
  } | null;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const mode: ConnectorMode =
    process.env.CONNECTOR_MODE === "github" ? "github" : "mock";
  const github =
    mode === "github"
      ? {
          appId: required("GITHUB_APP_ID"),
          appSlug: required("GITHUB_APP_SLUG"),
          privateKey: required("GITHUB_APP_PRIVATE_KEY"),
          webhookSecret: required("GITHUB_WEBHOOK_SECRET"),
        }
      : null;

  return {
    mode,
    appBaseUrl: process.env.APP_BASE_URL ?? "http://127.0.0.1:43127",
    databasePath: process.env.DATABASE_PATH ?? "./data/repo-connector.sqlite",
    encryptionKey: required("ENCRYPTION_KEY"),
    adminSecret: required("ADMIN_SECRET"),
    apiKey: required("REPO_CONNECTOR_API_KEY"),
    github,
  };
}
