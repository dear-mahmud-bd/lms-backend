/**
 * course router
 *
 * Task 2.3: `update` and `delete` are guarded server-side by the reusable policies —
 *   1. `has-app-role` — only admin / content-manager / instructor may reach the route (Student 403).
 *   2. `is-owner`     — instructors may only mutate their OWN course; admin/CM bypass.
 * This is the canonical demonstration of the 2.3 policies. Task 4.1 builds the rest of course CRUD
 * (POST sets `instructor` from the JWT, GET filters `isPublished` for students) on top of this.
 */

import { factories } from '@strapi/strapi';

const STAFF_OR_INSTRUCTOR = { roles: ['admin', 'content-manager', 'instructor'] };
const COURSE_OWNERSHIP = { contentType: 'api::course.course', ownerPath: 'instructor' };

export default factories.createCoreRouter('api::course.course', {
  config: {
    update: {
      policies: [
        { name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR },
        { name: 'global::is-owner', config: COURSE_OWNERSHIP },
      ],
    },
    delete: {
      policies: [
        { name: 'global::has-app-role', config: STAFF_OR_INSTRUCTOR },
        { name: 'global::is-owner', config: COURSE_OWNERSHIP },
      ],
    },
  },
});
