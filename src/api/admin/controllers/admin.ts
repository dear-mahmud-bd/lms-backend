/**
 * admin controller — a content-type-less namespace for admin-only actions.
 *
 * GET  /api/admin/stats            (task 9.1) — aggregate platform stats. Read-only.
 * GET  /api/admin/users            (task 17.2) — list users (id/username/email/appRole) for the
 *                                   role-management UI. Read-only.
 * PUT  /api/admin/users/:id/role   (task 9.2) — change a user's canonical appRole.
 *
 * Both are Admin-only, enforced by the `global::has-app-role` policy on the route (see
 * routes/admin.ts) — the controller never runs for a non-admin, so access control lives at
 * the route layer, not here.
 */

const APP_ROLES = ['admin', 'content-manager', 'instructor', 'student'] as const;

export default {
  async stats(ctx: any) {
    const usersByRole: Record<string, number> = {};
    for (const role of APP_ROLES) {
      usersByRole[role] = await strapi.db
        .query('plugin::users-permissions.user')
        .count({ where: { appRole: role } });
    }

    const totalCourses = await strapi.db.query('api::course.course').count();
    const totalEnrollments = await strapi.db.query('api::enrollment.enrollment').count();

    ctx.body = { usersByRole, totalCourses, totalEnrollments };
  },

  async listUsers(ctx: any) {
    // Roster for the admin role-management UI (task 17.2). Select only the columns the UI needs —
    // never return password/reset/confirmation token fields. Ordered by id for a stable list.
    const users = await strapi.db.query('plugin::users-permissions.user').findMany({
      select: ['id', 'username', 'email', 'appRole'],
      orderBy: { id: 'asc' },
    });

    ctx.body = { users };
  },

  async setUserRole(ctx: any) {
    const { id } = ctx.params;
    const { appRole } = ctx.request.body ?? {};

    // Validate the requested role against the four canonical roles (task 2.1). Anything else
    // (missing, wrong type, unknown value) is a 400 — never a silent no-op or a 500.
    if (!APP_ROLES.includes(appRole)) {
      return ctx.badRequest(`appRole must be one of: ${APP_ROLES.join(', ')}`);
    }

    // Write appRole directly via the query engine: it's our custom scalar on the user, so we
    // skip the users-permissions service to avoid its registration/confirmation side effects.
    const target = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { id } });

    if (!target) {
      // Not in the contract's stated error list, but the sensible response for a bad :id
      // (see docs/decisions.md 9.2) — better than an unhandled 500.
      return ctx.notFound('user not found');
    }

    const updated = await strapi.db
      .query('plugin::users-permissions.user')
      .update({ where: { id }, data: { appRole } });

    // Return only the contract's three fields — never leak password/reset/token columns.
    ctx.body = {
      user: { id: updated.id, username: updated.username, appRole: updated.appRole },
    };
  },
};
