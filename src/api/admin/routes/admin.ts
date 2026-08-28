/**
 * admin routes (task 9.1). Admin-only via `has-app-role`. (`/api/admin/...` is the content API,
 * distinct from the Strapi admin panel at `/admin`.)
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/admin/stats',
      handler: 'admin.stats',
      config: {
        policies: [{ name: 'global::has-app-role', config: { roles: ['admin'] } }],
      },
    },
    {
      // task 9.2 — change a user's canonical appRole. Admin-only via the same policy.
      method: 'PUT',
      path: '/admin/users/:id/role',
      handler: 'admin.setUserRole',
      config: {
        policies: [{ name: 'global::has-app-role', config: { roles: ['admin'] } }],
      },
    },
  ],
};
