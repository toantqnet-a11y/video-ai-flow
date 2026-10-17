/**
 * Deliberately RED test for verifying the CI harness detects regression.
 * Excluded from ordinary test discovery; only the negative-control runner
 * invokes it in a child process and expects a nonzero result.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
test('R0-14 deliberate failing assertion',()=>assert.equal('regression','PASS'));
