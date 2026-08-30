import type { Core } from '@strapi/strapi';
import { registerDashboardStats } from './graphql/dashboard-stats';

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
    // Task 6.1: mark a lesson complete — Student only (has-app-role); enrollment + idempotency
    // enforced in the controller.
    'api::progress.progress.markComplete',
    // Task 6.2: computed course progress — role checks (own/owner/staff) in the controller.
    'api::progress.progress.getCourseProgress',
    // Task 7.1: quiz + question writes — guarded by has-app-role + is-owner (course.instructor /
    // quiz.course.instructor); controllers validate ownership + correctAnswer range.
    'api::quiz.quiz.create',
    'api::quiz.quiz.update',
    'api::quiz.quiz.delete',
    'api::question.question.create',
    'api::question.question.update',
    'api::question.question.delete',
    // Task 7.2: student-facing quiz-taking read (strips correctAnswer; controller gates on
    // published + enrollment).
    'api::quiz.quiz.take',
    // Task 7.3: submit a quiz attempt — Student only (has-app-role); server grades against the
    // stored correctAnswer and computes score/totalQuestions.
    'api::quiz-attempt.quiz-attempt.create',
    // Task 7.4: My attempts — returns only the caller's own attempts (with answers).
    'api::quiz-attempt.quiz-attempt.me',
    // Task 8.1: blog writes — Admin/CM only (has-app-role); update/delete add is-owner(author) with
    // CM own-only (bypassRoles ['admin']). Controller sets author + forces draft on create.
    'api::blog-post.blog-post.create',
    'api::blog-post.blog-post.update',
    'api::blog-post.blog-post.delete',
    // Task 8.2: publish a post (Admin any / CM own via route policies).
    'api::blog-post.blog-post.publish',
    // Task 9.1: platform stats — Admin only (has-app-role {admin} on the route).
    'api::admin.admin.stats',
    // Task 17.2: list users for the role-management UI — Admin only (has-app-role {admin} on the
    // route). Opened to Authenticated only so an admin JWT reaches the policy; the policy restricts.
    'api::admin.admin.listUsers',
    // Task 9.2: change a user's appRole — Admin only (has-app-role {admin} on the route).
    // Route must be opened to Authenticated so an admin JWT reaches the policy; the policy
    // (not this grant) is what restricts it to admins.
    'api::admin.admin.setUserRole',
    // Task 10.1: own-only notifications — any authenticated user reads their own list (`me`) and
    // marks their own read (`markRead`). `me` filters by JWT id; `markRead` is gated by the
    // is-owner policy (recipient, no admin bypass). Core CRUD stays closed.
    'api::notification.notification.me',
    'api::notification.notification.markRead',
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
  register({ strapi }: { strapi: Core.Strapi }) {
    // Task 11.1: register the read-only, admin-only `dashboardStats` GraphQL query. Must run in
    // `register` so the graphql extension is applied before the schema is built.
    registerDashboardStats(strapi);
  },

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
