import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { TaskController } from "./task.controller.js";
import { TASK_RUNTIME } from "./task.runtime.js";
@Module({})
export class TaskModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: TaskModule,
      controllers: [TaskController],
      providers: [{ provide: TASK_RUNTIME, useValue: runtime }],
    };
  }
}
