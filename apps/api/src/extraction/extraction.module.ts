import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { ExtractionController } from "./extraction.controller.js";
import { EXTRACTION_RUNTIME } from "./extraction.runtime.js";

@Module({})
export class ExtractionModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: ExtractionModule,
      controllers: [ExtractionController],
      providers: [{ provide: EXTRACTION_RUNTIME, useValue: runtime }],
    };
  }
}
