import {
  ExcessivePermissionsError,
  InstallationNotApprovedError,
  InstallationNotBoundError,
  InstallationNotFoundError,
  InvalidClientIdError,
  InvalidInstallationTransitionError,
} from "@/core/types";
import { ApiUnauthorizedError } from "@/http/auth";

export function errorStatus(error: unknown): { status: number; body: object } {
  if (error instanceof ApiUnauthorizedError) {
    return { status: 401, body: { error: error.code, message: error.message } };
  }
  if (error instanceof InstallationNotFoundError) {
    return { status: 404, body: { error: error.code, message: error.message } };
  }
  if (error instanceof InstallationNotApprovedError) {
    return {
      status: 409,
      body: {
        error: error.code,
        message: error.message,
        status: error.status,
      },
    };
  }
  if (error instanceof ExcessivePermissionsError) {
    return { status: 403, body: { error: error.code, message: error.message } };
  }
  if (
    error instanceof InstallationNotBoundError ||
    error instanceof InvalidInstallationTransitionError ||
    error instanceof InvalidClientIdError
  ) {
    return { status: 409, body: { error: error.code, message: error.message } };
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return { status: 500, body: { error: "INTERNAL", message } };
}

export function jsonError(error: unknown): Response {
  const mapped = errorStatus(error);
  return Response.json(mapped.body, { status: mapped.status });
}
