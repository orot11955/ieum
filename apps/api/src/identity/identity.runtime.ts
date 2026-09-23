import type { IdentityService } from "@ieum/backend/identity-service";
import type { AuthPort } from "@ieum/backend/identity";
import type { PreferenceCommands } from "@ieum/backend/preferences";
import type { createAccountAdministration } from "../auth/registration.js";

export interface IdentityRuntime {
  service: IdentityService;
  preferences: PreferenceCommands;
  authPort: AuthPort;
  sessions: ReturnType<typeof createAccountAdministration>["sessions"];
  origin: string;
}

export const IDENTITY_RUNTIME = Symbol("IDENTITY_RUNTIME");
