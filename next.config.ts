import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['**.*'],
  // Isolated build output for the e2e gate (NEXT_DIST_DIR=.next-e2e) so a QA
  // build/serve never shares .next with a dev server or another session.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      // Product/profile images are uploaded THROUGH a Server Action, and Next
      // caps action bodies at 1 MB by default — which is what produced the
      // "Body exceeded 1 MB limit" 413 and the "Something went wrong" boundary
      // on product create. 50 MB is roughly ten times any phone photo and keeps
      // the transient memory cost sane: Next buffers the whole action body, then
      // sharp decodes it. The image is re-encoded to WebP server-side regardless
      // of what arrives.
      bodySizeLimit: "50mb",
    },
    // A SECOND, independent cap. `proxy.ts` runs on these routes, and the proxy
    // layer defaults to 10 MB — so raising only bodySizeLimit would still have
    // failed for anything above 10 MB. Kept in step with bodySizeLimit above;
    // the lower of the two is what actually applies.
    proxyClientMaxBodySize: "50mb",
  },
  images: {
    // Uploads (profile/product images) are stored under /public/uploads and
    // served same-origin. Disable the optimizer so runtime-added files never
    // 404 through the image cache.
    unoptimized: true,
  },
};

export default nextConfig;
