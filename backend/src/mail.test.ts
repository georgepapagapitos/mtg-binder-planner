import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMailConfigured, sendMail } from './mail';

vi.mock('./logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
});

describe('isMailConfigured', () => {
  it('reflects whether RESEND_API_KEY is set', () => {
    delete process.env.RESEND_API_KEY;
    expect(isMailConfigured()).toBe(false);
    process.env.RESEND_API_KEY = 'test-key';
    expect(isMailConfigured()).toBe(true);
  });
});

describe('sendMail', () => {
  it('logs instead of sending when unconfigured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { logger } = await import('./logger');
    await sendMail({ to: 'a@b.com', subject: 'Hi', text: 'Body' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('a@b.com'));
  });

  it('POSTs to the Resend API with the configured from address when set', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.MAIL_FROM = 'Test <t@spellcontrol.com>';
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response('{}', { status: 200 });
    });
    await sendMail({ to: 'a@b.com', subject: 'Hi', text: 'Body', html: '<p>Body</p>' });
    expect(capturedUrl).toBe('https://api.resend.com/emails');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toMatchObject({
      from: 'Test <t@spellcontrol.com>',
      to: 'a@b.com',
      subject: 'Hi',
      text: 'Body',
      html: '<p>Body</p>',
    });
  });

  it('never throws on a network failure or a non-OK response', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.stubGlobal('fetch', async () => new Response('down', { status: 500 }));
    await expect(sendMail({ to: 'a@b.com', subject: 'Hi', text: 'Body' })).resolves.toBeUndefined();

    vi.stubGlobal('fetch', async () => {
      throw new Error('ENOTFOUND');
    });
    await expect(sendMail({ to: 'a@b.com', subject: 'Hi', text: 'Body' })).resolves.toBeUndefined();
  });
});
