/** Roles permitted to use the GoPass web app (administrators and HR only). */
export function isWebAllowedRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'Human Resource Personnel';
}

export function getWebInitialRouteForRole(role: string): 'HrpDashboard' | 'Admin' {
  return role === 'Human Resource Personnel' ? 'HrpDashboard' : 'Admin';
}
