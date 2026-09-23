export const ABSOLUTE_SESSION_SECONDS = 7 * 24 * 60 * 60;
export const IDLE_SESSION_SECONDS = 12 * 60 * 60;

export function sessionWithinBudget(
  session: { createdAt: Date; updatedAt: Date },
  now = Date.now(),
): boolean {
  return (
    session.createdAt.getTime() + ABSOLUTE_SESSION_SECONDS * 1_000 > now &&
    session.updatedAt.getTime() + IDLE_SESSION_SECONDS * 1_000 > now
  );
}
