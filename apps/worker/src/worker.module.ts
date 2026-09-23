import { Module } from "@nestjs/common";
import { GetLiveness } from "@ieum/backend/system";

@Module({ providers: [GetLiveness] })
export class WorkerModule {}
