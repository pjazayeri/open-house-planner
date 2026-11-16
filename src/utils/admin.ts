// The sole admin account. This gates UI visibility/navigation only; real
// authorization is enforced server-side by /api/admin-stats (ADMIN_EMAILS env,
// same default).
export const ADMIN_EMAILS = ["pauljazayeri@gmail.com"];
export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase());
