/**
 * quiz-attempt router (task 7.3)
 *
 * create : Student only (`has-app-role`). The controller grades server-side and stores the attempt.
 * (GET /quiz-attempts/me is added in 7.4.)
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::quiz-attempt.quiz-attempt', {
  config: {
    create: {
      policies: [{ name: 'global::has-app-role', config: { roles: ['student'] } }],
    },
  },
});
