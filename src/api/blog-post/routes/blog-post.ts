/**
 * blog-post router (task 8.1)
 *
 * create : Admin/CM only (`has-app-role`); controller sets author + forces draft.
 * update/delete : `has-app-role` + `is-owner`(author) with bypassRoles ['admin'] — Admin manages
 *                 any post, a Content-Manager only their own.
 */

import { factories } from '@strapi/strapi';

const ADMIN_OR_CM = { roles: ['admin', 'content-manager'] };
const BLOG_OWNERSHIP = {
  contentType: 'api::blog-post.blog-post',
  ownerPath: 'author',
  bypassRoles: ['admin'], // CM must own their posts; only admin manages any
};

export default factories.createCoreRouter('api::blog-post.blog-post', {
  config: {
    create: {
      policies: [{ name: 'global::has-app-role', config: ADMIN_OR_CM }],
    },
    update: {
      policies: [
        { name: 'global::has-app-role', config: ADMIN_OR_CM },
        { name: 'global::is-owner', config: BLOG_OWNERSHIP },
      ],
    },
    delete: {
      policies: [
        { name: 'global::has-app-role', config: ADMIN_OR_CM },
        { name: 'global::is-owner', config: BLOG_OWNERSHIP },
      ],
    },
  },
});
