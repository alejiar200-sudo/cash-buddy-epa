/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exportación estática: el backend Express sirve estos archivos (modelo host).
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@cash-buddy/shared"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
