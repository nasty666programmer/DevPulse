import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
    fetchMock: vi.fn(),
}));

vi.mock('node-fetch', () => ({
    default: fetchMock,
}));

import TelegramProvider from '../../../providers/telegram/TelegramProvider.js';

function htmlResponse(html: string, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => html,
    };
}

const SAMPLE_HTML = `
<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message" data-post="testchannel/101">
    <div class="tgme_widget_message_text">Hello <b>world</b></div>
    <a class="tgme_widget_message_date" href="https://t.me/testchannel/101">
      <time class="time" datetime="2026-08-19T10:00:00+00:00">10:00</time>
    </a>
  </div>
</div>
<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message" data-post="testchannel/102">
    <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.example/photo.jpg')" href="https://t.me/testchannel/102"></a>
    <a class="tgme_widget_message_date" href="https://t.me/testchannel/102">
      <time class="time" datetime="2026-08-19T11:00:00+00:00">11:00</time>
    </a>
  </div>
</div>
`;

describe('TelegramProvider.fetch', () => {
    let provider: TelegramProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new TelegramProvider();
    });

    it('requests the public preview page for the given username', async () => {
        fetchMock.mockResolvedValue(htmlResponse(SAMPLE_HTML));

        await provider.fetch('testchannel');

        expect(fetchMock).toHaveBeenCalledWith(
            'https://t.me/s/testchannel',
            expect.objectContaining({
                headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
            })
        );
    });

    it('parses a text post into a TelegramPost', async () => {
        fetchMock.mockResolvedValue(htmlResponse(SAMPLE_HTML));

        const posts = await provider.fetch('testchannel');

        expect(posts).toHaveLength(2);
        expect(posts[0]).toEqual({
            messageId: 101,
            text: 'Hello world',
            publishedAt: new Date('2026-08-19T10:00:00+00:00'),
            mediaUrls: [],
        });
    });

    it('extracts photo media URLs from the background-image style', async () => {
        fetchMock.mockResolvedValue(htmlResponse(SAMPLE_HTML));

        const posts = await provider.fetch('testchannel');

        expect(posts[1].mediaUrls).toEqual(['https://cdn.example/photo.jpg']);
        expect(posts[1].text).toBe('');
    });

    it('preserves line breaks from <br> tags instead of collapsing them into a run-on string', async () => {
        const multiLineHtml = `
          <div class="tgme_widget_message_wrap">
            <div class="tgme_widget_message" data-post="testchannel/103">
              <div class="tgme_widget_message_text">First line<br>Second line</div>
              <a class="tgme_widget_message_date" href="https://t.me/testchannel/103">
                <time class="time" datetime="2026-08-19T12:00:00+00:00">12:00</time>
              </a>
            </div>
          </div>
        `;
        fetchMock.mockResolvedValue(htmlResponse(multiLineHtml));

        const posts = await provider.fetch('testchannel');

        expect(posts).toHaveLength(1);
        expect(posts[0].text).toBe('First line\n\nSecond line');
    });

    it('skips a message missing a data-post id or a timestamp instead of throwing', async () => {
        const malformedHtml = `
          <div class="tgme_widget_message">
            <div class="tgme_widget_message_text">No post id or timestamp</div>
          </div>
        `;
        fetchMock.mockResolvedValue(htmlResponse(malformedHtml));

        const posts = await provider.fetch('testchannel');

        expect(posts).toEqual([]);
    });

    it('throws a clear error when the channel page request fails', async () => {
        fetchMock.mockResolvedValue(htmlResponse('', 404));

        await expect(provider.fetch('missingchannel')).rejects.toThrow('HTTP 404');
    });
});
