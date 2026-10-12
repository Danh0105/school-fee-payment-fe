export interface ParentLookupJwtPayload {
  purpose: 'parent-student-lookup';
  candidateRef: string;
  candidateProof: string;
  schoolId: string;
}
