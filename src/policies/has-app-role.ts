/**
 * Reusable role-tier guard (task 2.3).
 *
 * Registered globally as `global::has-app-role`. Attach to a route to require the caller's
 * `appRole` to be one of an allowed set, e.g.:
 *
 *   policies: [{ name: 'global::has-app-role', config: { roles: ['admin','content-manager','instructor'] } }]
 *
 * NOTE: we check `ctx.state.user.appRole` (our canonical role from task 2.1), NOT the coarse
 * users-permissions plugin role — every registered user shares the single `authenticated` plugin
 * role, so `role.type` cannot distinguish admin/CM/instructor/student. This diverges from the
 * generic skill example on purpose, per the 2.1 decision.
 */
export default (policyContext: any, config: any, { strapi }: { strapi: any }) => {
  const allowed: string[] = (config && config.roles) || [];
  const user = policyContext.state.user;

  if (!user) return false; // no authenticated user -> 403 (baseline should already require auth)

  if (allowed.length === 0) {
    strapi.log.error('[has-app-role] misconfigured: `config.roles` is empty');
    return false;
  }

  return allowed.includes(user.appRole);
};
