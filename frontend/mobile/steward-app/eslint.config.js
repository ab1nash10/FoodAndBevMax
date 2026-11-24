// The steward app's own lint: Expo's rules. (The repo's root config skips this folder.)
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([globalIgnores(['dist/*', 'scripts/*']), expoConfig]);
