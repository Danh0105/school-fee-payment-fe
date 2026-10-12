export interface ParentJwtPayload {
  /** The single student this access token is scoped to. */
  studentId: string;
  /** Invalidates tokens issued before password verification was introduced. */
  authVersion: 2;
}
