/**
 * Custom route (task 4.2): GET /api/courses/:courseId/lessons — a course's lessons ordered by
 * `order`. Authenticated-only (granted to the Authenticated role in bootstrap); the controller
 * limits visibility to staff/owner for now (task 5.2 relaxes to enrolled students).
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/courses/:courseId/lessons',
      handler: 'lesson.findByCourse',
      config: {
        policies: [],
      },
    },
  ],
};
