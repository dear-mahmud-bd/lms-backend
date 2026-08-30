/**
 * course controller (task 4.1)
 *
 * CRUD per docs/permission-matrix.md + docs/api-contracts.md:
 *  - create : `instructor` is set server-side from the JWT (client value ignored). Route policy
 *             `has-app-role` restricts to admin/content-manager/instructor (Student -> 403).
 *  - update : ownership transfer is blocked (client `instructor` stripped). Own-only / admin bypass
 *             is enforced by the `has-app-role` + `is-owner` route policies (task 2.3).
 *  - find/findOne : role-based visibility — students & the public see only `isPublished: true`;
 *             admin/content-manager/instructor see everything.
 *
 * `isPublished` (boolean) is the single publish gate; `draftAndPublish` is disabled on this type.
 * Role is read from `ctx.state.user.appRole` (canonical role, task 2.1), never a client value.
 */

import { factories } from '@strapi/strapi';

const STAFF_ROLES = ['admin', 'content-manager', 'instructor'];

const isStaff = (user: any): boolean => Boolean(user) && STAFF_ROLES.includes(user.appRole);

export default factories.createCoreController('api::course.course', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    const data = { ...(ctx.request.body?.data || {}) };
    // Never trust a client-sent instructor. We set ownership via the document service because the
    // content-API input validator rejects a user relation in the request body ("Invalid key
    // instructor"); the document service is server-side and not subject to that restriction.
    delete data.instructor;

    const entity = await strapi.documents('api::course.course').create({
      data: { ...data, instructor: user.id },
    });

    const self = this as any;
    const sanitized = await self.sanitizeOutput(entity, ctx);
    return self.transformResponse(sanitized);
  },

  async update(ctx) {
    if (ctx.request.body?.data) {
      // Ownership can't be reassigned via edit — drop any client-sent instructor.
      delete ctx.request.body.data.instructor;
    }
    return super.update(ctx);
  },

  async find(ctx) {
    const user = ctx.state.user;

    // Instructors manage only their OWN courses (task 15.1). We can't let the
    // client filter by the `instructor` relation — the content-API query
    // validator rejects it ("Invalid key instructor") because that users-
    // permissions relation is protected. So scope it server-side via the core
    // service (not subject to that query validation) using the JWT's user id.
    if (user?.appRole === 'instructor') {
      const sanitizedQuery = await (this as any).sanitizeQuery(ctx);
      const { results, pagination } = await strapi
        .service('api::course.course')
        .find({
          ...sanitizedQuery,
          filters: { ...(sanitizedQuery?.filters || {}), instructor: user.id },
        });
      const sanitized = await (this as any).sanitizeOutput(results, ctx);
      return (this as any).transformResponse(sanitized, { pagination });
    }

    if (!isStaff(user)) {
      // Students and the public only ever see published courses.
      ctx.query = {
        ...ctx.query,
        filters: { ...(ctx.query?.filters as object), isPublished: true },
      };
    }
    return super.find(ctx);
  },

  async findOne(ctx) {
    const response = await super.findOne(ctx);
    const course = response?.data;
    // Hide an unpublished course from students/public with a 404 (don't reveal its existence).
    if (course && !isStaff(ctx.state.user)) {
      const published = course.attributes?.isPublished ?? course.isPublished;
      if (!published) return ctx.notFound();
    }
    return response;
  },
}));
