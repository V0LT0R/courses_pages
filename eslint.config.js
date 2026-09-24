import globals from 'globals';
import js from '@eslint/js';
import hooks from 'eslint-plugin-react-hooks';
export default [
 {ignores:['node_modules/**','dist/**','supabase/functions/**','tests/legacy/**','tests/integration/load.k6.js']},
 {files:['**/*.{js,jsx,mjs}'],languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser,...globals.node},parserOptions:{ecmaFeatures:{jsx:true}}},
 rules:{...js.configs.recommended.rules,'no-undef':'error','no-unused-vars':'off','no-empty':['error',{allowEmptyCatch:true}]}},
 {files:['src/**/*.{js,jsx}'],plugins:{'react-hooks':hooks},rules:{'react-hooks/rules-of-hooks':'error'}}
];
