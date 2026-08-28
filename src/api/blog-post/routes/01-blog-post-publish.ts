/**
 * Custom route (task 8.2): PUT /api/blog-posts/:id/publish — flip a post to published.
 * Admin any / CM own (has-app-role + is-owner author with bypassRoles ['admin']).
 * Prefixed `01-` so it registers before the core `/blog-posts/:id` routes.
 */
export default {
  routes: [
    {
      method: 'PUT',
      path: '/blog-posts/:id/publish',
      handler: 'blog-post.publish',
      config: {
        policies: [
          { name: 'global::has-app-role', config: { roles: ['admin', 'content-manager'] } },
          {
            name: 'global::is-owner',
            config: { contentType: 'api::blog-post.blog-post', ownerPath: 'author', bypassRoles: ['admin'] },
          },
        ],
      },
    },
  ],
};
