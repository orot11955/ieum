import type { IdentityService } from "@ieum/backend/identity-service";
import type { AuthPort } from "@ieum/backend/identity";
import type { PreferenceCommands } from "@ieum/backend/preferences";
import type { CaptureService } from "@ieum/backend/captures";
import type { KnowledgeService } from "@ieum/backend/knowledge";
import type { StructureService } from "@ieum/backend/knowledge/structure";
import type { TaskService } from "@ieum/backend/tasks";
import type { CalendarService } from "@ieum/backend/calendar";
import type { JudgementService } from "@ieum/backend/judgement/judgement-service";
import type { ProposalService } from "@ieum/backend/judgement/proposals";
import type { ExtractionService } from "@ieum/backend/extraction/extraction-service";
import type { DocumentService } from "@ieum/backend/documents";
import type { createAccountAdministration } from "../auth/registration.js";

export interface IdentityRuntime {
  service: IdentityService;
  preferences: PreferenceCommands;
  captures: CaptureService;
  knowledge: KnowledgeService;
  structure: StructureService;
  tasks: TaskService;
  calendar: CalendarService;
  judgement: JudgementService;
  proposals: ProposalService;
  extraction: ExtractionService;
  documents: DocumentService;
  authPort: AuthPort;
  sessions: ReturnType<typeof createAccountAdministration>["sessions"];
  origin: string;
}

export const IDENTITY_RUNTIME = Symbol("IDENTITY_RUNTIME");
