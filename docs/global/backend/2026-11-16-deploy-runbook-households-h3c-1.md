# Deploy runbook — households H3c-1 (live cart updates, one new build variable, no migration)

**Date written:** 2026-11-16
**Migration:** none
**Branch:** `feature/households-h3c`
**Plan:** [`../permissions/2026-11-16-households-plan-h3c-1.md`](../permissions/2026-11-16-households-plan-h3c-1.md) (task C.7)
**Design:** [`../permissions/2026-11-16-households-h3c-design.md`](../permissions/2026-11-16-households-h3c-design.md), section *4. Deploy*
**Runs together with:** [`2026-11-11-deploy-runbook-households-h3a.md`](2026-11-11-deploy-runbook-households-h3a.md) and [`2026-11-15-deploy-runbook-households-h3b.md`](2026-11-15-deploy-runbook-households-h3b.md)

## Why this is a third file

H3a and H3b are merged into `develop` and **not deployed**. H3c-1 goes into `develop` too.
Merging into `develop` deploys nothing. All three go out together at one checkpoint
release, when `develop` is merged into `main`.

This file is an **addendum**, like the H3b file is to the H3a file. It is not a section in
the H3b file, for three reasons:

- **H3c-1 has a different kind of risk.** H3a and H3b change the database and need a
  rehearsal on a branch of production. H3c-1 has **no migration** and needs no rehearsal.
  Its one risk is a build setting in Cloudflare and a protocol Railway has never carried for
  this app. Putting it inside the H3b file would mix those steps into the rehearsal record.
- **The H3b file keeps its own record.** Its `TBD on deploy day` cells belong to H3b.
- **If H3c-1 is not merged by the checkpoint**, the H3a and H3b files still work alone. This
  file is then used at the next release instead.

**Follow the H3a runbook from top to bottom, with the H3b additions. At each step named
below, also do the H3c-1 step.**

**Rule for every step: never paste the Railway hostname, a database connection string, a
database hostname or a secret into a chat, a commit, a document or a screenshot.** In this
file the Railway API host is written `<API host>`. It is the same host that
`VITE_GRAPHQL_HTTP_URL` already holds.

**Who does what:** "Owner" is ETBlue. "Main session" is the Claude session in the worktree.
Nothing in this file touches a database.

---

## What the user gets

Once this is merged **and deployed**:

- A cart page open in one tab or device shows a change made in another tab or device within
  about a second, with no reload.
- After the connection drops, or the device was offline, the cart page catches up by itself.
- The H3b message "購物車已有變動，請確認後再試一次。" becomes rare.

Until H5 (invites) nobody else can join a household, so the owner sees this only between their
own tabs and devices.

If the socket cannot open (a wrong build variable, or Railway refuses the upgrade), **the app
works exactly as before**, with no live updates. Nothing else breaks.

## What the developer gets

- One build variable to set and check, and one way to check the endpoint without a token
  (section 2.2).
- A clear meaning for each close code in the browser (section 6).
- Cost: one more setting that must stay right in Cloudflare. Until now no code opened the
  socket, so a wrong value there never showed.

---

## 0. The order, on one page (H3c-1 steps only)

| # | Step | Who | Where in the H3a / H3b order |
|---|---|---|---|
| 1 | Set `VITE_GRAPHQL_WS_URL` in the Cloudflare Pages build, and check its value | owner | before the deploy day (H3a 2) |
| 2 | Check Railway's server today, to know the "before" answer | owner or main session | before the deploy day |
| 3 | Merge `develop` into `main`. Cloudflare rebuilds the web WITH the variable | owner | H3a 4.3 |
| 4 | Deploy the server | owner | H3a 4.4 |
| 5 | Check the socket opens (the 4401 check, then the WS tab) | owner | after H3a 4.4, before H3a 5 |
| 6 | Two tabs, one cart: the live update check | owner | with H3a 6 and H3b 6 |

**The order of web and server does not matter for H3c-1** (section 1.2). The order H3a sets
(web first, then the server) still applies, because of `Location.isDefault`.

---

## 1. What changes, and what breaks if it goes wrong

### 1.1 What is new

