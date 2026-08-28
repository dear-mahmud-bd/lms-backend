/**
 * notification controller (task 10.1)
 *
 * GET /api/notifications/me        — the caller's own notifications, newest first. Any authenticated
 *                                    user; filtered strictly by the JWT user id (client filters
 *                                    ignored), so no one can read another user's rows.
 * PUT /api/notifications/:id/read  — mark the caller's OWN notification read. Ownership (recipient)
 *                                    is enforced by the `is-owner` route policy before this runs, so
 *                                    a mismatch is a 403 and a missing row a 404 — this action only
 *                                    sees notifications the caller owns. Idempotent.
 *
 * Core CRUD stays closed (not granted in bootstrap) — only these two custom actions are exposed.
 */

import { factories } from '@strapi/strapi';

/** Shape a notification row to the api-contracts response (never leaks the recipient relation). */
function toResponse(n: any) {
  return {
    id: n.id,
    message: n.message,
    type: n.type,
    isRead: n.isRead,
    link: n.link,
    createdAt: n.createdAt,
  };
}

export default factories.createCoreController('api::notification.notification', ({ strapi }) => ({
  async me(ctx) {
    const user = ctx.state.user;
    const rows = await strapi.db.query('api::notification.notification').findMany({
      where: { recipient: user.id },
      orderBy: { createdAt: 'desc' },
    });

    ctx.body = { data: rows.map(toResponse) };
  },

  async markRead(ctx) {
    // The is-owner policy already confirmed this row exists AND belongs to the caller, loading it
    // by documentId — so we update by the same documentId and don't re-check ownership here.
    const documentId = ctx.params.id;
    const updated = await strapi.documents('api::notification.notification').update({
      documentId,
      data: { isRead: true },
    });

    // The is-owner policy already guaranteed the row exists; this guard only satisfies the type.
    if (!updated) return ctx.notFound();

    ctx.body = { data: { id: updated.id, isRead: updated.isRead } };
  },
}));
