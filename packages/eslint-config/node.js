import globals from 'globals';

import base from './base.js';

/**
 * Preset for Node.js / Express packages and the server app.
 */
export default [
  ...base,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];