| Part | What is new |
|---|---|
| Server | A WebSocket endpoint on the **same port and path** as HTTP: `/graphql`, protocol `graphql-transport-ws`. One subscription, `householdChanged`. An in-memory event bus |
| Web | One subscription per tab, in cloud mode when signed in. Every HTTP request sends a new header, `x-client-id` (a random id per page load) |
| Database | Nothing |
| Server env | Nothing new. The socket checks the Clerk token with `CLERK_SECRET_KEY`, which is already set. `CLERK_JWT_KEY` is optional (section 2.3) |
| Web build env | `VITE_GRAPHQL_WS_URL`. It was in `apps/web/.env.example` before, but no code used it in production |

### 1.2 Old and new versions together

| Web | Server | What happens |
|---|---|---|
| old | new | The old web never opens a socket and sends no `x-client-id`. Every server event goes to every other tab, which is correct. Nothing changes for the old web |
| new | old | The socket gets no WebSocket answer from the old server. `graphql-ws` tries again up to 5 times with a wait, then stops. The app works as today, with no live updates |
| new | new | Live updates work |

The `x-client-id` header does not break the old server. Its CORS setup (`cors({ origin })` in
`apps/server/src/index.ts`) names no `allowedHeaders`, so the `cors` package allows the
headers the browser asks for. `main` has the same setup (checked 2026-11-16). The
`authorization` header already makes every request send a preflight, so the new header adds
no extra request.

**After the server deploys, reload every device once.** A tab that gave up on the old server
subscribes again only when the device comes back online or the tab becomes visible again. A
reload is the sure way. H3a 4.3 already asks for a reload on every device.

### 1.3 What a wrong value does

| `VITE_GRAPHQL_WS_URL` | Result |
|---|---|
| not set | the web uses `ws://localhost:4000/graphql` (`apps/web/src/apollo/constants.ts`). On an `https` page the browser blocks it. No live updates; the app works |
| `ws://…` (not `wss://`) | blocked as mixed content on an `https` page. No live updates; the app works |
| wrong host or path | the socket fails and `graphql-ws` stops after 5 tries. No live updates; the app works |
| set, but the web was not rebuilt | the old bundle still has the old value. `VITE_` values are written into the bundle at build time |

In every row the rest of the app keeps working. The only visible sign is that a change in
another tab does not show until the page reloads or the tab comes back after 30 s.

---

## 2. Before the deploy day

### 2.1 Set `VITE_GRAPHQL_WS_URL` in Cloudflare Pages

**Owner**, in the Cloudflare dashboard: the web project, *Settings*, *Variables and Secrets*
(build variables), the **Production** environment.

1. Find `VITE_GRAPHQL_HTTP_URL`. Its value is `https://<API host>/graphql`.
2. Add `VITE_GRAPHQL_WS_URL` with the value `wss://<API host>/graphql`:
   - the same `<API host>` as step 1, character for character;
   - `wss://`, not `ws://` and not `https://`;
   - ends with `/graphql`, with no `/` after it.
3. Check the name is exactly `VITE_GRAPHQL_WS_URL`. The web reads only that name
   (`apps/web/src/apollo/client.ts`). An older plan (`2026-04-10-deployment-stack-plan.md`)
   named the HTTP variable `VITE_GRAPHQL_URL`; the code has never read that name.
4. Optional: add the same value to the **Preview** environment, so preview builds get live
   updates too. Preview builds also talk to the production server.
5. **Do not start a new build yet.** The build that matters is the one the merge into `main`
   starts (H3a 4.3). A rebuild of the current `main` now would only prove the variable is
   read; the old code does not open a socket in a way you can check.

Result: `TBD on deploy day` (variable set; the host matches `VITE_GRAPHQL_HTTP_URL`; Preview
set or not).

### 2.2 Check the server today, to know the "before" answer

**Owner or main session**, from any computer with Node 22 (it has a built-in `WebSocket`).
Type the host by hand into the command. Do not paste the output anywhere if it shows the host.

```bash
node -e "
const ws = new WebSocket(process.argv[1], 'graphql-transport-ws')
ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init', payload: {} }))
ws.onerror = () => console.log('error: no WebSocket answer')
ws.onclose = (e) => console.log('closed', e.code, e.reason)
" 'wss://<API host>/graphql'
```

The `connection_init` has no token and no `clientId`, so it needs no secret.

