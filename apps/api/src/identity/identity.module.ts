import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { IdentityController } from "./identity.controller.js";
import { IDENTITY_RUNTIME } from "./identity.runtime.js";
import type { IdentityRuntime } from "./identity.runtime.js";

@Module({})
export class IdentityModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [IdentityController],
      providers: [{ provide: IDENTITY_RUNTIME, useValue: runtime }],
    };
  }
}
