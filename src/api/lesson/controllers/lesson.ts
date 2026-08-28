/**
 * lesson controller (task 4.2)
 *
 * Ownership is nested: a lesson belongs to a course, and the course has the instructor. So:
 *  - update/delete are guarded by the route policies `has-app-role` + `is-owner`(course.instructor).
 *  - create can't use the `is-owner` policy (the lesson doesn't exist yet), so ownership of the
 *    target course is checked here in the controller: admin/CM bypass, instructor must own it.
 *  - findByCourse serves GET /api/courses/:courseId/lessons, ordered by `order`.
 *
 * Business rule: a lesson must have at least one of `content` / `videoUrl` (400 otherwise).
 * Role is read from `ctx.state.user.appRole` (canonical role, task 2.1).
 */

import { factories } from '@strapi/strapi';

const MANAGE_ANY_ROLES = ['admin', 'content-manager'];
const canManageAny = (user: any): boolean => Boolean(user) && MANAGE_ANY_ROLES.includes(user.appRole);

const hasContentOrVideo = (content: unknown, videoUrl: unknown): boolean =>
  Boolean(content) || Boolean(videoUrl);

/** Load a course by documentId (v5) or numeric id, with its instructor, for ownership checks. */
async function loadCourse(strapi: any, ref: unknown) {
  const asString = String(ref);
  const where: any = /^\d+$/.test(asString)
    ? { $or: [{ documentId: asString }, { id: Number(asString) }] }
    : { documentId: asString };
  return strapi.db.query('api::course.course').findOne({ where, populate: { instructor: true } });
}

export default factories.createCoreController('api::lesson.lesson', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    const data = { ...(ctx.request.body?.data || {}) };

    if (!hasContentOrVideo(data.content, data.videoUrl)) {
      return ctx.badRequest('A lesson needs at least one of content or videoUrl.');
    }
    if (!data.course) {
      return ctx.badRequest('course is required.');
    }

    const course = await loadCourse(strapi, data.course);
    if (!course) return ctx.badRequest('Invalid course.');

    // Instructor may only add lessons to a course they own; admin/CM may add to any.
    if (!canManageAny(user) && course.instructor?.id !== user.id) {
      return ctx.forbidden('You can only add lessons to your own course.');
    }

    const entity = await strapi.documents('api::lesson.lesson').create({
      data: { ...data, course: course.documentId },
    });

    const self = this as any;
    return self.transformResponse(await self.sanitizeOutput(entity, ctx));
  },

  async update(ctx) {
    const data = ctx.request.body?.data || {};

    // Re-check the content/videoUrl rule against the effective (merged) state.
    if ('content' in data || 'videoUrl' in data) {
      const existing = await strapi.db
        .query('api::lesson.lesson')
        .findOne({ where: { documentId: ctx.params.id } });
      const content = 'content' in data ? data.content : existing?.content;
      const videoUrl = 'videoUrl' in data ? data.videoUrl : existing?.videoUrl;
      if (!hasContentOrVideo(content, videoUrl)) {
        return ctx.badRequest('A lesson needs at least one of content or videoUrl.');
      }
    }

    // Lessons can't be moved to another course via edit (would bypass the ownership check).
    if ('course' in data) delete data.course;

    return super.update(ctx);
  },

  async findByCourse(ctx) {
    const user = ctx.state.user;
    const course = await loadCourse(strapi, ctx.params.courseId);
    if (!course) return ctx.notFound();

    const isOwner = course.instructor?.id === user?.id;
    if (!canManageAny(user) && !isOwner) {
      // Task 4.2 placeholder: only staff/owner for now. Task 5.2 relaxes this to enrolled students.
      return ctx.forbidden('You must be enrolled in this course to view its lessons.');
    }

    const lessons = await strapi.documents('api::lesson.lesson').findMany({
      filters: { course: { documentId: course.documentId } },
      sort: 'order:asc',
    });

    const self = this as any;
    return self.transformResponse(await self.sanitizeOutput(lessons, ctx));
  },
}));
