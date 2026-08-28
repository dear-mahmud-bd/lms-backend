/**
 * lesson router (task 4.2)
 *
 * create : `has-app-role` (admin/CM/instructor); the controller checks the caller owns the target
 *          course (Student -> 403 at the policy).
 * update/delete : `has-app-role` + `is-owner` resolved through `lesson.course.instructor` (2.3).
 */

import { factories } from '@strapi/strapi';

const STAFF_OR_INSTRUCTOR = { roles: ['admin', 'content-manager', 'instructor'] };
const LESSON_OWNERSHIP = { contentType: 'api::lesson.lesson', ownerPath: 'course.instructor' };

export default factories.createCoreRouter('api::lesson.lesson', {
  config: {
    create: {
      policies: [{ name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR }],
    },
    update: {
      policies: [
        { name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR },
        { name: 'global::is-owner', config: LESSON_OWNERSHIP },
      ],
    },
    delete: {
      policies: [
        { name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR },
        { name: 'global::is-owner', config: LESSON_OWNERSHIP },
      ],
    },
  },
});
