const ROLE_DISPLAY_LABELS: Record<string, string> = {
  'Faculty Staff': 'Faculty',
  'Office Staff': 'Staff',
};

export function formatRoleLabel(role?: string | null): string {
  if (!role) return '';
  return ROLE_DISPLAY_LABELS[role] ?? role;
}

export function rolesToSelectOptions(roles: string[]): { label: string; value: string }[] {
  return roles.map((r) => ({ label: formatRoleLabel(r), value: r }));
}
