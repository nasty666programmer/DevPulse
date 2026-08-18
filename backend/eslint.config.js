import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

const interfaceLocationRule = {
    selector: 'TSInterfaceDeclaration',
    message:
        'Interfaces must be defined in their own file, inside a sibling "interface" (or "interfaces") folder — not alongside the implementation.',
};

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            // TODO: tighten to 'error' once existing `any` usages are cleaned up
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
    {
        files: ['src/db/**/*.ts', 'src/modules/**/*.ts'],
        ignores: ['**/interface/**', '**/interfaces/**'],
        rules: {
            'no-restricted-syntax': ['error', interfaceLocationRule],
        },
    },
    prettierConfig
);
