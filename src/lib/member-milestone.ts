const MEMBER_MILESTONE_SIZE = 25;

export function getMemberMilestone(memberCount: unknown): number | null {
  if (
    typeof memberCount !== "number" ||
    !Number.isInteger(memberCount) ||
    memberCount < MEMBER_MILESTONE_SIZE
  ) {
    return null;
  }

  return (
    Math.floor(memberCount / MEMBER_MILESTONE_SIZE) * MEMBER_MILESTONE_SIZE
  );
}
