/**
 * Custom route (task 10.1): GET /api/notifications/me — the caller's own notifications.
 *
 * Filename is prefixed `01-` so it registers BEFORE the core `/notifications/:id` route; otherwise
 * "me" would be matched as an :id (same reason as enrollments/me). Authenticated-only (granted to
 * Authenticated in bootstrap); the controller filters strictly by the JWT user id.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/notifications/me',
      handler: 'notification.me',
      config: {
        policies: [],
      },
    },
  ],
};
