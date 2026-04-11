# Brainstorming Log — Deployment Stack

**Date:** 2026-04-10
**Topic:** Deployment platform and database selection for production launch

---

## Context

The app is ready to deploy. Goals: portfolio demo (public URL) + personal daily use + family sharing. No deployment config existed prior to this session.

---

## Decisions Made

### Q: Primary goal of deployment?
**Answer:** Both portfolio demo and personal daily use.

### Q: Data mode?
**Answer:** Full stack (local + cloud), primarily for personal daily use across devices. Portfolio is secondary.

### Q: Is local-only enough for the portfolio demo?
**Answer:** No — full stack is wanted primarily for personal daily use across devices, not for the portfolio specifically.

### Q: Cloudflare Pages for frontend?
**Decision:** Yes — Cloudflare Pages for the frontend.
**Rationale:** Unlimited bandwidth on free tier, world-class CDN, better than Vercel free tier for a static SPA. Requires a `_redirects` file in `apps/web/public/` for SPA routing.

### Q: Replace MongoDB with PostgreSQL?
**Answer:** Yes, willing to rewrite the data layer for long-term benefits.
**Rationale:** Relational model fits the app well (items ↔ tags ↔ vendors ↔ recipes are all many-to-many). PostgreSQL is more widely supported.

### Q: Full Cloudflare (Workers + D1) vs Railway + Neon?
**Decision:** Railway + Neon (PostgreSQL).
**Rationale:** Family sharing makes real-time meaningful (one person checks off an item while another is shopping). Cloudflare Workers require Durable Objects (paid) for WebSocket subscriptions. Railway + Neon keeps WebSocket subscriptions working natively at ~$5/month — a reasonable cost for a family daily-use app. Node.js stack remains portable (not locked into Cloudflare runtime).

---

## Final Stack

| Layer | Platform | Notes |
|---|---|---|
| Frontend | Cloudflare Pages | Add `_redirects` for SPA routing |
| Backend | Railway | Node.js + Express + Apollo Server |
| Database | Neon (PostgreSQL) | Replace MongoDB Atlas; free tier, always-on |
| Auth | Clerk | Unchanged |
| Real-time | GraphQL subscriptions over WebSockets | Keep existing `graphql-ws` |
| ORM | Prisma | Replace Mongoose + Typegoose |

---

## Implementation Scope

- Replace Mongoose/Typegoose with Prisma
- Redesign schema from MongoDB documents → PostgreSQL relational tables
- Rewrite all resolvers (same logic, different ORM)
- Deploy backend to Railway
- Deploy frontend to Cloudflare Pages
- Wire up environment variables across all services
- Keep Clerk and Apollo Server/Client unchanged
