/**
 * question controller (task 7.1)
 *
 * Question CRUD; ownership resolves through `question.quiz.course.instructor` (3 levels).
 *  - create: `has-app-role` on the route; controller checks the caller owns the quiz's course
 *    (admin/CM bypass) and validates options/correctAnswer.
 *  - update/delete: guarded by `has-app-role` + `is-owner`(quiz.course.instructor) route policies;
 *    update re-validates options/correctAnswer and can't re-parent to another quiz.
 *
 * `correctAnswer` is a 0-based index into `options` and is kept server-side (stripped from the
 * student taking-read in 7.2); validating it here keeps grading (7.3) sound.
 */

import { factories } from '@strapi/strapi';

const MANAGE_ANY_ROLES = ['admin', 'content-manager'];
const canManageAny = (user: any): boolean => Boolean(user) && MANAGE_ANY_ROLES.includes(user.appRole);

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

/** Load a quiz by documentId or numeric id, with course.instructor for the ownership check. */
async function loadQuiz(strapi: any, ref: unknown) {
  const asString = String(ref);
  const where: any = /^\d+$/.test(asString)
    ? { $or: [{ documentId: asString }, { id: Number(asString) }] }
    : { documentId: asString };
  return strapi.db
    .query('api::quiz.quiz')
    .findOne({ where, populate: { course: { populate: { instructor: true } } } });
}

export default factories.createCoreController('api::question.question', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    const data = { ...(ctx.request.body?.data || {}) };

    if (!data.prompt) return ctx.badRequest('prompt is required.');
    const err = validateOptionsAnswer(data.options, data.correctAnswer);
    if (err) return ctx.badRequest(err);

    if (!data.quiz) return ctx.badRequest('quiz is required.');
    const quiz = await loadQuiz(strapi, data.quiz);
    if (!quiz) return ctx.badRequest('Invalid quiz.');
    if (!canManageAny(user) && quiz.course?.instructor?.id !== user.id) {
      return ctx.forbidden('You can only add questions to quizzes in your own course.');
    }

    delete data.quiz;
    const entity = await strapi.documents('api::question.question').create({
      data: { ...data, quiz: quiz.documentId },
    });

    const self = this as any;
    ctx.status = 201;
    return self.transformResponse(await self.sanitizeOutput(entity, ctx));
  },

  async update(ctx) {
    const data = ctx.request.body?.data || {};

    if ('options' in data || 'correctAnswer' in data) {
      const existing = await strapi.db
        .query('api::question.question')
        .findOne({ where: { documentId: ctx.params.id } });
      const options = 'options' in data ? data.options : existing?.options;
      const correctAnswer = 'correctAnswer' in data ? data.correctAnswer : existing?.correctAnswer;
      const err = validateOptionsAnswer(options, correctAnswer);
      if (err) return ctx.badRequest(err);
    }

    if ('quiz' in data) delete data.quiz; // no re-parenting to another quiz
    return super.update(ctx);
  },
}));
