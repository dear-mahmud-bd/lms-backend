import { errors } from '@strapi/utils';

const { NotFoundError } = errors;

/**
 * Reusable ownership guard (task 2.3).
 *
 * Registered globally as `global::is-owner`. Enforces the matrix's "Own only" / "Own courses"
 * rules server-side by comparing the authenticated user's id against the resource's owner
 * relation — never a client-sent id. Admin / content-manager bypass (manage anything).
 *
 * Config:
 *   contentType : UID to load, e.g. 'api::course.course'            (required)
 *   ownerPath   : dotted path from the resource to the owner `user` (default 'instructor').
 *                 Direct:  'instructor' | 'author' | 'student'
 *                 Nested:  'course.instructor'  (lessons, quizzes)
 *   idParam     : route param holding the resource id (default 'id')
 *   bypassRoles : appRoles that skip the ownership check (default ['admin','content-manager']).
 *                 Blog uses ['admin'] because a content-manager may only manage their OWN posts.
 *
 * Example:
 *   { name: 'global::is-owner',
 *     config: { contentType: 'api::course.course', ownerPath: 'instructor' } }
 *
 * NOTE: role bypass uses `ctx.state.user.appRole` (canonical role from task 2.1), not the coarse
 * plugin `role.type`.
 */

const DEFAULT_BYPASS_ROLES = ['admin', 'content-manager'];

/** Build a Strapi populate object from a dotted owner path: ['course','instructor'] -> { course: { populate: { instructor: true } } } */
function buildPopulate(segments: string[]): any {
  const [head, ...rest] = segments;
  if (rest.length === 0) return { [head]: true };
  return { [head]: { populate: buildPopulate(rest) } };
}

export default async (policyContext: any, config: any, { strapi }: { strapi: any }) => {
  const {
    contentType,
    ownerPath = 'instructor',
    idParam = 'id',
    bypassRoles = DEFAULT_BYPASS_ROLES,
  } = config || {};

  if (!contentType) {
    strapi.log.error('[is-owner] misconfigured: `config.contentType` is required');
    return false;
  }

  const user = policyContext.state.user;
  if (!user) return false; // no auth -> 403

  // Roles that manage anything — no ownership load needed. (Blog narrows this to admin only.)
  if (bypassRoles.includes(user.appRole)) return true;

  const documentId = policyContext.params[idParam];
  if (!documentId) return false;

  const segments: string[] = String(ownerPath).split('.');

  // Load status-agnostically: ownership does not depend on draft/publish state, and the
  // document service's default publication state would otherwise mask a real resource.
  const entity: any = await strapi.db.query(contentType).findOne({
    where: { documentId },
    populate: buildPopulate(segments),
  });

  // Nothing to own — return a truthful 404 rather than masking it as a 403.
  if (!entity) {
    throw new NotFoundError();
  }

  // Walk the owner path (e.g. entity.course.instructor) to reach the owner user.
  let owner: any = entity;
  for (const seg of segments) {
    owner = owner?.[seg];
  }

  // Owner missing (e.g. course with no instructor) or mismatch -> deny (403). Never fall
  // through to an accidental allow.
  return Boolean(owner?.id) && owner.id === user.id;
};
