# Shared Pets

Hermes One reads and changes each profile's pet through the same gateway RPCs as the official desktop, so installation and selection are never duplicated in client-owned storage.

## Profile and connection authority

Every request carries an explicit profile and uses the selected machine's authenticated dashboard WebSocket. [[src/renderer/src/components/pet/petGateway.ts#openPetGateway]] obtains a fresh ticket for each socket; [[src/renderer/src/components/pet/petGateway.ts#petRequest]] scopes even the default profile. An unavailable remote dashboard never falls back to local files.

## Gallery and preferences

Settings → Pets lists installed pets immediately, merges the online gallery when reachable, and asks the backend for thumbnails.

Selecting, disabling, scaling, renaming, exporting and removing call the upstream `pet.*` RPCs; changes are visible to CLI/TUI/official desktop in the same profile. [[src/renderer/src/components/pet/PetSettings.tsx#PetSettings]] owns this UI, refreshes while open, and reconnects after a dropped gateway. Generated pets use their existing manifests rather than a new Hermes One format.

## Live mascot

[[src/renderer/src/components/pet/FloatingPet.tsx#FloatingPet]] polls pet metadata and refreshes the revisioned sprite when another Hermes surface changes selection.

The `pet.changed` event is an immediate hint; focus/poll reconnects a dropped socket, and an in-flight metadata read rechecks after a newer change. [[src/renderer/src/components/pet/PetSprite.tsx#PetSprite]] renders both legacy and current state rows using the gateway's geometry and real frame counts. The displayed run owns activity; other sessions cannot take over its pose. Only drag position is local to this device; profile selection and size remain in shared Hermes config.

The mascot is inside the Hermes One window. Official-desktop pop-out, roaming, and pet-generation UI are separate presentation features, not alternate storage formats.
