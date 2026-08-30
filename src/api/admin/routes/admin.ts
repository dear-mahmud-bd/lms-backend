/**
 * admin routes (task 9.1, extended 17.2). Admin-only via `has-app-role`. (`/api/admin/...` is the
 * content API, distinct from the Strapi admin panel at `/admin`.)
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
      // task 17.2 — list users for the role-management UI. Admin-only via the same policy.
      method: 'GET',
      path: '/admin/users',
      handler: 'admin.listUsers',
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
