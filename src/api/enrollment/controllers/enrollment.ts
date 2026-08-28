/**
 * enrollment controller (task 5.1)
 *
 * POST /api/enrollments — Student only (route policy `has-app-role`). The controller:
 *  - sets `student` from the JWT (client value ignored) and `enrolledAt`/`status` server-side;
 *  - only allows enrolling in a PUBLISHED course (unpublished -> 404, hidden like 4.1);
 *  - blocks a duplicate (student, course) pair -> 409.
 *
 * GET /api/enrollments/me (task 5.2) returns only the caller's own enrollments ("My Courses").
 *
 * `student` is a users-permissions user relation, so — like course.instructor in 4.1 — it can't be
 * set through the REST body ("Invalid key"); we create via the document service instead.
 */

import { factories } from '@strapi/strapi';

/** Load a course by documentId (v5) or numeric id, with just the fields we need. */
async function loadCourse(strapi: any, ref: unknown) {
  const asString = String(ref);
  const where: any = /^\d+$/.test(asString)
    ? { $or: [{ documentId: asString }, { id: Number(asString) }] }
    : { documentId: asString };
  return strapi.db.query('api::course.course').findOne({ where });
}

export default factories.createCoreController('api::enrollment.enrollment', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user; // guaranteed a student by the route policy
    const courseRef = ctx.request.body?.data?.course;
    if (!courseRef) return ctx.badRequest('course is required.');

    const course = await loadCourse(strapi, courseRef);
    // Not found, or unpublished (a student can't see it) -> 404, don't reveal existence.
    if (!course || !course.isPublished) return ctx.notFound('Course not found.');

    const existing = await strapi.db.query('api::enrollment.enrollment').findOne({
      where: { student: user.id, course: course.id },
    });
    if (existing) return ctx.conflict('You are already enrolled in this course.');

    const entity = await strapi.documents('api::enrollment.enrollment').create({
      // All fields set server-side; any client-sent student/status/enrolledAt is ignored.
      data: {
        student: user.id,
        course: course.documentId,
        enrolledAt: new Date(),
        status: 'active',
      },
      populate: { course: true },
    });

    // Explicit response so the shape matches the contract. We build it by hand because Strapi's
    // output sanitizer strips the users-permissions `student` relation; nothing here is sensitive
    // (student is just the caller's id; course is public).
    ctx.status = 201;
    ctx.body = {
      data: {
        id: entity.id,
        documentId: entity.documentId,
        enrolledAt: entity.enrolledAt,
        status: entity.status,
        student: { id: user.id },
        course: entity.course
          ? { id: entity.course.id, documentId: entity.course.documentId, title: entity.course.title }
          : null,
      },
    };
  },

  async me(ctx) {
    const user = ctx.state.user;
    // Always the authenticated caller — client-sent ids/filters are ignored, so one user can
    // never read another's enrollments.
    const rows = await strapi.db.query('api::enrollment.enrollment').findMany({
      where: { student: user.id },
      populate: { course: true },
      orderBy: { enrolledAt: 'desc' },
    });

    ctx.body = {
      data: rows.map((e: any) => ({
        id: e.id,
        documentId: e.documentId,
        enrolledAt: e.enrolledAt,
        status: e.status,
        course: e.course
          ? {
              id: e.course.id,
              documentId: e.course.documentId,
              title: e.course.title,
              slug: e.course.slug,
            }
          : null,
      })),
    };
  },
}));
