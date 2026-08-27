/**
 * users-permissions extension — server side.
 *
 * Phase 2.1: `appRole` is the canonical, server-authoritative role (see docs/decisions.md).
 * A user must NEVER choose their own role at signup, so we harden the public `register`
 * endpoint: any client-sent `appRole` is stripped before the user is created, so every
 * self-registered user falls back to the schema default `student`.
 *
 * Non-student roles are only ever assigned by an admin (admin panel now; task 9.2 later),
 * never self-selected. Task 3.1 will extend this same `register` override to issue an OTP.
 *
 * NOTE: in Strapi v5 `plugin.controllers.auth` is a *factory* `({ strapi }) => ({ register, ... })`,
 * not a plain object — so we must wrap the factory and override `register` on the controller it
 * returns, not mutate `plugin.controllers.auth.register` directly (that just decorates the factory
 * function and the router never sees it).
 */
export default (plugin: any) => {
  const originalAuthFactory = plugin.controllers.auth;

  plugin.controllers.auth = (opts: any) => {
    const controller =
      typeof originalAuthFactory === 'function' ? originalAuthFactory(opts) : originalAuthFactory;

    const originalRegister = controller.register;
    controller.register = async (ctx: any) => {
      const body = ctx.request.body;
      if (body && typeof body === 'object') {
        // Strip any client-supplied role so it can never be self-assigned at signup.
        // Missing/invalid/escalation attempts all resolve to the schema default `student`.
        delete body.appRole;
      }
      return originalRegister(ctx);
    };

    return controller;
  };

  return plugin;
};
