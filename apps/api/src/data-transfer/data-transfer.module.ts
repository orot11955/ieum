import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { IdentityRuntime } from "../identity/identity.runtime.js";
import { DataTransferController } from "./data-transfer.controller.js";
import { DATA_TRANSFER_RUNTIME } from "./data-transfer.runtime.js";

@Module({})
export class DataTransferModule {
  static register(runtime: IdentityRuntime): DynamicModule {
    return {
      module: DataTransferModule,
      controllers: [DataTransferController],
      providers: [{ provide: DATA_TRANSFER_RUNTIME, useValue: runtime }],
    };
  }
}