| Answer | Meaning |
|---|---|
| `error: no WebSocket answer`, then `closed 1006` | the server has no WebSocket endpoint. **This is the expected answer before the deploy** |
| `closed 4401 Unauthorized` | the new server is running and Railway passed the upgrade. Expected only after the deploy |
| `closed 4408` | the socket opened but `connection_init` never arrived. Run it again |

`wscat` works too: `wscat -s graphql-transport-ws -c 'wss://<API host>/graphql'`, then type
`{"type":"connection_init","payload":{}}`. The answer table is the same.

The server's build runs the same check on its own: `apps/server/scripts/check-start.mjs`
opens a socket with no `clientId` and fails the build unless it is closed with `4401`. That
proves the bundle. It does **not** prove that Railway's proxy passes the upgrade. Only the
check in section 5 does.

Result: `TBD` (answer seen).

### 2.3 `CLERK_JWT_KEY` (optional)

The socket checks the Clerk token with `verifyToken`, using `CLERK_SECRET_KEY` (already set on
Railway). Without `CLERK_JWT_KEY`, `verifyToken` fetches Clerk's public keys over the network.
With it, the check needs no network call.

- Not setting it is fine. If Clerk cannot be reached, the socket closes with `1013` and the
  browser tries again (section 6).
- To set it: in the Clerk dashboard, *API keys*, copy the **JWT public key** (PEM), and set it
  on Railway as `CLERK_JWT_KEY`. It is a public key, but treat it like any other value: do not
  paste it into a doc or a chat.

Decision: `TBD` (set or not).

---

## 3. The deploy: additions to H3a 4.3 and 4.4

### 3.1 Addition to H3a 4.3 (merge, Cloudflare)

After Cloudflare finishes the build from the merge into `main`:

1. Open the build log in Cloudflare. It does not print `VITE_` values, so it cannot prove the
   variable. Section 5 does.
2. Do not check live updates yet. The server is still the old one, so the socket fails
   (1.2). That is expected.

### 3.2 Addition to H3a 4.4 (the server deploy)

Nothing extra in the release log: H3c-1 has no migration, so the release log shows only the
H3a and H3b lines.

The build log must end with the start check passing. If the check cannot see `4401`, the
build fails and the old server keeps running. Read the error line: it names the close code it
got instead.

---

## 4. How to tell it worked: the server

**Owner**, after H3a 4.4 and before H3a 5. Run the command of 2.2 again.

| Check | Expected | Result |
|---|---|---|
| 2.2 command | `closed 4401 …` | `TBD on deploy day` |

If it still shows `error: no WebSocket answer`, see section 7.

---

## 5. How to tell it worked: the browser

**Owner**, on a desktop browser, cloud mode, signed in, after a hard reload.

1. Open DevTools, *Network*, filter **WS** (Chrome) or **WebSocket** (Firefox). Reload.
2. One row named `graphql` should appear, with status **101**.
3. Click it, then *Messages*. The first messages should be:
   - sent `connection_init` (its payload holds the token; **do not screenshot it**);
   - received `connection_ack`;
   - sent `subscribe` with `HouseholdChanged`.
4. Change a cart in this tab. Nothing new arrives on this socket: the server does not send a
   tab its own changes.

| Check | Expected | Result |
|---|---|---|
| one `graphql` row, status 101 | yes | `TBD on deploy day` |
| `connection_ack` received | yes | `TBD on deploy day` |
| `subscribe` sent | yes | `TBD on deploy day` |

**This is the first time a real Clerk token is used on the socket.** No automated test does
it: the E2E client sends `e2eUserId` instead, and the unit tests use a fake `verifyToken`. So
step 2 and step 3 are the proof that the production sign-in works on the socket.

---

## 6. The manual smoke test (add to H3a 6 and H3b 6)

**Owner**, in cloud mode, after a hard reload on every device.

| # | Action | What must happen |
|---|---|---|
| H3c-1 | Open the same vendor's cart in two tabs (or on two devices) signed in as the same user. In tab B add an item | Tab A shows the item within about a second, with no reload and no click |
| H3c-2 | In tab B change an amount, then remove an item | Tab A shows each change within about a second |
| H3c-3 | Take device A offline for 10 s (a phone: airplane mode; a laptop: turn off Wi-Fi). Meanwhile, on device B, add an item. Bring device A back online | Within a few seconds device A shows the item, with no reload |
| H3c-4 | Check out the cart in tab B | Tab A's cart empties without a reload |
| H3c-5 | Leave a tab open for more than 60 minutes, then change its cart from another tab | The socket row closed with `1001` after 60 minutes, a new `graphql` row opened, and the change shows |

