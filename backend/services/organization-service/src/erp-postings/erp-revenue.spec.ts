import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { revenueKey, revenuePayload, revenueSucceeded } from './erp-revenue';

// One line exactly as Idoraa sent it to /MaxLabEMS/api/fnb/revenue (ERPReport-0-MAXJPE-144).
const sent = {
  suN_BU: 'JHL',
  jrnaL_TYPE: 'ZHI01',
  ledger: 'H',
  accounT_CODE: '42020075',
  treference: 'MAXJPE/00268197',
  description: 'FNB',
  period: '0062025',
  transactioN_DATE: '02092025',
  dc: 'C',
  amount: 123.8,
  cur: 'INR',
  duE_DATE: '',
  t1: 'JHL',
  t2: 'JHL',
  t3: '30SUP013',
  t4: '_NA',
  t5: 'DCAS0003',
  t6: '_NA',
  t7: '_NA',
  t8: 'R',
  t9: 'SEP',
  t10: 'N',
  afS_1: 'FNB',
  afS_2: 'FNB',
  afS_3: 'SURJEET',
  afS_4: 'FNB',
  afS_5: 'MAXJPE/00268197',
  afs_6: '',
  afs_7: 'FNB',
  afs_8: 'FOOD',
  afs_9: 'FOOD',
  afs_10: '',
  afs_11: 'MAXJPE/00268197',
  afs_12: 'FNB',
  afs_13: '',
  afs_14: 'FNB',
  afs_15: 'JHL',
  afs_16: 'Non Chargeable',
  afs_17: '',
  afs_18: '',
  afs_19: 'MAXJPE/00268197',
  afs_20: 'ZHI01-0-MAXJPE/00268197-JHL-H',
  afs_21: '',
  afs_22: '',
  afs_23: '',
  afs_24: '',
  afs_25: '',
  afS_DATE_1: '02092025',
  afS_DATE_2: '02092025',
  afS_DATE_3: '02092025',
  afS_DATE_4: '',
  afS_DATE_5: '',
  entrY_DATE: '',
  modifY_DATE: '',
  unQ_ID: 0,
  batcH_CODE: 'ZHI01-0-02092025-JHL-H',
  status: '',
  statuS_DESC: '',
  erroR_DESC: '',
  systeM_TYPE: 'HIS',
  transactioN_TYPE: 'SETTLED',
  jrnaL_NO: '',
  memO_AMT: 0,
  error: '',
  code: '',
  type: '',
  details: '',
  messagestatus: '0',
  messageid: '',
};

// The same line as the ERP Journal (SUN) report builds it: missing columns are blank.
const journalRow = {
  ACCOUNT_CODE: '42020075',
  AFS_1: 'FNB',
  AFS_10: null,
  AFS_11: 'MAXJPE/00268197',
  AFS_12: 'FNB',
  AFS_14: 'FNB',
  AFS_15: 'JHL',
  AFS_16: 'Non Chargeable',
  AFS_19: 'MAXJPE/00268197',
  AFS_2: 'FNB',
  AFS_20: 'ZHI01-0-MAXJPE/00268197-JHL-H',
  AFS_3: 'SURJEET',
  AFS_4: 'FNB',
  AFS_5: 'MAXJPE/00268197',
  AFS_7: 'FNB',
  AFS_8: 'FOOD',
  AFS_9: 'FOOD',
  AFS_DATE_1: '02092025',
  AFS_DATE_2: '02092025',
  AFS_DATE_3: '02092025',
  AMOUNT: 123.8,
  BATCH_CODE: 'ZHI01-0-02092025-JHL-H',
  CUR: 'INR',
  DC: 'C',
  DESCRIPTION: 'FNB',
  JRNAL_TYPE: 'ZHI01',
  LEDGER: 'H',
  MEMO_AMT: 0,
  MESSAGESTATUS: '0',
  PERIOD: '0062025',
  SUN_BU: 'JHL',
  SYSTEM_TYPE: 'HIS',
  T1: 'JHL',
  T10: 'N',
  T2: 'JHL',
  T3: '30SUP013',
  T4: '_NA',
  T5: 'DCAS0003',
  T6: '_NA',
  T7: '_NA',
  T8: 'R',
  T9: 'SEP',
  TRANSACTION_DATE: '02092025',
  TRANSACTION_TYPE: 'SETTLED',
  TREFERENCE: 'MAXJPE/00268197',
  UNQ_ID: 0,
};

test('a journal line goes out with the ERP’s own field names, in its order', () => {
  const payload = revenuePayload([journalRow]);

  assert.equal(payload.userInfo, '');
  assert.deepEqual(payload.fnBRevenueList, [sent]);
  assert.deepEqual(Object.keys(payload.fnBRevenueList[0]!), Object.keys(sent));
});

test('field names follow the ERP’s quirks', () => {
  assert.equal(revenueKey('SUN_BU'), 'suN_BU');
  assert.equal(revenueKey('AFS_DATE_4'), 'afS_DATE_4');
  assert.equal(revenueKey('AFS_5'), 'afS_5');
  assert.equal(revenueKey('AFS_6'), 'afs_6');
  assert.equal(revenueKey('MESSAGESTATUS'), 'messagestatus');
});

test('only a 2xx answer saying success counts as sent', () => {
  const saved = '{"success":true,"message":"Records Saved Successfully","returnValue":1}';

  assert.deepEqual(revenueSucceeded(200, saved), { ok: true });
  assert.deepEqual(revenueSucceeded(200, '{"success":false,"message":"Duplicate batch"}'), {
    error: 'Duplicate batch',
    ok: false,
  });
  assert.deepEqual(revenueSucceeded(401, ''), { error: 'The ERP answered HTTP 401.', ok: false });
  assert.deepEqual(revenueSucceeded(200, '<html>'), {
    error: 'The ERP did not answer with JSON.',
    ok: false,
  });
});
