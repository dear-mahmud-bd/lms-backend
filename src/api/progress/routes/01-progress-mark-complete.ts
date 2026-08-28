/**
 * Custom route (task 6.1): POST /api/progress/mark-complete — a student marks a lesson complete.
 * Student-only via `has-app-role`; the controller enforces enrollment and idempotency.
 * Filename prefixed `01-` to register before the core progress routes.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/progress/mark-complete',
      handler: 'progress.markComplete',
      config: {
        policies: [{ name: 'global::has-app-role', config: { roles: ['student'] } }],
      },
    },
  ],
};
