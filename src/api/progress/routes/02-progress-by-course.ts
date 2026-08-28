/**
 * Custom route (task 6.2): GET /api/progress/:courseId — computed course progress.
 *
 * Authenticated-only; the controller does the role logic (student own-only; owning instructor / CM
 * / admin may pass ?studentId=). Filename prefixed so it registers before (and shadows) the unused
 * core `/progress/:id` findOne route.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/progress/:courseId',
      handler: 'progress.getCourseProgress',
      config: {
        policies: [],
      },
    },
  ],
};
