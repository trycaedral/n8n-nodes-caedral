import { config } from '@n8n/node-cli/eslint';

export default [
  { ignores: ["tests/**", "nodes/**/__tests__/**", "dist/**"] },
  ...config,
];