H3c-3 uses a real network cut on purpose. Whether DevTools' *Offline* switch also closes an
open WebSocket depends on the browser version, so it is not a sure test. H3c-5 is optional on
the day; it takes an hour. It is the only check of the 60-minute close with a real token.

Results: `TBD on deploy day`.

### What a close code in the WS tab means

Click the closed `graphql` row; the close code is in its last message or its status.

| Code | Meaning | What the browser does | What to do |
|---|---|---|---|
| `4401` | the server refused the socket: no signed-in user, a token Clerk rejects, or no `clientId` | gives up, no retry. Subscribes again when the device comes back online or the tab becomes visible | if it happens on a signed-in tab after a reload, the token check is failing. See 7.2 |
| `1013` | the token check failed for another reason, usually Clerk's keys could not be fetched | tries again after a wait, up to 5 times in a row | if it repeats, Clerk or Railway's outbound network is down. Setting `CLERK_JWT_KEY` (2.3) removes the network call |
| `1001` | the socket is 60 minutes old. The server closes every socket at that age | opens a new socket after about 1.3 to 4 s, with a fresh token, and refetches the screen once | nothing. This is normal |
| `1006` | the connection dropped with no close message (network, proxy, server restart) | tries again after a wait | nothing, unless it repeats every few seconds. Then see 7.1 |

---

## 7. If something is wrong

**The app works without live updates.** No step here is urgent. Nothing in H3c-1 changes data,
so there is nothing to roll back in the database.

### 7.1 No WebSocket answer after the deploy (2.2 still shows `error`)

1. Check the server deploy finished and its build log shows the start check passing.
2. Check the URL: `wss://`, the right host, `/graphql`.
3. Railway passes WebSocket upgrades on a public domain without extra setup, as far as is
   known. **This was never tested for this app.** If the upgrade is refused only on Railway,
   read Railway's docs for the service's networking settings before changing anything.

### 7.2 4401 on every signed-in tab

The token check refuses real tokens. Likely causes: `CLERK_SECRET_KEY` on Railway belongs to
another Clerk instance than the web's publishable key, or `CLERK_JWT_KEY` was set to the wrong
key. Remove `CLERK_JWT_KEY` first (it is optional), redeploy, and check again. HTTP requests
use `clerkMiddleware`, not `verifyToken`, so HTTP can work while the socket refuses.

### 7.3 The socket opens, but tab A does not update

1. In tab A's WS tab, does a `next` message arrive when tab B changes the cart?
   - **No:** the server did not send it. Check that both tabs are the same user, and that the
     change was a cart change. In H3c-1 only carts send events (stock, logs, locations and the
     catalog are H3c-2).
   - **Yes, but the screen does not change:** the web did not refetch. Report it as a bug with
     the browser console output.

### 7.4 Turn live updates off

Remove `VITE_GRAPHQL_WS_URL` in Cloudflare and rebuild the web. The web then tries
`ws://localhost:4000`, which the browser blocks, and the app works as before. No server change
is needed.

---

## 8. Left open on purpose

| Item | Why it is open |
|---|---|
| A real Clerk token on the socket | No automated test uses one. Section 5 is the first check |
| Railway's proxy and WebSocket upgrades | Never tested before this deploy. Section 4 is the first check |
| Idle sockets on Railway | The client sends no keep-alive ping. Whether Railway closes an idle socket before 60 minutes is not measured. If it does, the browser reconnects and refetches; it costs a request, not a missed change |
| A second Railway instance | The event bus lives in one process (`apps/server/src/lib/liveEvents.ts`). With two instances, a change on one would not reach sockets on the other. Do not scale out before the bus moves to a shared service |
| Stock, logs, locations and the catalog | H3c-2 |
| Two people on two devices | Needs H5 (invites). Until then, two tabs or devices of one person is the whole test |

---

## Where this file lives, and why

In `docs/global/backend/`, beside the H3a and H3b runbooks it extends. A person who opens a
runbook during a deploy looks for deploy documents, not for a feature folder.
