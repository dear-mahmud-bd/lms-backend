/**
 * quiz router (task 7.1)
 *
 * create : `has-app-role` (admin/CM/instructor); controller checks course ownership.
 * update/delete : `has-app-role` + `is-owner` resolved through `quiz.course.instructor` (2.3).
 */

import { factories } from '@strapi/strapi';

const STAFF_OR_INSTRUCTOR = { roles: ['admin', 'content-manager', 'instructor'] };
const QUIZ_OWNERSHIP = { contentType: 'api::quiz.quiz', ownerPath: 'course.instructor' };

export default factories.createCoreRouter('api::quiz.quiz', {
  config: {
    create: {
      policies: [{ name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR }],
    },
    update: {
      policies: [
        { name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR },
        { name: 'global::is-owner', config: QUIZ_OWNERSHIP },
      ],
    },
    delete: {
      policies: [
        { name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR },
        { name: 'global::is-owner', config: QUIZ_OWNERSHIP },
      ],
    },
  },
});
