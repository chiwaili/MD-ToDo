/**
 * Test suite for markdown parsing and compiling round-trips
 * Run with: node test-parser.mjs
 */

import { parseMarkdown, compileMarkdown } from './src/parser.js';
import assert from 'assert';

console.log('🧪 Starting Markdown Parser Tests...\n');

// Helper to run a test and print output
function runTest(name, testFn) {
  try {
    testFn();
    console.log(`✅ TEST PASSED: ${name}`);
  } catch (err) {
    console.error(`❌ TEST FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// Test 1: Simple list (no headings)
runTest('Simple checklist parsing & compiling round-trip', () => {
  const input = [
    '- [ ] Task 1',
    '- [ ] Task 2 #tag',
    '- [x] Completed task'
  ].join('\n') + '\n';
  
  const parsed = parseMarkdown(input, 'simple.md');
  
  // Verify basic structure
  assert.strictEqual(parsed.hasHeadings, false);
  assert.strictEqual(parsed.columns.length, 2); // Should split into Todo and Done
  assert.strictEqual(parsed.columns[0].name, 'Todo');
  assert.strictEqual(parsed.columns[0].tasks.length, 2);
  assert.strictEqual(parsed.columns[1].name, 'Done');
  assert.strictEqual(parsed.columns[1].tasks.length, 1);
  
  const compiled = compileMarkdown(parsed);
  assert.strictEqual(compiled, input);
});

// Test 2: Full markdown file with headings, descriptions, and subtasks
runTest('Complex markdown file with headers, descriptions, and subtasks', () => {
  const input = [
    '# Project Notes',
    'Some introduction paragraph.',
    'Another text line.',
    '',
    '## Todo',
    '- [ ] Task A',
    '  This is a description line.',
    '  And another description line.',
    '  - [ ] Subtask A.1',
    '  - [x] Subtask A.2',
    '- [ ] Task B #bug #critical',
    '',
    '## In Progress',
    '- [ ] Task C',
    '  - [ ] Subtask C.1',
    '',
    '## Done',
    '- [x] Task D',
    '',
    'Some footer notes.'
  ].join('\n') + '\n';

  const parsed = parseMarkdown(input, 'my-project.md');
  
  // Verify structure
  assert.strictEqual(parsed.hasHeadings, true);
  assert.strictEqual(parsed.title, 'My Project');
  assert.strictEqual(parsed.preamble.length, 3); // '# Project Notes', 'Some introduction paragraph.', 'Another text line.'
  assert.strictEqual(parsed.columns.length, 3); // Todo, In Progress, Done
  
  // Verify Todo tasks
  const todoCol = parsed.columns[0];
  assert.strictEqual(todoCol.name, 'Todo');
  assert.strictEqual(todoCol.tasks.length, 2);
  
  const taskA = todoCol.tasks[0];
  assert.strictEqual(taskA.title, 'Task A');
  assert.strictEqual(taskA.description.length, 2);
  assert.strictEqual(taskA.description[0], 'This is a description line.');
  assert.strictEqual(taskA.subtasks.length, 2);
  assert.strictEqual(taskA.subtasks[0].title, 'Subtask A.1');
  assert.strictEqual(taskA.subtasks[0].completed, false);
  assert.strictEqual(taskA.subtasks[1].title, 'Subtask A.2');
  assert.strictEqual(taskA.subtasks[1].completed, true);
  
  const taskB = todoCol.tasks[1];
  assert.strictEqual(taskB.title, 'Task B #bug #critical');
  assert.strictEqual(taskB.tags.length, 2);
  assert.deepStrictEqual(taskB.tags, ['#bug', '#critical']);
  
  // Verify compiling
  const compiled = compileMarkdown(parsed);
  assert.strictEqual(compiled, input);
});

// Test 3: Modify task columns (Kanban move) and re-compile
runTest('Modifying task properties & moving columns compiles correctly', () => {
  const input = [
    '## Todo',
    '- [ ] Task 1',
    '',
    '## Done',
    '- [x] Task 2'
  ].join('\n') + '\n';
  
  const parsed = parseMarkdown(input, 'modify.md');
  
  // Simulate drag and drop: move "Task 1" from "Todo" to "Done"
  const todoCol = parsed.columns[0];
  const doneCol = parsed.columns[1];
  
  const [task1] = todoCol.tasks.splice(0, 1);
  task1.completed = true; // Mark as complete
  doneCol.tasks.push(task1);
  
  const compiled = compileMarkdown(parsed);
  
  const expectedOutput = [
    '## Todo',
    '',
    '## Done',
    '- [x] Task 2',
    '- [x] Task 1'
  ].join('\n') + '\n';
  
  assert.strictEqual(compiled, expectedOutput);
});

console.log('\n🎉 All tests passed successfully!');
