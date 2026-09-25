import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aiClassDuration,
  aiPromptNotes,
  aiUsage,
  formatAiReport,
} from '../../../supabase/functions/cn-api/ai-composer.ts';

test('AI usage resets at UTC midnight, shown as 8 AM Manila time', () => {
  const usage = aiUsage(3, new Date('2026-09-25T13:00:00Z'));
  assert.equal(usage.remaining, 7);
  assert.equal(usage.resets_at, '2026-09-26T00:00:00.000Z');
});

test('AI composer removes known names from the provider prompt and restores report context', () => {
  const notes = aiPromptNotes('Alex tried hard. Ms Lee assigned homework.', 'Alex', 'Ms Lee');
  assert.equal(notes, '{{STUDENT_NAME}} tried hard. {{TEACHER_NAME}} assigned homework.');
  assert.equal(aiPromptNotes('alex and A. B', 'Alex', 'A. B'), '{{STUDENT_NAME}} and {{TEACHER_NAME}}');
  assert.equal(aiClassDuration('', '17:00-17:25'), '25 mins');
  const report = formatAiReport('Student Name: {{STUDENT_NAME}}\nFeedback: {{STUDENT_NAME}} tried hard.', {
    student: 'Alex', teacherName: 'Ms Lee', date: '2026-09-25',
    timeslot: '17:00-17:25', duration: '25 mins',
  });
  assert.match(report, /Student Name: Alex/);
  assert.match(report, /Feedback:\nAlex tried hard\./);
  assert.match(report, /Teacher Name: Ms Lee$/);
  assert.doesNotMatch(report, /\{\{STUDENT_NAME\}\}/);
  assert.match(formatAiReport('She did her homework.', {
    student: 'Alex', teacherName: 'Ms Lee', date: '2026-09-25',
    timeslot: '17:00-17:25', duration: '25 mins',
  }), /the student did the student's homework/);
});
