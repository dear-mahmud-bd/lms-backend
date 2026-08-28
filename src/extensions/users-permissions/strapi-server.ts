import crypto from 'crypto';

/**
 * users-permissions extension — server side.
 *
 * Phase 2.1: `appRole` is the canonical, server-authoritative role (see docs/decisions.md).
 * A user must NEVER choose their own role at signup, so we harden the public `register`
 * endpoint: any client-sent `appRole` is stripped before the user is created, so every
 * self-registered user falls back to the schema default `student`.
 *
 * Phase 3.1: register also issues a short-lived OTP and leaves the account UNVERIFIED —
 * it persists `otpCode` + `otpExpiresAt`, forces `confirmed: false`, and returns NO JWT
 * (the JWT is only issued later by the custom `verify-otp` endpoint in task 3.2). This is our
 * own OTP flow, deliberately independent of Strapi's built-in email-confirmation token flow.
 *
 * Phase 3.2: a public `POST /api/auth/verify-otp` validates the emailed code, flips
 * `confirmed: true`, clears the OTP (single-use), and returns a usable JWT + user.
 *
 * Phase 3.3: the OTP is emailed on register (env-driven SMTP; dev-only console fallback when SMTP
 * isn't configured), and login (`auth.callback`) is gated — unverified users are rejected with 400.
 *
 * NOTE: in Strapi v5 `plugin.controllers.auth` is a *factory* `({ strapi }) => ({ register, ... })`,
 * not a plain object — so we must wrap the factory and override `register` on the controller it
 * returns, not mutate `plugin.controllers.auth.register` directly (that just decorates the factory
 * function and the router never sees it).
 */

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** 6-digit numeric OTP, zero-padded (e.g. "004217"). */
function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Deliver the OTP by email. Never lets a delivery failure break registration: on error it logs and
 * moves on (a resend flow is a flagged gap). In non-production it also logs the code so the flow is
 * testable locally without a configured SMTP relay.
 */
async function sendOtpEmail(email: string, otpCode: string): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    strapi.log.info(`[otp] ${email} -> ${otpCode} (dev fallback; not shown in production)`);
  }
  try {
    await strapi.plugin('email').service('email').send({
      to: email,
      subject: 'Your verification code',
      text: `Your verification code is ${otpCode}. It expires in 10 minutes.`,
    });
  } catch (err: any) {
    strapi.log.warn(`[otp] email send failed for ${email}: ${err?.message ?? err}`);
  }
}

export default (plugin: any) => {
  const originalAuthFactory = plugin.controllers.auth;

  plugin.controllers.auth = (opts: any) => {
    const controller =
      typeof originalAuthFactory === 'function' ? originalAuthFactory(opts) : originalAuthFactory;

    const originalRegister = controller.register;
    controller.register = async (ctx: any) => {
      const body = ctx.request.body;
      if (body && typeof body === 'object') {
        // Strip any client-supplied role so it can never be self-assigned at signup.
        // Missing/invalid/escalation attempts all resolve to the schema default `student`.
        delete body.appRole;
      }

      // Let the plugin do the real work: validation, duplicate-email rejection, password
      // hashing, role assignment. On any failure it throws before we reach the OTP step.
      await originalRegister(ctx);

      // The plugin set `ctx.body = { jwt, user }`. Attach an OTP, force the account unverified,
      // and remove the JWT from the response.
      const createdUser = ctx.body?.user;
      if (!createdUser?.id) return; // defensive: nothing created, leave the response as-is

      const otpCode = generateOtp();
      const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

      await strapi.db.query('plugin::users-permissions.user').update({
        where: { id: createdUser.id },
        data: { confirmed: false, otpCode, otpExpiresAt },
      });

      // Task 3.3: deliver the code by email (failure is logged, never blocks registration).
      await sendOtpEmail(createdUser.email, otpCode);

      // Return ONLY safe fields — never the JWT (unverified) and never the OTP itself.
      ctx.body = {
        user: {
          id: createdUser.id,
          username: createdUser.username,
          email: createdUser.email,
          appRole: createdUser.appRole,
          confirmed: false,
        },
      };
    };

    // --- Task 3.2: verify-otp ------------------------------------------------------------
    controller.verifyOtp = async (ctx: any) => {
      const { email, otpCode } = ctx.request.body || {};
      if (!email || !otpCode) {
        return ctx.badRequest('email and otpCode are required');
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const user = await strapi.db
        .query('plugin::users-permissions.user')
        .findOne({ where: { email: normalizedEmail } });

      // Generic "invalid" for a missing user so we don't reveal which emails exist.
      if (!user) return ctx.badRequest('Invalid code');

      if (user.confirmed) return ctx.badRequest('Account already verified');

      if (!user.otpCode || String(user.otpCode) !== String(otpCode)) {
        return ctx.badRequest('Invalid code');
      }

      if (!user.otpExpiresAt || new Date(user.otpExpiresAt).getTime() < Date.now()) {
        return ctx.badRequest('Code expired');
      }

      // Success: verify the account and clear the OTP so the same code can't be reused.
      await strapi.db.query('plugin::users-permissions.user').update({
        where: { id: user.id },
        data: { confirmed: true, otpCode: null, otpExpiresAt: null },
      });

      // `issue` is async in this Strapi version (session/refresh mode returns a Promise); await
      // handles both that and the plain-sync signing path.
      const jwt = await strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });

      ctx.body = {
        jwt,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          appRole: user.appRole,
          confirmed: true,
        },
      };
    };

    // --- Task 3.3: login gate for unverified users ---------------------------------------
    // `auth.callback` is the handler behind POST /api/auth/local (login). Pre-check the account's
    // verified state so an unverified user never gets a JWT/refresh session; verified users (and
    // wrong-password attempts) fall through to the plugin's original credential handling.
    const originalCallback = controller.callback;
    controller.callback = async (ctx: any) => {
      const identifier = ctx.request.body?.identifier;
      if (identifier) {
        const trimmed = String(identifier).trim();
        const user = await strapi.db.query('plugin::users-permissions.user').findOne({
          // email is stored lowercased; username is stored as-typed.
          where: { $or: [{ email: trimmed.toLowerCase() }, { username: trimmed }] },
        });
        if (user && !user.confirmed) {
          return ctx.badRequest('Please verify your email before logging in.');
        }
      }
      return originalCallback(ctx);
    };

    return controller;
  };

  // Register the public route for the custom action. `auth: false` makes it reachable without a
  // JWT (identity is proven by possessing the emailed code); rate-limit mirrors register/login.
  plugin.routes['content-api'].routes.push({
    method: 'POST',
    path: '/auth/verify-otp',
    handler: 'auth.verifyOtp',
    config: {
      auth: false,
      middlewares: ['plugin::users-permissions.rateLimit'],
      prefix: '',
    },
  });

  return plugin;
};
