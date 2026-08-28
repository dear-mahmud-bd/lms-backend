/**
 * Custom route (task 10.1): PUT /api/notifications/:id/read — mark the caller's OWN notification read.
 *
 * Ownership is enforced server-side by the `is-owner` policy against the `recipient` relation.
 * bypassRoles is [] on purpose: notifications are personal, so NO role — not even admin — may mark
 * another user's notification. Policy 404s a missing row and 403s a recipient mismatch, so the
 * controller only runs for the true owner.
 */
export default {
  routes: [
    {
      method: 'PUT',
      path: '/notifications/:id/read',
      handler: 'notification.markRead',
      config: {
        policies: [
          {
            name: 'global::is-owner',
            config: {
              contentType: 'api::notification.notification',
              ownerPath: 'recipient',
              bypassRoles: [],
            },
          },
        ],
      },
    },
  ],
};
