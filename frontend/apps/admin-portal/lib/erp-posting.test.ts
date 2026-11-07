import { strict as assert } from 'node:assert';
import type { ErpPostingDetail } from '@aahar/api-client';
import { test } from 'vitest';
import { erpLogFile, erpLogFileName, erpStatus } from './erp-posting';

const posting: ErpPostingDetail = {
  billCount: 13,
  businessDate: '2025-09-02',
  createdAt: '2025-09-02T21:58:51.000Z',
  durationMs: 85,
  error: null,
  hospitalId: 'h1',
  id: 'p1',
  report: null,
  requestBody: '{"userInfo":"","fnBRevenueList":[{"suN_BU":"JHL"}]}',
  responseBody: '{"success":true,"message":"Records Saved Successfully","returnValue":1}',
  responseStatus: 200,
  restaurantId: 'r1',
  restaurantName: 'LXF Food Trolley',
  rowCount: 1,
  sentBy: 'u1',
  sentByName: 'Abinash',
  status: 'SUCCESS',
};

test('the log file reads like the old system’s: request, then the ERP’s answer', () => {
  const text = erpLogFile(posting);

  assert.match(text, /^Restaurant: LXF Food Trolley\nBusiness day: 2025-09-02\n/);
  assert.match(text, /Time 0\.085sec/);
  assert.match(text, /Request\n\{"userInfo":"","fnBRevenueList":\[\{"suN_BU":"JHL"\}\]\}\n/);
  assert.match(text, /Response\nHTTP 200\n\{"success":true/);
  assert.doesNotMatch(text, /Authorization|Bearer/, 'the token is never in the file');
  assert.equal(erpLogFileName(posting), 'ERPReport-LXF-Food-Trolley-2025-09-02.txt');
});

test('a send that never reached the ERP says so instead of an answer', () => {
  const text = erpLogFile({
    ...posting,
    error: 'The ERP could not be reached: connect ETIMEDOUT',
    responseBody: null,
    responseStatus: null,
    status: 'FAILED',
  });

  assert.match(text, /Response\nNo answer: The ERP could not be reached: connect ETIMEDOUT/);
});

test('statuses read plainly, with a colour', () => {
  assert.deepEqual(erpStatus('SUCCESS'), { label: 'Success', tone: 'success' });
  assert.deepEqual(erpStatus('FAILED'), { label: 'Failed', tone: 'danger' });
  assert.deepEqual(erpStatus('EMPTY'), { label: 'Nothing to send', tone: 'neutral' });
  assert.deepEqual(erpStatus('PENDING'), { label: 'Sending', tone: 'info' });
});
