/**
 * blog-post controller (task 8.1)
 *
 * Blog CRUD. Write access is Admin/CM only (route `has-app-role`); Instructor/Student -> 403.
 *  - create: `author` set from the JWT (client value ignored); `status` forced to `draft`
 *    (publishing is the explicit 8.2 action). `author` is a user relation -> document service.
 *  - update/delete: guarded by `has-app-role` + `is-owner`(author, bypassRoles:['admin']) — Admin
 *    manages any post, a Content-Manager only their OWN. Update can't reassign `author`.
 *
 * Task 8.2 — publish + visibility:
 *  - publish: PUT /api/blog-posts/:id/publish flips status to `published` (Admin any, CM own).
 *  - find/findOne: published-only for public/students/instructors; a Content-Manager also sees
 *    their own drafts; Admin sees everything. `status` (enum) is the gate, not Strapi publishedAt.
 */

import { factories } from '@strapi/strapi';

/**
 * Visibility filter (AND-ed with client filters). Returns null for admin (sees everything).
 * NOTE: we can't filter by the `author` user-relation in a content-API query ("Invalid key
 * author"), so for a content-manager we precompute their own post ids and filter by `id $in`.
 */
async function visibilityFilter(strapi: any, user: any): Promise<any | null> {
  const role = user?.appRole;
  if (role === 'admin') return null;
  if (role === 'content-manager') {
    const own = await strapi.db
      .query('api::blog-post.blog-post')
      .findMany({ where: { author: user.id }, select: ['id'] });
    const ownIds = own.map((p: any) => p.id);
    return { $or: [{ status: 'published' }, { id: { $in: ownIds } }] };
  }
  return { status: 'published' }; // student / instructor / public
}

export default factories.createCoreController('api::blog-post.blog-post', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user; // admin or content-manager (route policy)
    const data = { ...(ctx.request.body?.data || {}) };

    // Server-controlled fields; ignore whatever the client sent for these.
    delete data.author;
    delete data.status;

    const entity = await strapi.documents('api::blog-post.blog-post').create({
      data: { ...data, author: user.id, status: 'draft' },
    });

    // Hand-built response (the output sanitizer strips the users-permissions `author` relation).
    ctx.status = 201;
    ctx.body = {
      data: {
        id: entity.id,
        documentId: entity.documentId,
        title: entity.title,
        body: entity.body,
        coverImageUrl: entity.coverImageUrl,
        slug: entity.slug,
        status: entity.status,
        author: { id: user.id },
      },
    };
  },

  async update(ctx) {
    const data = ctx.request.body?.data;
    if (data && 'author' in data) delete data.author; // no author reassignment via edit
    return super.update(ctx);
  },

  async find(ctx) {
    const user = ctx.state.user;

    // Opt-in management scope (task 16.2): `?mine=true` returns only the caller's
    // OWN posts (all statuses). The management list needs this because the client
    // can't tell which published posts a content-manager owns — the `author`
    // relation is stripped by the output sanitizer. Public reads never pass `mine`,
    // so their published-only visibility is unchanged. `mine` isn't a valid
    // content-API query key, so we consume and strip it before delegating.
    const mine = ctx.query?.mine === 'true' || ctx.query?.mine === true;
    if (ctx.query && 'mine' in ctx.query) delete (ctx.query as any).mine;

    if (mine && (user?.appRole === 'admin' || user?.appRole === 'content-manager')) {
      const own = await strapi.db
        .query('api::blog-post.blog-post')
        .findMany({ where: { author: user.id }, select: ['id'] });
      const ownIds = own.map((p: any) => p.id);
      ctx.query = {
        ...ctx.query,
        // Empty set → match nothing (never fall through to "all") .
        filters: { ...((ctx.query?.filters as object) || {}), id: { $in: ownIds.length ? ownIds : [-1] } },
      };
      return super.find(ctx);
    }

    const vis = await visibilityFilter(strapi, user);
    if (vis) {
      // AND the visibility rule with any client-supplied filters.
      ctx.query = {
        ...ctx.query,
        filters: { ...((ctx.query?.filters as object) || {}), ...vis },
      };
    }
    return super.find(ctx);
  },

  async findOne(ctx) {
    const user = ctx.state.user;
    const post = await strapi.db.query('api::blog-post.blog-post').findOne({
      where: { documentId: ctx.params.id },
      populate: { author: true },
    });
    if (!post) return ctx.notFound();

    const role = user?.appRole;
    const published = post.status === 'published';
    const isOwningCM = role === 'content-manager' && post.author?.id === user?.id;
    // Drafts are invisible to everyone except admin and the owning content-manager.
    if (role !== 'admin' && !published && !isOwningCM) {
      return ctx.notFound();
    }
    return super.findOne(ctx);
  },

  async publish(ctx) {
    // Route policies (has-app-role + is-owner author, bypass admin) already authorized this.
    const updated = await strapi.documents('api::blog-post.blog-post').update({
      documentId: ctx.params.id,
      data: { status: 'published' },
    });
    if (!updated) return ctx.notFound();

    ctx.body = {
      data: { id: updated.id, documentId: updated.documentId, status: updated.status },
    };
  },
}));
