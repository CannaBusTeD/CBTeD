# CBTeD: connect your socials using one username

## Requested user experience

1. Sign into CBTeD once. The user enters a common handle such as `CannaBusTeD`.
2. Display **suggested**, clearly unverified links for YouTube, Facebook, Instagram and TikTok. Accept individual changes, because a username may differ or not exist. Never treat similar names as identity proof.
3. Each user selects **Connect YouTube / Connect Facebook / Connect Instagram / Connect TikTok**. The CBTeD backend creates a single-use anti-forgery state and returns that provider's **real** OAuth authorisation URL only when the provider integration and app permissions are configured.
4. The user authenticates directly with that platform, selects the correct channel/Page/eligible Instagram account where applicable, reviews the requested scopes and approves or declines. CBTeD must never accept the provider password.
5. The provider calls back to CBTeD's registered HTTPS redirect URI. Verify and consume the state, exchange the code server-side, identify the actual authorised account, and store its authorisation securely. A typed handle mismatch is a warning requiring confirmation, not evidence to connect a different account.
6. Show each account as Linked, Needs permission, Not available, Expired or Disconnected using real provider results. The user can reconnect and disconnect, and can use multiple accounts per platform if supported.
7. A connected account does not mean auto-publishing is enabled. The finished posting workflow must separately ask for the actual post/targets/schedule and obtain the explicit creator approval before public release. Record actual job IDs and provider status. Never invent successful posting.

## Actual constraints and platform setup

- **Google / YouTube**: CBTeD owner registers one Google OAuth application, its backend redirect URI, scopes for YouTube uploads, and obtains approval or verification if Google requires it. Every creator separately authorises the Google account and selects/validates the correct YouTube channel. A channel handle is not a Google account credential.
- **Facebook Pages**: CBTeD owner configures a Meta app with supported Facebook Login for Business and obtains the required Page access permissions and review. Each creator authorises their account, then selects the Page they manage. The text username is not a Page access token. Personal-profile auto-posting is not assumed supported.
- **Instagram**: CBTeD owner selects the appropriate Meta Instagram API/login flow and permissions for content publishing; eligible professional accounts may be required. Instagram account must be verified from the provider response, never guessed from its URL.
- **TikTok**: CBTeD owner configures Login Kit and Content Posting API, the exact redirect URI and `video.publish` scope. Direct-post access requires approval and TikTok audit where applicable; unaudited integrations may be limited to private videos.

CBTeD platform administrator performs developer-app registration and keeps client IDs/secrets, encryption keys, refresh tokens and API integration settings on the trusted backend. **Ordinary creators never need their own developer keys.** Third-party platforms can deny access, require additional verification or require the user to select eligible accounts.

## Primary entry: CBTeD inside ChatGPT

The conversational CBTeD plugin is the **primary user experience**, not a separate website users must learn. A creator can simply say "Connect my socials; my username is CannaBusTeD". The plugin's MCP tools should return suggested profile links, explain verified connection status, start the provider-specific official consent URL and poll for actual completion. The optional accessible web page is a fallback/redirect companion for login approval and users who prefer a browser.

Needed MCP tools once the secure backend is installed: `cbted_social_suggest_accounts`, `cbted_social_begin_authorisation`, `cbted_social_connection_status` and `cbted_social_disconnect`. These tools must share exactly the same Supabase owner isolation and provider verification as the web view. No ChatGPT tool can approve a platform's OAuth permissions on behalf of the user.

## Implementation status

The current implementation provides the **CBTeD plugin and accessible optional web page** with:
- Single-username suggestions and pasted profile URLs for YouTube, Facebook, Instagram, TikTok and X.
- Per-provider official OAuth request URLs, ten-minute one-use state verification, Google/X PKCE, and a fixed HTTPS callback.
- Supabase owner-scoped social connection records and separately AES-GCM-encrypted provider tokens.
- Platform-returned account/channel/Page discovery, explicit final account selection, local disconnect and status inspection.
- Post approval drafts for real saved video assets, per-destination approval/rejection, and an explicit fail-closed publishing endpoint.

**Not yet complete:** platform administrator app credentials, external platform permissions or audit, provider token refresh, account-provider revocation where offered, production upload workers, scheduling, final publishing verification, and a real live end-to-end account-login test. No publishing request is sent until all of those are implemented and tested.

The account screen must show honest status and never claim that suggested profile links are authorisations.

## One-time CBTeD platform setup (not a task for ordinary creators)

The CBTeD administrator registers platform applications once. Each individual user only provides their profile address, selects Connect, signs in on the provider's site, confirms the returned account in CBTeD, then approves future posts.

All platforms use the registered callback:
`https://dmzzyfiwtosxtyekpbfi.supabase.co/functions/v1/cbted-social-connect/callback`

Configured environment variables in **private Supabase Edge Function secrets** (never in client code, chat or public GitHub):

| Platform | Secret variables |
| --- | --- |
| Google / YouTube | `CBTED_GOOGLE_CLIENT_ID`, `CBTED_GOOGLE_CLIENT_SECRET` |
| Meta / Facebook Pages + Instagram Professional | `CBTED_META_CLIENT_ID`, `CBTED_META_CLIENT_SECRET` |
| TikTok | `CBTED_TIKTOK_CLIENT_KEY`, `CBTED_TIKTOK_CLIENT_SECRET` |
| X | `CBTED_X_CLIENT_ID`, `CBTED_X_CLIENT_SECRET` |
| Shared encryption | `CBTED_SOCIAL_ENCRYPTION_KEY` (fresh, private 32-byte base64-encoded key) |

The function additionally uses existing Supabase-managed `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a publishable or anon key for user validation.

The provider developer dashboards must approve the required publishing scopes: YouTube upload; Meta Page management or Instagram content publish; TikTok `video.publish`; X `tweet.write` plus media-upload eligibility. Users may need an eligible professional Page or account. CBTeD must never pretend a publishing scope exists if the provider didn't actually grant it.

After the provider callback, CBTeD shows **only platform-returned identities** for explicit confirmation. No artist can connect an arbitrary other person's profile by pasting its link. When authorisation is missing, the Connect button remains unavailable.

## Posting approval and release boundary

The production controller may draft a per-target request only for a **verified private project video asset** and an account confirmed with posting permission. Creator approval is recorded per request. No scheduled or public post is assumed live on approval alone.

Until the provider-specific upload service is fully implemented, the `publish` action deliberately returns HTTP 501 without posting. Never mark a request as submitted, completed or verified based on a prompt, guessed URL or prior consent.

## Testing and rollout

Use `node --test tests/check-social-connect.mjs tests/check-social-oauth.mjs` plus the repository's full orchestration/MCP tests. The tests cover route discovery, unconfigured clients, anonymous calls, bad domains, one-use state patterns, owner isolation and fail-closed posting. The tests **do not constitute real provider OAuth approval**.

Before public launch: run an authenticated test against each platform's sandbox/test account, confirm returned account selection, verify encrypted credential storage, test token renewal and disconnect, then test a private/draft upload and the provider's actual returned post status. Review Meta/TikTok app approval requirements first.

Accessibility: all important fields and actions have text labels, focusable controls and readable status messages. Don't require QR scanning or visual-only consent.

