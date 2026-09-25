import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DocumentController } from "./document.controller.js";
import { WorkbenchController } from "./workbench.controller.js";
import { DOCUMENT_RUNTIME } from "./document.runtime.js";

@Module({})
export class DocumentModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: DocumentModule,
      controllers: [DocumentController, WorkbenchController],
      providers: [{ provide: DOCUMENT_RUNTIME, useValue: runtime }],
    };
  }
}
