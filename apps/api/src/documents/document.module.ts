import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DocumentController } from "./document.controller.js";
import { WorkbenchController } from "./workbench.controller.js";
import { GenerationController } from "./generation.controller.js";
import { AssetController } from "./asset.controller.js";
import { DOCUMENT_RUNTIME } from "./document.runtime.js";

@Module({})
export class DocumentModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: DocumentModule,
      controllers: [
        DocumentController,
        WorkbenchController,
        GenerationController,
        AssetController,
      ],
      providers: [{ provide: DOCUMENT_RUNTIME, useValue: runtime }],
    };
  }
}
