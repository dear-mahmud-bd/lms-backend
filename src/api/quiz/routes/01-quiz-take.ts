/**
 * Custom route (task 7.2): GET /api/quizzes/:quizId/take — student-facing quiz read that OMITS
 * correctAnswer. Authenticated-only; the controller enforces published + enrollment (staff/owner
 * exempt) and returns a hand-built, answer-free projection. Prefixed `01-` to register early.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/quizzes/:quizId/take',
      handler: 'quiz.take',
      config: {
        policies: [],
      },
    },
  ],
};
