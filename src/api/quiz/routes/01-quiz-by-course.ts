/**
 * Custom route: GET /api/quizzes/by-course/:courseId — list a course's quizzes as
 * metadata (no correctAnswer, no drafts for students). Authenticated-only; the
 * controller (`quiz.listByCourse`) enforces owner/staff-vs-enrolled-student gating.
 * Prefixed `01-` to register before the core router, mirroring 01-quiz-take.ts.
 * The 3-segment path can't collide with the core `/quizzes/:id`.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/quizzes/by-course/:courseId',
      handler: 'quiz.listByCourse',
      config: {
        policies: [],
      },
    },
  ],
};
