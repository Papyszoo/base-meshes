# base-meshes

100% free CC0 game dev assets derived from https://thebasemesh.com and converted into glTF binary as an asset pallet. Every model is made to real-world scale and comes with basic UVs. You can drag and drop from the github pages into platforms that support drag n' drop real-time editing (https://hyperfy.io, [webaverse](https://github.com/webaverse-studios), [janusweb](https://github.com/jbaicoianu/janusweb), etc).

Link: https://m3-org.github.io/base-meshes/

![image](https://user-images.githubusercontent.com/32600939/233737833-49e9aa5f-4471-4fa3-8d77-2c1a80710fa8.png)

## ModelibrStore manifest (this fork)

This fork adds Modelibr-rendered previews per model (`.png` thumbnail +
animated `.webp` turntable) and `store-manifest.json` — the ready-to-upload
[ModelibrStore](https://store.modelibr.com) external-pack manifest describing
all 900 models with SHA-256 checksums, pinned to the commit that last changed
`models/`.

Upload: store Admin → Upload → **External pack (GitHub-hosted)** → *Load
manifest file (.json)* → pick `store-manifest.json` → Publish. Suggested
listing metadata: title **Base Meshes**, license **CC0**, description crediting
The Base Mesh (thebasemesh.com) and the M3-org/base-meshes glTF conversion.

Regenerate after changing models: `node scripts/generate-store-manifest.mjs`
(see the pin rules in that script's header).
