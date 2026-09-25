/** The application-facing identity shape; authentication vendor types stay outside. */
export interface AuthenticatedIdentity {
  userId: string;
  sessionId: string;
  email: string;
  authenticatedAt: Date;
}

export interface AuthPort {
  resolveSession(
    cookieHeader: string | undefined,
  ): Promise<AuthenticatedIdentity | null>;
}
