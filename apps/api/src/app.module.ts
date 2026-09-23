import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ProblemFilter } from "./problem.filter.js";
import { SystemModule } from "./system/system.module.js";

@Module({
  imports: [SystemModule],
  providers: [{ provide: APP_FILTER, useClass: ProblemFilter }],
})
export class AppModule {}
