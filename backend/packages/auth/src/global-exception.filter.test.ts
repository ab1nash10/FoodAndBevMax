import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { BadRequestException, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

afterEach(() => mock.restoreAll());

/** Runs the filter on one exception and returns what it sent. */
function send(exception: unknown) {
  mock.method(console, 'error', () => {});
  const sent: { body?: Record<string, unknown>; status?: number } = {};
  const response = {
    json(body: Record<string, unknown>) {
      sent.body = body;
    },
    status(code: number) {
      sent.status = code;
      return response;
    },
  };
  const request = { headers: {}, method: 'POST', originalUrl: '/api/v1/x', requestId: 'req-1' };
  const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) };

  new GlobalExceptionFilter().catch(exception, host as unknown as ArgumentsHost);

  return { errors: sent.body?.errors, message: sent.body?.message, status: sent.status };
}

/** The shape body-parser's errors have (http-errors), e.g. a JSON body over the size limit. */
function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), {
    expose: statusCode < 500,
    status: statusCode,
    statusCode,
  });
}

void test('an HttpException keeps its status and message', () => {
  assert.deepEqual(send(new NotFoundException('Transfer not found')), {
    errors: [],
    message: 'Transfer not found',
    status: 404,
  });
  assert.deepEqual(send(new BadRequestException(['name is required', 'code is required'])), {
    errors: ['name is required', 'code is required'],
    message: 'name is required, code is required',
    status: 400,
  });
});

void test('any other error is a bare 500, with no message or stack from the server', () => {
  assert.deepEqual(send(new TypeError("Cannot read properties of undefined (reading 'id')")), {
    errors: [],
    message: 'Internal Server Error',
    status: 500,
  });
  assert.deepEqual(send(httpError(502, 'upstream said no')), {
    errors: [],
    message: 'Internal Server Error',
    status: 500,
  });
});

void test('a body over the size limit is a 413, as Nest answers without this filter', () => {
  assert.deepEqual(send(httpError(413, 'request entity too large')), {
    errors: [],
    message: 'request entity too large',
    status: 413,
  });
});
