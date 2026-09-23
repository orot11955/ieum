import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { JudgementController } from "./judgement.controller.js";
import { ProposalController } from "./proposal.controller.js";
import { JUDGEMENT_RUNTIME } from "./judgement.runtime.js";

@Module({})
export class JudgementModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: JudgementModule,
      controllers: [JudgementController, ProposalController],
      providers: [{ provide: JUDGEMENT_RUNTIME, useValue: runtime }],
    };
  }
}
