/**
 * Custom route (task 7.4): GET /api/quiz-attempts/me — the caller's own attempts (with answers,
 * for review). Authenticated-only (granted to Authenticated in bootstrap); the controller filters
 * strictly by the JWT user id. Prefixed `01-` so it registers before the core `/quiz-attempts/:id`.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/quiz-attempts/me',
      handler: 'quiz-attempt.me',
      config: {
        policies: [],
      },
    },
  ],
};
