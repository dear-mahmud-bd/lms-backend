/**
 * enrollment router (task 5.1)
 *
 * create : Student only (`has-app-role`). The controller sets student/enrolledAt server-side and
 *          blocks duplicates. Other actions stay closed until their feature phase (e.g. /me in 5.2).
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::enrollment.enrollment', {
  config: {
    create: {
      policies: [{ name: 'global::has-app-role', config: { roles: ['student'] } }],
    },
  },
});
