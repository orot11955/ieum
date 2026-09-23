import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { IdentityModule } from "./identity/identity.module.js";
import { CaptureModule } from "./captures/capture.module.js";
import { KnowledgeModule } from "./knowledge/knowledge.module.js";
import type { IdentityRuntime } from "./identity/identity.runtime.js";
import { ProblemFilter } from "./problem.filter.js";
import { SystemModule } from "./system/system.module.js";

@Module({
  imports: [SystemModule],
  providers: [{ provide: APP_FILTER, useClass: ProblemFilter }],
})
export class AppModule {
  static register(identity?: IdentityRuntime): DynamicModule {
    return {
      module: AppModule,
      imports: identity
        ? [
            IdentityModule.register(identity),
            CaptureModule.register(identity),
            KnowledgeModule.register(identity),
          ]
        : [],
    };
  }
}
