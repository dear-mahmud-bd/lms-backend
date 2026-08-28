import type { Core } from '@strapi/strapi';

/**
 * Baseline route permissions (task 2.2).
 *
 * Strapi's plugin permission system is per *plugin-role* (Public vs Authenticated) only — it
 * cannot express our 4 `appRole`s (that differentiation lives in policies/controllers from 2.3
 * onward). So this baseline is deliberately coarse and SAFE-BY-DEFAULT:
 *
 *   - grant only public browse reads (courses + published blog);
 *   - every write, and every private/gated read (enrollment, progress, quiz-attempt,
 *     notification, lesson gating, quiz-taking), stays CLOSED here and is opened in its own
 *     feature phase together with the appRole + ownership/row-level filter that guards it.
 *
 * Row-level filtering (published-only, own-only, enrolled-only) is a controller concern added
 * per feature; enabling an action here only opens the route, nothing more.
 *
 * Each later phase appends its own actions to the relevant list below.
 */
const BASELINE_PERMISSIONS: Record<'public' | 'authenticated', string[]> = {
  public: [
    'api::course.course.find',
    'api::course.course.findOne',
    'api::blog-post.blog-post.find',
    'api::blog-post.blog-post.findOne',
  ],
  authenticated: [
    // Authenticated requests use the Authenticated role only (they do NOT inherit Public),
    // so the browse reads must be granted here too.
    'api::course.course.find',
    'api::course.course.findOne',
    'api::blog-post.blog-post.find',
    'api::blog-post.blog-post.findOne',
    // Task 2.3: course write routes are opened to Authenticated but GUARDED by the
    // `has-app-role` + `is-owner` policies wired in course/routes/course.ts (Student -> 403,
    // non-owner instructor -> 403, admin/CM bypass). Not a safe-by-default violation: the
    // route is reachable but the policies do the real gating. (`create` stays closed until 4.1.)
    'api::course.course.update',
    'api::course.course.delete',
    // Task 4.1: create is guarded by the `has-app-role` policy on the route (Student -> 403),
    // and the controller forces `instructor` to the caller.
    'api::course.course.create',
    // Task 4.2: lesson writes are guarded by has-app-role + is-owner (course.instructor); the
    // custom findByCourse route limits visibility to staff/owner (5.2 adds the enrollment gate).
    'api::lesson.lesson.create',
    'api::lesson.lesson.update',
    'api::lesson.lesson.delete',
    'api::lesson.lesson.findByCourse',
    // Task 5.1: enroll — Student only (has-app-role on the route); controller sets student from JWT
    // and blocks duplicates.
    'api::enrollment.enrollment.create',
    // Task 5.2: My Courses — returns only the caller's own enrollments.
    'api::enrollment.enrollment.me',
  ],
};

/**
 * Idempotently ensure the given plugin-role has exactly the listed permission actions enabled.
 * A permission row (role, action) existing == the route is granted. We only create missing rows,
 * so re-running on every boot converges without duplicating or dropping anything.
 */
async function ensureBaselinePermissions(
  strapi: Core.Strapi,
  roleType: 'public' | 'authenticated',
  actions: string[]
): Promise<void> {
  const role = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: roleType } });

  if (!role) {
    // Fresh DB timing / plugin not ready — don't crash boot over it.
    strapi.log.warn(`[bootstrap] plugin role '${roleType}' not found; skipping baseline permissions`);
    return;
  }

  for (const action of actions) {
    const existing = await strapi.db
      .query('plugin::users-permissions.permission')
      .findOne({ where: { action, role: role.id } });

    if (!existing) {
      await strapi.db
        .query('plugin::users-permissions.permission')
        .create({ data: { action, role: role.id } });
      strapi.log.info(`[bootstrap] granted ${roleType} -> ${action}`);
    }
  }
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    for (const roleType of Object.keys(BASELINE_PERMISSIONS) as Array<'public' | 'authenticated'>) {
      await ensureBaselinePermissions(strapi, roleType, BASELINE_PERMISSIONS[roleType]);
    }
  },
};
