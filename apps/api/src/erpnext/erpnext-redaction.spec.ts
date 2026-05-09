import { redactERPNextPayload } from './erpnext-redaction';

describe('redactERPNextPayload', () => {
  it('redacts ERPNext secrets recursively', () => {
    expect(
      redactERPNextPayload({
        api_secret: 'secret',
        headers: {
          Authorization: 'token key:secret',
        },
        nested: {
          refresh_token: 'token',
          value: 'safe',
        },
      }),
    ).toEqual({
      api_secret: '[REDACTED]',
      headers: {
        Authorization: '[REDACTED]',
      },
      nested: {
        refresh_token: '[REDACTED]',
        value: 'safe',
      },
    });
  });
});
