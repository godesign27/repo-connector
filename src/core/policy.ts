export const ALLOWED_PERMISSIONS: Readonly<Record<string, "read">> = {
  contents: "read",
  metadata: "read",
};

const WRITE_OR_ADMIN = new Set(["write", "admin", "read_write"]);

export function hasExcessPermissions(
  permissions: Record<string, string>,
): boolean {
  for (const [name, level] of Object.entries(permissions)) {
    const allowed = ALLOWED_PERMISSIONS[name];
    if (!allowed) {
      return true;
    }
    if (WRITE_OR_ADMIN.has(level.toLowerCase())) {
      return true;
    }
    if (level.toLowerCase() !== "read") {
      return true;
    }
  }
  return false;
}
