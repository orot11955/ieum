export type LivenessStatus = Readonly<{ status: "ok" }>;

// Application logic remains usable without Nest, HTTP, or a worker process.
export class GetLiveness {
  execute(): LivenessStatus {
    return { status: "ok" };
  }
}
