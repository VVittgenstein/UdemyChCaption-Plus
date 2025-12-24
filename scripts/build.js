/**
 * esbuild build script for Udemy 字幕增强 Chrome Extension
 *
 * This script bundles all TypeScript modules into self-contained JavaScript files
 * that work correctly in Chrome Extension environment.
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

// Entry points for the extension
const entryPoints = [
  'src/background/service-worker.ts',
  'src/content/content-script.ts',
  'src/popup/popup.ts',
];

// Static files to copy
const staticFiles = [
  { src: 'manifest.json', dest: 'dist/manifest.json' },
  { src: 'src/popup/popup.html', dest: 'dist/popup/popup.html' },
  { src: 'src/popup/popup.css', dest: 'dist/popup/popup.css' },
];

// Directories to copy
const staticDirs = [
  { src: 'dist/icons', dest: 'dist/icons' }, // icons are already in dist
];

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Copy file
 */
function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log(`  Copied: ${src} -> ${dest}`);
}

/**
 * Copy directory recursively
 */
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`  Skipped (not exists): ${src}`);
    return;
  }
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  console.log(`  Copied dir: ${src} -> ${dest}`);
}

/**
 * Copy static assets
 */
function copyStaticAssets() {
  console.log('\nCopying static assets...');

  // Ensure dist directories exist
  ensureDir('dist/background');
  ensureDir('dist/content');
  ensureDir('dist/popup');
  ensureDir('dist/services');
  ensureDir('dist/storage');

  // Copy static files
  for (const { src, dest } of staticFiles) {
    if (fs.existsSync(src)) {
      copyFile(src, dest);
    } else {
      console.log(`  Warning: ${src} not found`);
    }
  }

  // Copy static directories
  for (const { src, dest } of staticDirs) {
    copyDir(src, dest);
  }
}

/**
 * Build the extension
 */
async function build() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Building Udemy 字幕增强 Extension...`);
  console.log(`Mode: ${isProd ? 'production' : 'development'}`);
  console.log(`${'='.repeat(50)}\n`);

  const startTime = Date.now();

  try {
    // Build configuration
    const buildOptions = {
      entryPoints,
      bundle: true,
      outdir: 'dist',
      format: 'iife', // Immediately Invoked Function Expression - no module system needed
      target: 'chrome110',
      minify: isProd,
      sourcemap: !isProd,
      logLevel: 'info',
      // Preserve directory structure
      outbase: 'src',
    };

    if (isWatch) {
      // Watch mode
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('\nWatching for changes...');

      // Copy static assets initially
      copyStaticAssets();

      // Watch static files for changes
      console.log('\nNote: Static files are copied only on initial build.');
      console.log('Restart the script to pick up changes to HTML/CSS/manifest.');
    } else {
      // Single build
      await esbuild.build(buildOptions);

      // Copy static assets
      copyStaticAssets();

      const elapsed = Date.now() - startTime;
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Build completed in ${elapsed}ms`);
      console.log(`${'='.repeat(50)}\n`);
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run build
build();
