#!/usr/bin/env node
/**
 * Batch-render Modelibr-style thumbnails for every model in models/.
 *
 * For each models/<name>/<name>.glb this produces, via Modelibr's
 * asset-processor renderer (orbit turntable → animated WebP + PNG):
 *   models/<name>/<name>.webp  — animated 256px turntable thumbnail
 *   models/<name>/<name>.png   — matching static PNG (replaces upstream render)
 *
 * Requires a Modelibr checkout with src/asset-processor/node_modules installed.
 *
 * Usage:
 *   node scripts/render-thumbnails.mjs [--limit N] [--only <name>] [--force]
 *     [--asset-processor <path>]
 *
 * Resumable: models that already have a .webp are skipped unless --force.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const modelsDir = path.join(repoRoot, 'models')

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : fallback
}
const flag = name => process.argv.includes(name)

const assetProcessorDir = path.resolve(
  arg('--asset-processor', path.join(repoRoot, '..', 'Modelibr', 'src', 'asset-processor'))
)
const limit = arg('--limit') ? parseInt(arg('--limit'), 10) : Infinity
const only = arg('--only')
const force = flag('--force')

if (!fs.existsSync(path.join(assetProcessorDir, 'puppeteerRenderer.js'))) {
  console.error(`asset-processor not found at ${assetProcessorDir}`)
  process.exit(1)
}

// Quiet the worker's own logger; this script prints its own progress.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn'

const { PuppeteerRenderer } = await import(
  pathToFileURL(path.join(assetProcessorDir, 'puppeteerRenderer.js')).href
)
const { FrameEncoderService } = await import(
  pathToFileURL(path.join(assetProcessorDir, 'frameEncoderService.js')).href
)

const jobLogger = {
  info: () => {},
  debug: () => {},
  warn: (msg, meta) => console.warn(`  warn: ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`  error: ${msg}`, meta ?? ''),
}

const entries = fs
  .readdirSync(modelsDir, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)
  .filter(name => (only ? name === only : true))
  .filter(name => fs.existsSync(path.join(modelsDir, name, `${name}.glb`)))
  .filter(name => force || !fs.existsSync(path.join(modelsDir, name, `${name}.webp`)))
  .sort()
  .slice(0, limit)

console.log(`Rendering ${entries.length} model(s) at 256px (orbit → animated WebP + PNG)`)

const renderer = new PuppeteerRenderer()
await renderer.initialize()
const encoder = new FrameEncoderService()

const failed = []
let done = 0
const startedAt = Date.now()

for (const name of entries) {
  const glbPath = path.join(modelsDir, name, `${name}.glb`)
  try {
    await renderer.loadModel(glbPath, 'glb')
    const frames = await renderer.renderOrbitFrames(jobLogger)
    const result = await encoder.encodeFrames(frames, jobLogger)

    fs.copyFileSync(result.webpPath, path.join(modelsDir, name, `${name}.webp`))
    fs.copyFileSync(result.pngPath, path.join(modelsDir, name, `${name}.png`))
    // encodeFrames leaves its temp job dir behind; clean it up as we go
    fs.rmSync(path.dirname(result.webpPath), { recursive: true, force: true })

    done++
    if (done % 25 === 0 || done === entries.length) {
      const perModel = (Date.now() - startedAt) / done / 1000
      const etaMin = ((entries.length - done) * perModel) / 60
      console.log(
        `${done}/${entries.length} (${perModel.toFixed(1)}s/model, ~${etaMin.toFixed(0)}min left)`
      )
    }
  } catch (error) {
    failed.push({ name, error: error.message })
    console.error(`FAILED ${name}: ${error.message}`)
  }
}

await renderer.dispose()

console.log(`\nDone: ${done} rendered, ${failed.length} failed, ${(Date.now() - startedAt) / 60000 | 0}min total`)
if (failed.length > 0) {
  console.log('Failures:')
  for (const f of failed) console.log(`  ${f.name}: ${f.error}`)
  process.exitCode = 1
}
