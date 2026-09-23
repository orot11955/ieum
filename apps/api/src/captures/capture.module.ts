import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { CaptureController } from "./capture.controller.js";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { CAPTURE_RUNTIME } from "./capture.runtime.js";

@Module({})
export class CaptureModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: CaptureModule,
      controllers: [CaptureController],
      providers: [{ provide: CAPTURE_RUNTIME, useValue: runtime }],
    };
  }
}
