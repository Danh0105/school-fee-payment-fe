export interface ParentJwtPayload {
  /** The single student this access token is scoped to. */
  studentId: string;
  /** Invalidates tokens issued by earlier parent authentication schemes. */
  authVersion: 3;
}
