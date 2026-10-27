import js from '@eslint/js';
import globals from 'globals';

export default [
  {ignores:['**/node_modules/**','**/build/**','**/dist/**','**/coverage/**','**/reports/**','leaderboard-service/**']},
  js.configs.recommended,
  {
    files:['**/*.{js,mjs}'],
    languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.node,...globals.browser,...globals.worker}},
    rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_',caughtErrors:'none',varsIgnorePattern:'^_'}],'no-empty':['error',{allowEmptyCatch:true}],'no-constant-condition':['error',{checkLoops:false}]},
  },
];
