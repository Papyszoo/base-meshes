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

// ---------------------------------------------------------------------------
// Keyword → standard Model category (ModelibrStore docs/taxonomy.json v1).
// Matched against underscore-separated name segments (plural-insensitive),
// FIRST match in table order wins — put specific words before generic ones.
// Unmatched models default to "Props" (this is a props library) and are listed
// in category-report.txt for curation.
// ---------------------------------------------------------------------------
const KEYWORD_CATEGORIES = [
  // Weapons before Tools ("battle_axe" vs "axe" both → Weapons; "pickaxe" handled below)
  [['sword', 'dagger', 'shuriken', 'katana', 'mace', 'spear', 'shield', 'bow?', 'arrow', 'arrowhead', 'bullet', 'grenade', 'cannon', 'gun', 'rifle', 'pistol', 'ammo', 'battle', 'blade', 'axe', 'crossbow', 'quiver', 'sheath', 'scabbard', 'flail', 'halberd', 'club'], 'Weapons'],
  [['helmet', 'armor', 'armour', 'gauntlet', 'boot', 'glove', 'hat', 'cap', 'belt', 'cloak', 'shoe', 'sandal', 'crown', 'mask', 'shirt', 'pants', 'dress', 'sock', 'scarf', 'jacket'], 'Armor & Clothing'],
  [['guitar', 'drum', 'violin', 'flute', 'piano', 'trumpet', 'harp', 'banjo', 'accordion', 'microphone', 'metronome', 'tambourine', 'xylophone', 'bell'], 'Music & Instruments'],
  [['dice', 'chess', 'domino', 'card', 'toy', 'teddy', 'puzzle', 'dart', 'billiard', 'bowling', 'baseball', 'basketball', 'football', 'tennis', 'golf', 'hockey', 'ski', 'skateboard', 'balloon', 'kite', 'yoyo'], 'Toys & Games'],
  [['apple', 'avocado', 'banana', 'bread', 'cake', 'cheese', 'egg', 'meat', 'pizza', 'fruit', 'vegetable', 'carrot', 'potato', 'tomato', 'onion', 'lemon', 'orange', 'pear', 'grape', 'melon', 'berry', 'mushroom?food', 'mug', 'teapot', 'kettle', 'plate', 'bowl', 'cup', 'goblet', 'fork', 'spoon', 'whisk', 'pan', 'pot', 'jug', 'jar', 'bottle', 'glass', 'tray', 'chopstick', 'ladle', 'grater', 'colander', 'corkscrew', 'cutlery', 'saucer', 'pitcher', 'flask', 'tankard', 'cauldron', 'skillet', 'spatula', 'rolling', 'toaster', 'donut', 'doughnut', 'cookie', 'croissant', 'baguette', 'sausage', 'steak', 'fish?food', 'pumpkin', 'corn', 'wine', 'beer', 'coffee', 'tea'], 'Food & Kitchen'],
  [['table', 'chair', 'stool', 'bench', 'shelf', 'shelving', 'cabinet', 'drawer', 'desk', 'bed', 'bedside', 'couch', 'sofa', 'wardrobe', 'dresser', 'bookcase', 'ottoman', 'armchair', 'crib', 'bunk', 'nightstand', 'sideboard'], 'Furniture'],
  [['architrave', 'beam', 'column', 'pillar', 'door', 'window', 'wall', 'stair', 'staircase', 'roof', 'fence', 'arch', 'brick', 'gutter', 'awning', 'balustrade', 'banister', 'cornice', 'skirting', 'lintel', 'sill', 'chimney', 'gate', 'railing', 'scaffold', 'girder', 'truss', 'panel'], 'Architecture'],
  [['screw', 'nut', 'bolt', 'hammer', 'wrench', 'spanner', 'saw', 'drill', 'plier', 'nail', 'anvil', 'bellows', 'hook', 'axle', 'chisel', 'screwdriver', 'clamp', 'vice', 'vise', 'file', 'rasp', 'trowel', 'shovel', 'spade', 'pickaxe', 'crowbar', 'mallet', 'allen', 'ratchet', 'socket', 'toolbox', 'tape', 'ruler', 'level', 'caliper', 'washer', 'rivet', 'hinge', 'padlock', 'chain', 'rope', 'pulley', 'gear', 'cog', 'spring', 'pipe', 'valve', 'ladder', 'wheelbarrow', 'rake', 'hoe', 'scythe', 'sickle', 'pitchfork'], 'Tools & Hardware'],
  [['jack', 'cable', 'plug', 'phone', 'monitor', 'keyboard', 'speaker', 'headphone', 'camera', 'battery', 'switch', 'socket?power', 'laptop', 'computer', 'mouse', 'screen', 'television', 'tv', 'radio', 'antenna', 'circuit', 'led', 'usb', 'charger', 'remote', 'console', 'joystick', 'gamepad'], 'Electronics'],
  [['acorn', 'leaf', 'rock', 'boulder', 'tree', 'branch', 'log', 'stump', 'mushroom', 'flower', 'plant', 'bush', 'grass', 'vine', 'pinecone', 'seashell', 'shell', 'coral', 'stone', 'pebble', 'stick', 'twig', 'root', 'cactus', 'fern', 'moss'], 'Nature'],
  [['dog', 'cat', 'fish', 'bird', 'horse', 'cow', 'pig', 'sheep', 'chicken', 'duck', 'rabbit', 'frog', 'snake', 'rattlesnake', 'spider', 'deer', 'bull', 'stag', 'boar', 'bone', 'skull?animal', 'antler', 'horn', 'feather', 'egg?nest'], 'Creatures & Animals'],
  [['car', 'truck', 'boat', 'ship', 'cart', 'wagon', 'wheel', 'tire', 'tyre', 'bicycle', 'bike', 'motorcycle', 'plane', 'helicopter', 'canoe', 'kayak', 'sled', 'anchor', 'oar', 'paddle?boat', 'rudder', 'propeller'], 'Vehicles'],
  [['human', 'male', 'female', 'mannequin', 'peg_person'], 'Characters'],
  [['vase', 'statue', 'sculpture', 'picture', 'frame', 'painting', 'banner', 'flag', 'trophy', 'ornament', 'figurine', 'candelabra', 'chandelier', 'wreath', 'garland', 'ribbon', 'speech', 'sign', 'signpost', 'plaque', 'pedestal', 'plinth', 'birdhouse', 'wind_chime', 'gnome'], 'Decorative'],
  [['vent', 'candle', 'clock', 'mirror', 'lamp', 'lantern', 'broom', 'bucket', 'basket', 'bin', 'ashtray', 'ash', 'towel', 'soap', 'brush', 'comb', 'razor', 'toothbrush', 'pillow', 'cushion', 'blanket', 'curtain', 'rug', 'carpet', 'hanger', 'sponge', 'mop', 'dustpan', 'plunger', 'scissors', 'needle', 'thread', 'button', 'zipper', 'umbrella', 'cane', 'crutch', 'bandage', 'syringe', 'thermometer', 'pill', 'book', 'pen', 'pencil', 'paper', 'envelope', 'scroll', 'quill', 'inkwell', 'stamp', 'key', 'coin', 'wallet', 'purse', 'bag', 'suitcase', 'chest', 'crate', 'barrel', 'box', 'sack', 'pouch', 'abacus', 'hourglass', 'telescope', 'binoculars', 'magnifying', 'compass', 'globe', 'map', 'beaker', 'vial', 'test_tube', 'auction', 'adhesive'], 'Household'],
];

