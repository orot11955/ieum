import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { CalendarController } from "./calendar.controller.js";
import { CALENDAR_RUNTIME } from "./calendar.runtime.js";

@Module({})
export class CalendarModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: CalendarModule,
      controllers: [CalendarController],
      providers: [{ provide: CALENDAR_RUNTIME, useValue: runtime }],
    };
  }
}
