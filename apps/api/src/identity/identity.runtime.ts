import type { IdentityService } from "@ieum/backend/identity-service";
import type { AuthPort } from "@ieum/backend/identity";
import type { PreferenceCommands } from "@ieum/backend/preferences";
import type { CaptureService } from "@ieum/backend/captures";
import type { KnowledgeService } from "@ieum/backend/knowledge";
import type { createAccountAdministration } from "../auth/registration.js";

export interface IdentityRuntime {
  service: IdentityService;
  preferences: PreferenceCommands;
  captures: CaptureService;
  knowledge: KnowledgeService;
  authPort: AuthPort;
  sessions: ReturnType<typeof createAccountAdministration>["sessions"];
  origin: string;
}

export const IDENTITY_RUNTIME = Symbol("IDENTITY_RUNTIME");
