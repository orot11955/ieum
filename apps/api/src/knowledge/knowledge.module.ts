import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { KnowledgeController } from "./knowledge.controller.js";
import { KNOWLEDGE_RUNTIME } from "./knowledge.runtime.js";
@Module({})
export class KnowledgeModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: KnowledgeModule,
      controllers: [KnowledgeController],
      providers: [{ provide: KNOWLEDGE_RUNTIME, useValue: runtime }],
    };
  }
}
