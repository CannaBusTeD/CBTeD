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

## Implementation separation

Current branch milestone: accessible one-handle suggested-profile screen, per-site overrides, honest sign-in state, guarded OAuth-start controls and tests. No provider callback, token exchange or real posting capability is included in this milestone; the Connect buttons remain disabled if the backend does not advertise provider readiness.

The server API contract for the next stage:

- `GET /functions/v1/cbted-social-connect/status`: authenticated; returns `{available, connections:[{provider,account_id,account_handle,display_name,status,post_permission}]}` with **no credentials**.
- `POST /functions/v1/cbted-social-connect/start`: authenticated, provider allowlist and suggested handle; checks configuration and returns `{authorize_url}`. This action does not grant permission.
- Fixed provider redirect URI, server-side state verification and authorisation-code exchange. The callback must redirect to CBTeD without credentials or raw codes in the returned page.
- Explicit Disconnect/Reconnect commands and provider token revocation where supported.
- Storage separated between public connection metadata and encrypted credentials. Tokens must never be accessible through browser RLS reads, GitHub files, or any public MCP tool.
- Audit trail and publishing opt-in, per-post approval, rate limits, retries, cancellation and failure handling are required before enabling publication.

## Quality gates before deployment

Account linking is blocked until an external API service with state, callback, token storage, refresh, disconnect, platform identity verification and owner isolation has passed tests. OAuth callback must reject expired/replayed/mismatched state, unknown provider, credentials for the wrong user, and channels/Pages not authorised by the provider. No automatic or public posts until separate publishing controls pass integration tests.

Accessibility: clear text labels, normal keyboard/screen-reader controls, focus management, live status text and readable provider consent flows. No QR-only setup, no guessing from a picture, no unnecessary account password re-entry.
