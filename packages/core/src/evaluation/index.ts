import type { ContextSnapshot, ThoughtUnitRevision } from "../model/types.js";
import type { RetrievedCandidate } from "../retrieval/index.js";
import type { ValidatedSnapshot } from "../snapshot/types.js";

export type Availability = "available" | "missing" | "not_applicable" | "error";

export type SignalInput =
  | Readonly<{ availability: "available"; value: number }>
  | Readonly<{ availability: "missing" | "not_applicable"; reason: string }>
  | Readonly<{ availability: "error"; code: string }>;

export type MemberMeasurement = Readonly<{
  unitId: string;
  revision: number;
  originKey: string;
  cosine: number;
}>;

export type MemberInput =
  | Readonly<{
      availability: "available";
      members: readonly MemberMeasurement[];
    }>
  | Exclude<SignalInput, { availability: "available" }>;

export type CandidateMeasurements = Readonly<{
  identity: SignalInput;
  member: MemberInput;
  semantic: SignalInput;
}>;

export type EvaluatedFeature = Readonly<{
  availability: Availability;
  value: number | null;
  reason: string | null;
  /** Distinct origins actually used by the member aggregate. */
  memberEvidence: readonly MemberMeasurement[];
}>;

export type CandidateEvaluation = Readonly<{
  contextId: string;
  identity: EvaluatedFeature;
  member: EvaluatedFeature;
  lexical: EvaluatedFeature;
  semantic: EvaluatedFeature;
}>;

export const NOT_MEASURED_INPUTS: CandidateMeasurements = Object.freeze({
  identity: { availability: "missing", reason: "NOT_MEASURED" },
  member: { availability: "missing", reason: "NOT_MEASURED" },
  semantic: { availability: "not_applicable", reason: "DISABLED" },
});

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function refKey(unitId: string, revision: number): string {
  return `${unitId}\u0000${revision}`;
}

function validateCosine(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("feature value must be finite and within [0,1]");
  }
}

function validateReason(value: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
    throw new RangeError("feature reason must be a stable uppercase code");
  }
}

function unavailable(
  availability: Exclude<Availability, "available">,
  reason: string,
): EvaluatedFeature {
  validateReason(reason);
  return { availability, value: null, reason, memberEvidence: [] };
}

function available(
  value: number,
  memberEvidence: readonly MemberMeasurement[] = [],
): EvaluatedFeature {
  validateCosine(value);
  return { availability: "available", value, reason: null, memberEvidence };
}

function evaluateSignal(input: SignalInput): EvaluatedFeature {
  if (input.availability === "available") return available(input.value);
  if (input.availability === "error") return unavailable("error", input.code);
  return unavailable(input.availability, input.reason);
}

function evaluateMember(
  input: MemberInput,
  context: ContextSnapshot,
  units: ReadonlyMap<string, ThoughtUnitRevision>,
  queryOrigin: string,
): EvaluatedFeature {
  if (input.availability !== "available") return evaluateSignal(input);
  if (input.members.length === 0) {
    throw new RangeError("available member feature requires measured members");
  }
  const allowed = new Set(
    context.memberUnits.map((ref) => refKey(ref.unitId, ref.revision)),
  );
  const byOrigin = new Map<string, MemberMeasurement>();
  for (const measurement of input.members) {
    validateCosine(measurement.cosine);
    const unit = units.get(refKey(measurement.unitId, measurement.revision));
    if (
      !unit ||
      !allowed.has(refKey(measurement.unitId, measurement.revision)) ||
      unit.originKey !== measurement.originKey ||
      unit.originKey === queryOrigin
    ) {
      throw new RangeError(
        "member measurement must reference an eligible member revision",
      );
    }
    const previous = byOrigin.get(measurement.originKey);
    if (
      !previous ||
      measurement.cosine > previous.cosine ||
      (measurement.cosine === previous.cosine &&
        (compare(measurement.unitId, previous.unitId) < 0 ||
          (measurement.unitId === previous.unitId &&
            measurement.revision < previous.revision)))
    ) {
      byOrigin.set(measurement.originKey, measurement);
    }
  }
  const evidence = [...byOrigin.values()]
    .sort(
      (a, b) =>
        b.cosine - a.cosine ||
        compare(a.unitId, b.unitId) ||
        a.revision - b.revision,
    )
    .slice(0, 3);
  const mean =
    evidence.reduce((sum, item) => sum + item.cosine, 0) / evidence.length;
  return available(mean, evidence);
}

function combineLexical(
  identity: EvaluatedFeature,
  member: EvaluatedFeature,
): EvaluatedFeature {
  const measured = [identity, member].filter(
    (item) => item.availability === "available",
  );
  if (measured.length) {
    const winner = measured.reduce((best, item) =>
      item.value! > best.value! ? item : best,
    );
    return available(winner.value!, winner.memberEvidence);
  }
  if (identity.availability === "error" || member.availability === "error") {
    return unavailable("error", "LEXICAL_SOURCE_ERROR");
  }
  if (
    identity.availability === "missing" ||
    member.availability === "missing"
  ) {
    return unavailable("missing", "NOT_MEASURED");
  }
  return unavailable("not_applicable", "NO_TEXT_SIGNAL");
}

/** Validate feature observations and aggregate at most three distinct member origins. */
export function evaluateCandidate(
  snapshot: ValidatedSnapshot,
  candidate: RetrievedCandidate,
  measurements: CandidateMeasurements = NOT_MEASURED_INPUTS,
): CandidateEvaluation {
  const context = snapshot.contexts.find(
    (item) => item.contextId === candidate.contextId,
  );
  if (
    !context ||
    context.identityRevision !== candidate.identityRevision ||
    context.membershipRevision !== candidate.membershipRevision
  ) {
    throw new RangeError("candidate must match an eligible context revision");
  }
  const units = new Map(
    snapshot.units.map((unit) => [refKey(unit.unitId, unit.revision), unit]),
  );
  const identity = evaluateSignal(measurements.identity);
  const member = evaluateMember(
    measurements.member,
    context,
    units,
    snapshot.query.originKey,
  );
  const semantic = evaluateSignal(measurements.semantic);
  return {
    contextId: candidate.contextId,
    identity,
    member,
    lexical: combineLexical(identity, member),
    semantic,
  };
}
