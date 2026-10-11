# Remote profiles

Agents lists and creates profiles on the selected Hermes dashboard while Desktop keeps profile selection and late UI work scoped to that connection.

## Remote profiles

Remote profile operations use the dashboard's authenticated profile routes with immutable request snapshots; unsupported desktop edits never fall through to local profile files.

[[src/main/remote-profiles.ts#remoteListProfiles]] maps `/api/profiles` without reading same-named local appearance metadata. Creation validates the requested and clone names and requires the server's matching `{ok:true,name}` acknowledgement. Explicit or auto-resolved anonymous token dashboards use strict JSON requests; OAuth remains on its cookie-session transport. Authentication account changes fence admission and replies through [[remote-providers#Stale authentication revisions are rejected]].

### Desktop selection

Remote selection is a desktop preference owned by connection id and dashboard URL. It neither invokes the local Hermes CLI nor changes the server's sticky default profile.

[[src/main/remote-profile-selection.ts#getRemoteSelectedProfile]] restores a valid selection from `desktop.json`; missing selections fall back to the listed default. [[src/main/remote-profile-selection.ts#setRemoteSelectedProfile]] preserves other preferences. Local and SSH selection retain their existing persisted active-profile behavior and gateway startup.

### Authority and lifetimes

Agents, the sidebar picker and Layout restore share the main-issued target authority from [[profile-editors#Profile editors#Captured request target]]. Configuration changes cancel old callbacks, forms and polling.

Profile IPC validates captured targets before list, create, select, delete, appearance and sync operations. Remote creation and selection require explicit authority. Async SSH status cannot admit a follow-up start after target invalidation. Admitted requests retain their own connection snapshot; renderer read, create, selection and polling generations suppress late results and parent navigation.

Layout restores each connection's selected profile onto a scratch chat run using the existing [[sidebar-navigation#Profile switch and active chat]] transition. A delayed restore cannot undo a newer user choice. Remote Agents exposes list/create/select/chat; profile editing and desktop/cloud sync controls remain unavailable there. Global editor modal invalidation is documented in [[profile-editors#Profile editors#Renderer lifetime]].

### Local cloud sync boundary

Automatic and manual cloud agent sync reconcile desktop files only in Local mode. Remote and SSH Agents do not mount sync controls; main rejects unsupported sync admission.

The profile modal's Sync pane is also Local only; unsupported Remote deletion and appearance reject instead of touching local files. Current Local deletion exclusions and SSH deletion remain intact, as described in [[agent-sync#Local deletion exclusions]].

## Tests

Actual components, the real Layout parent, production IPC callbacks and API helpers verify request ownership and the supported capability boundary.

### Server profiles stay separate from local metadata

A server list maps display identity and selection without consulting a same-named desktop profile's avatar or color.

### Creation acknowledgement and input validation

Creation accepts only the matching server acknowledgement and rejects unsafe destination or clone names before dispatch.

### Captured authentication admission

A queued authentication probe cannot admit a profile write after cookie-account changes; requests retain their captured server identity.

### Anonymous dashboard boundary

Explicit anonymous dashboards use the dashboard route, reject successful HTML, and never replace an OAuth request with bare fetch.

### Anonymous URL normalization

Anonymous GET and POST use the shared dashboard URL builder, removing API base suffixes, query strings and hashes consistently with authenticated requests.

### Anonymous reverse proxy authentication

Basic proxy credentials are decoded into an Authorization header and removed from the bare fetch URL, preserving encoded passwords without invalid URL userinfo.

### Desktop preference ownership

Remote selection restores only for its recorded connection and URL while preserving unrelated desktop preferences and rejecting invalid names.

### Remote selection never invokes local profile use

The actual Remote selection IPC writes only the desktop preference, never local CLI selection or gateway lifecycle controls.

### Unsupported mutations cannot fall through

Actual Remote sync, deletion and appearance handlers reject without calling desktop or cloud mutation helpers.

### Queued and SSH follow-up requests keep authority

Stale queued creation is rejected; an SSH status read cannot start a gateway after its captured target becomes obsolete.

### Remote Agents capability and automatic sync

Before authority resolves, actions stay unavailable. Remote Agents then permits list/create while omitting local editors and automatic/manual cloud sync.

### Late lists and create results

Switching targets clears creation drafts and prevents obsolete lists or creation results from hydrating or refreshing the new target.

### Late selection and chat callbacks

A delayed selection or Chat action cannot call its parent or start follow-up reads and polls after the target changes.

### Action failures remain retryable

Creation and selection rejections are caught and shown; the current creation draft remains intact and retryable.

### Local cloud sync remains available

A signed-in Local visit still runs one automatic sync pass with captured authority and exposes the existing manual controls.

### Gateway polls stop at target changes

An admitted old SSH poll cannot hydrate the new target or schedule another readiness read after invalidation.

### Sidebar picker callback isolation

The actual sidebar picker rejects failed and obsolete selections without optimistically changing its parent profile.

### Real Layout selection and chat acceptance

Actual Agents and sidebar flow reach the real Layout parent; selected profile, active chat target and captured IPC authority remain aligned.

### Real Layout stale callback isolation

An old Agents selection resolving after a connection switch cannot retarget the real Layout profile or active chat.

### Restoration cannot undo a newer choice

A delayed initial restore cannot reset the active profile and scratch chat after the user selects another profile.

### Failed reload keeps the shell target aligned

Same-ID configuration invalidation selects a default scratch chat together with the footer fallback. A failed profile restore cannot leave the old named chat visible under the default label.
