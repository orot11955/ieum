import { Module } from "@nestjs/common";
import { GetLiveness } from "@ieum/backend/system";
import { SystemController } from "./system.controller.js";

@Module({ controllers: [SystemController], providers: [GetLiveness] })
export class SystemModule {}
