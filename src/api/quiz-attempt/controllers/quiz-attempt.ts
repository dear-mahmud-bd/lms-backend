/**
 * quiz-attempt controller (task 7.3)
 *
 * POST /api/quiz-attempts { quizId, answers } — a Student submits answers; the SERVER grades.
 *
 * `answers` maps questionId -> chosen option index. score = number of questions whose chosen index
 * equals the stored `correctAnswer` (RAW COUNT; totalQuestions captured now). score/totalQuestions
 * are computed server-side and never trusted from the client. Multiple attempts are allowed (ERD).
 *
 * Gates (consistent with the 7.2 taking read): student-only (route policy), quiz must be published,
 * and the student must be enrolled in the quiz's course. `correctAnswer` is read server-side only —
 * it is never exposed (7.2) and never echoed here.
 */

import { factories } from '@strapi/strapi';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Load a quiz by documentId or numeric id, with course + questions (incl. correctAnswer). */
async function loadQuiz(strapi: any, ref: unknown) {
  const asString = String(ref);
  const where: any = /^\d+$/.test(asString)
    ? { $or: [{ documentId: asString }, { id: Number(asString) }] }
    : { documentId: asString };
  return strapi.db
    .query('api::quiz.quiz')
    .findOne({ where, populate: { course: true, questions: true } });
}

export default factories.createCoreController('api::quiz-attempt.quiz-attempt', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user; // guaranteed a student by the route policy
    const { quizId, answers } = ctx.request.body ?? {};

    if (!quizId) return ctx.badRequest('quizId is required.');
    if (!isPlainObject(answers)) return ctx.badRequest('answers must be an object of questionId -> optionIndex.');

    const quiz = await loadQuiz(strapi, quizId);
    if (!quiz) return ctx.badRequest('Unknown quiz.');

    // Same gates as taking the quiz.
    if (!quiz.isPublished) return ctx.forbidden('This quiz is not available.');
    const enrolled = await strapi.db.query('api::enrollment.enrollment').findOne({
      where: { student: user.id, course: quiz.course?.id },
    });
    if (!enrolled) return ctx.forbidden('You must be enrolled in this course to take the quiz.');

    // Grade server-side against the stored correctAnswer.
    const questions = quiz.questions ?? [];
    let score = 0;
    for (const q of questions) {
      const chosen = (answers as Record<string, unknown>)[String(q.id)];
      if (chosen === q.correctAnswer) score += 1;
    }
    const totalQuestions = questions.length;

    const attempt = await strapi.documents('api::quiz-attempt.quiz-attempt').create({
      // All grading fields set server-side; any client-sent score/totalQuestions/student is ignored.
      data: {
        student: user.id,
        quiz: quiz.documentId,
        score,
        totalQuestions,
        answers: answers as any, // json column; already validated as a plain object above
        submittedAt: new Date(),
      },
    });

    ctx.status = 201;
    ctx.body = {
      data: {
        id: attempt.id,
        documentId: attempt.documentId,
        quiz: quiz.id,
        score,
        totalQuestions,
        answers,
        submittedAt: attempt.submittedAt,
      },
    };
  },

  async me(ctx) {
    const user = ctx.state.user;
    // Always the authenticated caller — client filters are ignored, so no one can read another's
    // attempts.
    const rows = await strapi.db.query('api::quiz-attempt.quiz-attempt').findMany({
      where: { student: user.id },
      populate: { quiz: true },
      orderBy: { submittedAt: 'desc' },
    });

    ctx.body = {
      data: rows.map((a: any) => ({
        id: a.id,
        documentId: a.documentId,
        score: a.score,
        totalQuestions: a.totalQuestions,
        answers: a.answers,
        submittedAt: a.submittedAt,
        quiz: a.quiz ? { id: a.quiz.id, title: a.quiz.title } : null,
      })),
    };
  },
}));
