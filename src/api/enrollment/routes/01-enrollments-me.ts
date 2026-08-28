/**
 * Custom route (task 5.2): GET /api/enrollments/me — the caller's own enrollments.
 *
 * Filename is prefixed `01-` so it registers BEFORE the core `/enrollments/:id` route; otherwise
 * "me" would be matched as an :id. Authenticated-only (granted to Authenticated in bootstrap);
 * the controller filters strictly by the JWT user id.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/enrollments/me',
      handler: 'enrollment.me',
      config: {
        policies: [],
      },
    },
  ],
};
