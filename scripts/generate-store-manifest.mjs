// Generates store-manifest.json (repo root): the ModelibrStore "external pack"
// manifest describing every model in this repo — one Model item per mesh, the
// GLB as role=Mesh, the PNG as a Thumbnail preview and the animated WebP as a
// Turntable preview, each with its SHA-256 and size.
//
// Upload flow: ModelibrStore → Admin → Upload → External pack (GitHub-hosted)
// → "Load manifest file (.json)" → pick store-manifest.json → Publish.
//
// Rerun after changing anything under models/, then update PINNED_SHA to the
// new commit that contains those model changes and rerun again.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// DECISION: URLs are pinned to the commit SHA of the last change to models/ so
// a later push can never alter the bytes behind a published manifest (the
// store verifies these hashes at submission). Metadata commits (README, this
// script, the manifest itself) don't move that commit, so they don't require
// re-pinning.
const PINNED_SHA = '792e14d4f80d6345c2382d13c17dd9f862fb3a75';

const lastModelsCommit = execSync('git log -1 --format=%H -- models', { cwd: REPO }).toString().trim();
if (lastModelsCommit !== PINNED_SHA) {
  console.error(
    `models/ last changed in ${lastModelsCommit}, but PINNED_SHA is ${PINNED_SHA}.\n` +
    'Update PINNED_SHA to that commit (after pushing it) and rerun — otherwise the ' +
    'manifest hashes would describe bytes the pinned URLs do not serve.');
  process.exit(1);
}
const dirty = execSync('git status --porcelain -- models', { cwd: REPO }).toString().trim();
if (dirty) {
  console.error('models/ has uncommitted changes — refusing to hash.');
  process.exit(1);
}

const rawBase = `https://raw.githubusercontent.com/Papyszoo/base-meshes/${PINNED_SHA}/models`;
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const displayName = (name) =>
  name
    .split('_')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');

const modelsDir = path.join(REPO, 'models');
const names = readdirSync(modelsDir)
  .filter((n) => statSync(path.join(modelsDir, n)).isDirectory())
  .sort();

const files = [];
const items = [];
const previews = [];
const seenDisplay = new Set();
const skipped = [];

for (const name of names) {
  const glb = path.join(modelsDir, name, `${name}.glb`);
  if (!existsSync(glb)) {
    skipped.push(`${name} (no glb)`);
    continue;
  }
  const dn = displayName(name);
  if (seenDisplay.has(dn)) {
    console.error(`Duplicate display name '${dn}' — item matching would collide.`);
    process.exit(1);
  }
  seenDisplay.add(dn);

  const relGlb = `models/${name}/${name}.glb`;
  files.push({
    fileName: `${name}.glb`,
    path: relGlb,
    externalUrl: `${rawBase}/${name}/${name}.glb`,
    sha256: sha256(glb),
    size: statSync(glb).size,
    role: 'Mesh',
  });
  items.push({
    name: dn,
    itemType: 'Model',
    metadataJson: null,
    isPreviewable: true,
    files: [{ path: relGlb, role: 'Mesh' }],
  });

  const png = path.join(modelsDir, name, `${name}.png`);
  if (existsSync(png)) {
    previews.push({
      fileName: `${name}.png`,
      externalUrl: `${rawBase}/${name}/${name}.png`,
      sha256: sha256(png),
      size: statSync(png).size,
      contentType: 'image/png',
      type: 'Thumbnail',
      itemName: dn,
    });
  } else {
    skipped.push(`${name} (no png preview)`);
  }

  const webp = path.join(modelsDir, name, `${name}.webp`);
  if (existsSync(webp)) {
    previews.push({
      fileName: `${name}.webp`,
      externalUrl: `${rawBase}/${name}/${name}.webp`,
      sha256: sha256(webp),
      size: statSync(webp).size,
      contentType: 'image/webp',
      type: 'Turntable', // animated turntable; <img> plays it natively
      itemName: dn,
    });
  }
}

writeFileSync(
  path.join(REPO, 'store-manifest.json'),
  JSON.stringify({ files, items, previews }, null, 1)
);

console.log(`models: ${items.length}, files: ${files.length}, previews: ${previews.length}`);
if (skipped.length) console.log(`skipped: ${skipped.join(', ')}`);
console.log(`total mesh bytes: ${(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)} MB`);
console.log('wrote store-manifest.json');
