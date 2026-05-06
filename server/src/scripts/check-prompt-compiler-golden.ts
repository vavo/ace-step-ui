import { validatePromptCompilerGoldenCases } from '../services/promptConstraints.js';

const errors = validatePromptCompilerGoldenCases();

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Prompt compiler golden cases passed.');
