/**
 * quiz controller (task 7.1)
 *
 * Quiz CRUD; ownership resolves through `quiz.course.instructor`.
 *  - create: `has-app-role` on the route (Student 403); controller checks the caller owns the
 *    target course (admin/CM bypass). Optional nested `questions[]` are validated then created.
 *  - update/delete: guarded by `has-app-role` + `is-owner`(course.instructor) route policies (2.3);
 *    update can't re-parent the quiz to another course.
 *
 * Task 7.2 — `take` (GET /api/quizzes/:quizId/take): the student-facing read. Returns questions as
 * `{ id, prompt, options, order }` only; `correctAnswer` is NEVER serialized (built by hand so no
 * ?populate/?fields trick can leak it). Published quiz + enrollment required (staff/owner exempt).
 *
 * Relations (course/quiz) are set via the document service (consistent with 4.x/5.x).
 */

import { factories } from '@strapi/strapi';

const MANAGE_ANY_ROLES = ['admin', 'content-manager'];
const canManageAny = (user: any): boolean => Boolean(user) && MANAGE_ANY_ROLES.includes(user.appRole);

/** Validate a question's options/correctAnswer. Returns an error message, or null if OK. */
function validateOptionsAnswer(options: unknown, correctAnswer: unknown): string | null {
  if (!Array.isArray(options) || options.length === 0) {
    return 'options must be a non-empty array';
  }
  if (
    !Number.isInteger(correctAnswer) ||
    (correctAnswer as number) < 0 ||
    (correctAnswer as number) >= options.length
  ) {
    return 'correctAnswer must be an integer index within options';
  }
  return null;
}

async function loadCourse(strapi: any, ref: unknown) {
  const asString = String(ref);
  const where: any = /^\d+$/.test(asString)
    ? { $or: [{ documentId: asString }, { id: Number(asString) }] }
    : { documentId: asString };
  return strapi.db.query('api::course.course').findOne({ where, populate: { instructor: true } });
}

/** Load a quiz by documentId or numeric id, with course.instructor and its questions (for taking). */
async function loadQuizForTake(strapi: any, ref: unknown) {
  const asString = String(ref);
  const where: any = /^\d+$/.test(asString)
    ? { $or: [{ documentId: asString }, { id: Number(asString) }] }
    : { documentId: asString };
  return strapi.db.query('api::quiz.quiz').findOne({
    where,
    populate: { course: { populate: { instructor: true } }, questions: true },
  });
}

export default factories.createCoreController('api::quiz.quiz', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    const data = { ...(ctx.request.body?.data || {}) };

    if (!data.course) return ctx.badRequest('course is required.');
    const course = await loadCourse(strapi, data.course);
    if (!course) return ctx.badRequest('Invalid course.');
    if (!canManageAny(user) && course.instructor?.id !== user.id) {
      return ctx.forbidden('You can only add quizzes to your own course.');
    }

    // Validate nested questions up front — reject the whole batch if any is invalid (no half-build).
    const questions = Array.isArray(data.questions) ? data.questions : [];
    for (const q of questions) {
      if (!q?.prompt) return ctx.badRequest('Invalid question: prompt is required');
      const err = validateOptionsAnswer(q.options, q.correctAnswer);
      if (err) return ctx.badRequest(`Invalid question: ${err}`);
    }

    delete data.questions;
    delete data.course;

    const quiz = await strapi.documents('api::quiz.quiz').create({
      data: { ...data, course: course.documentId },
    });

    for (const q of questions) {
      await strapi.documents('api::question.question').create({
        data: {
          prompt: q.prompt,
          options: q.options,
          correctAnswer: q.correctAnswer,
          order: q.order,
          quiz: quiz.documentId,
        },
      });
    }

    // Build the response explicitly so nested questions are included (the create/sanitize path
    // drops the populated relation). correctAnswer is fine here — the caller owns the quiz; only
    // the student taking-read (7.2) strips it.
    const questionRows = await strapi.db.query('api::question.question').findMany({
      where: { quiz: quiz.id },
      orderBy: { order: 'asc' },
    });

    ctx.status = 201;
    ctx.body = {
      data: {
        id: quiz.id,
        documentId: quiz.documentId,
        title: quiz.title,
        description: quiz.description,
        isPublished: quiz.isPublished,
        course: { id: course.id, documentId: course.documentId, title: course.title },
        questions: questionRows.map((q: any) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          correctAnswer: q.correctAnswer,
          order: q.order,
        })),
      },
    };
  },

  async update(ctx) {
    const data = ctx.request.body?.data;
    if (data && 'course' in data) delete data.course; // no re-parenting to another course
    return super.update(ctx);
  },

  async take(ctx) {
    const user = ctx.state.user;
    const quiz = await loadQuizForTake(strapi, ctx.params.quizId);
    if (!quiz) return ctx.notFound('Quiz not found.');

    const isOwner = quiz.course?.instructor?.id === user?.id;
    const staffOrOwner = canManageAny(user) || isOwner;

    // Unpublished quizzes are hidden from students (owner/staff may preview).
    if (!quiz.isPublished && !staffOrOwner) return ctx.notFound('Quiz not found.');

    // Students must be enrolled in the quiz's course.
    if (!staffOrOwner) {
      const enrolled = await strapi.db.query('api::enrollment.enrollment').findOne({
        where: { student: user?.id, course: quiz.course?.id },
      });
      if (!enrolled) {
        return ctx.forbidden('You must be enrolled in this course to take the quiz.');
      }
    }

    // Hand-built projection — ONLY safe fields. correctAnswer is never read into the response.
    const questions = (quiz.questions || [])
      .slice()
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .map((q: any) => ({ id: q.id, prompt: q.prompt, options: q.options, order: q.order }));

    ctx.body = {
      data: {
        id: quiz.id,
        documentId: quiz.documentId,
        title: quiz.title,
        description: quiz.description,
        questions,
      },
    };
  },

  /**
   * GET /api/quizzes/by-course/:courseId — list a course's quizzes as METADATA only
   * (title/description/questionCount). Same gating as `take`: owner/staff see all
   * quizzes (incl. drafts) with `isPublished`; an enrolled student sees published
   * quizzes only; anyone else is 403. Never serializes questions or correctAnswer —
   * this is just an index; authoring/taking have their own reads.
   */
  async listByCourse(ctx) {
    const user = ctx.state.user;
    const course = await loadCourse(strapi, ctx.params.courseId);
    if (!course) return ctx.notFound('Course not found.');

    const isOwner = course.instructor?.id === user?.id;
    const staffOrOwner = canManageAny(user) || isOwner;

    // Students may only list quizzes for a course they're enrolled in.
    if (!staffOrOwner) {
      const enrolled = await strapi.db.query('api::enrollment.enrollment').findOne({
        where: { student: user?.id, course: course.id },
      });
      if (!enrolled) {
        return ctx.forbidden('You must be enrolled in this course to view its quizzes.');
      }
    }

    const quizzes = await strapi.db.query('api::quiz.quiz').findMany({
      // Students never see drafts; owner/staff see everything.
      where: staffOrOwner ? { course: course.id } : { course: course.id, isPublished: true },
      populate: { questions: true },
      orderBy: { id: 'asc' },
    });

    ctx.body = {
      data: quizzes.map((q: any) => ({
        id: q.id,
        documentId: q.documentId,
        title: q.title,
        description: q.description,
        questionCount: Array.isArray(q.questions) ? q.questions.length : 0,
        // isPublished is only meaningful to (and only returned for) owner/staff.
        ...(staffOrOwner ? { isPublished: q.isPublished } : {}),
      })),
    };
  },
}));
