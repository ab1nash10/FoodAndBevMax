export interface PermissionOverrideDiff {
  /** Permissions asked for that the roles do not already grant. */
  grants: string[];
  /** Permissions the roles grant that were not asked for. */
  revokes: string[];
}

/**
 * A user override row is only worth storing where the requested set disagrees with what the
 * roles already give. Deriving that from the two sets avoids reading the whole permission
 * catalogue just to filter it in memory.
 */
export function diffPermissionOverrides(
  requestedPermissionIds: readonly string[],
  inheritedPermissionIds: ReadonlySet<string>,
): PermissionOverrideDiff {
  const requested = new Set(requestedPermissionIds);

  return {
    grants: [...requested].filter((id) => !inheritedPermissionIds.has(id)),
    revokes: [...inheritedPermissionIds].filter((id) => !requested.has(id)),
  };
}
