import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export to out/ so the site can be hosted on GitHub Pages (or any static host).
  // The game has no server code: scoring, progress and ARIA all run in the browser.
  output: 'export',
  // GitHub Pages serves a project site from /<repo>/. CI sets PAGES_BASE_PATH from actions/configure-pages;
  // locally it is unset, so dev and `npm start` run at the root.
  basePath: process.env.PAGES_BASE_PATH ?? '',
  poweredByHeader: false,
};

export default nextConfig;