// Segment-based match, crude plural folding; entries with '?' are
// disambiguation notes and match on the part before it.
function categorize(name) {
  const segments = name.toLowerCase().split('_').filter(Boolean)
    .map((seg) => (seg.endsWith('s') && seg.length > 3 ? seg.slice(0, -1) : seg));
  for (const [keywords, category] of KEYWORD_CATEGORIES) {
    for (const raw of keywords) {
      const kw = raw.split('?')[0];
      if (segments.includes(kw)) return category;
    }
  }
  return 'Props';
}
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
  const category = categorize(name);
  items.push({
    name: dn,
    itemType: 'Model',
    metadataJson: JSON.stringify({ category }),
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

// Reviewable assignment report: category → models, so miscategorizations are
// one glance away (curate by extending KEYWORD_CATEGORIES and rerunning).
{
  const byCategory = new Map();
  for (const item of items) {
    const cat = JSON.parse(item.metadataJson).category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(item.name);
  }
  const lines = [];
  for (const [cat, names2] of [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`## ${cat} (${names2.length})`, ...names2.map((n) => `  ${n}`), '');
  }
  writeFileSync(path.join(REPO, 'category-report.txt'), lines.join('\n'));
  console.log('categories:', [...byCategory.entries()].map(([c, n]) => `${c}=${n.length}`).join(', '));
}

console.log(`models: ${items.length}, files: ${files.length}, previews: ${previews.length}`);
if (skipped.length) console.log(`skipped: ${skipped.join(', ')}`);
console.log(`total mesh bytes: ${(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)} MB`);
console.log('wrote store-manifest.json');
