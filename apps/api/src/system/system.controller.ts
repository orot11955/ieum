import {
  Controller,
  Get,
  Inject,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { PipeTransform } from "@nestjs/common";
import { GetLiveness } from "@ieum/backend/system";

class EmptyQueryPipe implements PipeTransform<unknown, void> {
  transform(value: unknown): void {
    if (
      typeof value === "object" &&
      value !== null &&
      Object.keys(value).length === 0
    ) {
      return;
    }
    throw new UnprocessableEntityException({
      fieldErrors: { query: ["Unknown query parameter"] },
    });
  }
}

@Controller("health")
export class SystemController {
  constructor(@Inject(GetLiveness) private readonly getLiveness: GetLiveness) {}

  @Get("live")
  getLive(@Query(new EmptyQueryPipe()) _query: unknown): { status: "ok" } {
    void _query;
    return this.getLiveness.execute();
  }
}
