import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Native ONNX runtime for the optional cross-encoder reranker. Loaded at
  // runtime from node_modules instead of being bundled by webpack.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],
};

export default config;
