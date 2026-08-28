/**
 * Task 11.1 — additive, read-only GraphQL dashboard query.
 *
 * Registers a single `dashboardStats` query on top of an otherwise EMPTY GraphQL schema
 * (config/plugins.ts sets `shadowCRUD: false`, so there is no auto CRUD and there are no
 * mutations). The query returns the same aggregate as the REST `GET /api/admin/stats` (task 9.1)
 * and is guarded the same way: ADMIN ONLY, enforced server-side inside the resolver.
 *
 * Why the appRole check lives in the resolver (not the plugin's `auth`): like our `has-app-role`
 * policy, the users-permissions boolean auth can only tell public vs authenticated — it can't
 * express our 4 appRoles. So we mark the resolver `auth: false` and do the admin check by hand
 * against `context.state.user.appRole` (the canonical role from task 2.1).
 */
import { GraphQLError } from 'graphql';

const APP_ROLES = ['admin', 'content-manager', 'instructor', 'student'] as const;

export function registerDashboardStats(strapi: any): void {
  const extension = strapi.plugin('graphql').service('extension');

  extension.use(({ strapi }: { strapi: any }) => ({
    typeDefs: `
      type UsersByRole {
        admin: Int!
        contentManager: Int!
        instructor: Int!
        student: Int!
      }

      type DashboardStats {
        usersByRole: UsersByRole!
        totalCourses: Int!
        totalEnrollments: Int!
      }

      extend type Query {
        dashboardStats: DashboardStats!
      }
    `,
    resolvers: {
      Query: {
        dashboardStats: async (_parent: any, _args: any, context: any) => {
          const user = context?.state?.user;
          // Admin-only — mirrors has-app-role {admin} on the REST route. Anonymous or any
          // non-admin appRole is rejected server-side.
          if (!user || user.appRole !== 'admin') {
            // GraphQLError with a FORBIDDEN code so the client sees a clean 403-equivalent
            // (Apollo maps a bare thrown Strapi error to INTERNAL_SERVER_ERROR instead).
            throw new GraphQLError('Forbidden: admin only.', {
              extensions: { code: 'FORBIDDEN' },
            });
          }

          const counts: Record<string, number> = {};
          for (const role of APP_ROLES) {
            counts[role] = await strapi.db
              .query('plugin::users-permissions.user')
              .count({ where: { appRole: role } });
          }

          return {
            usersByRole: {
              admin: counts['admin'],
              // GraphQL field names can't contain hyphens; map the content-manager count.
              contentManager: counts['content-manager'],
              instructor: counts['instructor'],
              student: counts['student'],
            },
            totalCourses: await strapi.db.query('api::course.course').count(),
            totalEnrollments: await strapi.db.query('api::enrollment.enrollment').count(),
          };
        },
      },
    },
    resolversConfig: {
      // We handle authz ourselves (appRole check above), so disable the plugin's own auth gate.
      'Query.dashboardStats': { auth: false },
    },
  }));
}
