/**
 * progress controller (task 6.1)
 *
 * POST /api/progress/mark-complete { lessonId } — a Student marks one lesson complete.
 * GET  /api/progress/:courseId              — computed progress; own for students, staff/owner
 *                                              instructors may pass ?studentId= for another student.
 *
 * Progress is a (student, lesson) join and percent is COMPUTED, never stored (see docs/erd.md):
 *   percent = round( completedCount / totalLessons * 100 ),  totalLessons==0 => 0
 * where completedCount = the student's progress rows for lessons OF THIS COURSE, and
 * totalLessons = the course's lesson count. Recomputed on every call.
 *
 * Rules: student-only (route policy); must be enrolled in the lesson's course; idempotent — one
 * (student, lesson) row max. `student` is a users-permissions user relation, so rows are created
 * via the document service (can't be set through the REST body — see 4.1/5.1).
 */

import { factories } from '@strapi/strapi';

/** Load a lesson by documentId (v5) or numeric id, with its course. */
async function loadLesson(strapi: any, ref: unknown) {
  const asString = String(ref);
  const where: any = /^\d+$/.test(asString)
    ? { $or: [{ documentId: asString }, { id: Number(asString) }] }
    : { documentId: asString };
  return strapi.db.query('api::lesson.lesson').findOne({ where, populate: { course: true } });
}

/** Load a course by documentId (v5) or numeric id, with its instructor (for ownership checks). */
async function loadCourse(strapi: any, ref: unknown) {
  const asString = String(ref);
  const where: any = /^\d+$/.test(asString)
    ? { $or: [{ documentId: asString }, { id: Number(asString) }] }
    : { documentId: asString };
  return strapi.db.query('api::course.course').findOne({ where, populate: { instructor: true } });
}

export default factories.createCoreController('api::progress.progress', ({ strapi }) => ({
  async markComplete(ctx) {
    const user = ctx.state.user; // guaranteed a student by the route policy
    const lessonRef = ctx.request.body?.lessonId;
    if (!lessonRef) return ctx.badRequest('lessonId is required.');

    const lesson = await loadLesson(strapi, lessonRef);
    if (!lesson) return ctx.notFound('Lesson not found.');

    const course = lesson.course;
    if (!course) return ctx.notFound('Lesson not found.'); // orphan lesson — treat as not found

    // Must be enrolled in the lesson's course.
    const enrollment = await strapi.db.query('api::enrollment.enrollment').findOne({
      where: { student: user.id, course: course.id },
    });
    if (!enrollment) {
      return ctx.forbidden('You must be enrolled in this course to mark its lessons complete.');
    }

    // Idempotent: reuse an existing (student, lesson) row, else create one.
    let progress = await strapi.db.query('api::progress.progress').findOne({
      where: { student: user.id, lesson: lesson.id },
    });
    if (!progress) {
      progress = await strapi.documents('api::progress.progress').create({
        data: { student: user.id, lesson: lesson.documentId, completedAt: new Date() },
      });
    }

    // Recompute progress for this (student, course).
    const totalLessons = await strapi.db
      .query('api::lesson.lesson')
      .count({ where: { course: course.id } });
    const completedCount = await strapi.db
      .query('api::progress.progress')
      .count({ where: { student: user.id, lesson: { course: course.id } } });
    const percent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    ctx.body = {
      progress: {
        id: progress.id,
        lesson: lesson.id,
        completedAt: progress.completedAt,
      },
      courseId: course.id,
      completedCount,
      totalLessons,
      percent,
    };
  },

  async getCourseProgress(ctx) {
    const caller = ctx.state.user;
    const course = await loadCourse(strapi, ctx.params.courseId);
    if (!course) return ctx.notFound('Course not found.');

    // Default to the caller; only staff / owning instructor may target another student.
    const requested = ctx.query?.studentId;
    const targetStudentId = requested ? Number(requested) : caller.id;

    const role = caller.appRole;
    if (role === 'student') {
      if (targetStudentId !== caller.id) {
        return ctx.forbidden('You can only view your own progress.');
      }
    } else if (role === 'instructor') {
      if (course.instructor?.id !== caller.id) {
        return ctx.forbidden('You can only view progress for your own courses.');
      }
    }
    // admin / content-manager: any course, any student.

    const totalLessons = await strapi.db
      .query('api::lesson.lesson')
      .count({ where: { course: course.id } });

    const rows = await strapi.db.query('api::progress.progress').findMany({
      where: { student: targetStudentId, lesson: { course: course.id } },
      populate: { lesson: true },
    });
    const completedLessonIds = rows.map((p: any) => p.lesson?.id).filter(Boolean);
    const completedCount = completedLessonIds.length;
    const percent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    ctx.body = {
      courseId: course.id,
      studentId: targetStudentId,
      completedLessonIds,
      completedCount,
      totalLessons,
      percent,
    };
  },
}));
