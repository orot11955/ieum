import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import type { DeliveryReader } from "@ieum/backend/delivery/reader";
import {
  DELIVERY_READER,
  DeliveryController,
  DeliveryErrorFilter,
} from "./delivery.controller.js";

@Module({})
export class DeliveryModule {
  static register(reader: DeliveryReader) {
    return {
      module: DeliveryModule,
      controllers: [DeliveryController],
      providers: [
        { provide: DELIVERY_READER, useValue: reader },
        { provide: APP_FILTER, useClass: DeliveryErrorFilter },
      ],
    };
  }
}
