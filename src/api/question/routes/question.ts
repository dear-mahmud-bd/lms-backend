/**
 * question router (task 7.1)
 *
 * create : `has-app-role`; controller checks the quiz's course ownership + validates the answer.
 * update/delete : `has-app-role` + `is-owner` resolved through `question.quiz.course.instructor`.
 */

import { factories } from '@strapi/strapi';

const STAFF_OR_INSTRUCTOR = { roles: ['admin', 'content-manager', 'instructor'] };
const QUESTION_OWNERSHIP = { contentType: 'api::question.question', ownerPath: 'quiz.course.instructor' };

export default factories.createCoreRouter('api::question.question', {
  config: {
    create: {
      policies: [{ name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR }],
    },
    update: {
      policies: [
        { name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR },
        { name: 'global::is-owner', config: QUESTION_OWNERSHIP },
      ],
    },
    delete: {
      policies: [
        { name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR },
        { name: 'global::is-owner', config: QUESTION_OWNERSHIP },
      ],
    },
  },
});
