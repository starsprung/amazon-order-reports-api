import mockdate from 'mockdate';
import { ElementHandle } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import { mocked } from 'ts-jest/utils';
import AmazonScraper, { TimePeriod } from './index';
import { mocks } from './__mocks__/puppeteer-extra';

describe('AmazonScraper', () => {
  beforeEach(() => {
    mocked(puppeteer.launch).mockResolvedValue(mocks.browser);
    mocked(mocks.browser.newPage).mockResolvedValue(mocks.page);
    mocked(mocks.page.goto).mockResolvedValue(mocks.response);
    mocked(mocks.page.$).mockResolvedValue(({} as unknown) as ElementHandle<Element>);
    mocked(mocks.page.url).mockReturnValue('');
    mocked(mocks.response.ok).mockReturnValue(true);

    mockdate.set('2020-01-01T00:00:00.000Z');
  });

  afterEach(() => {
    jest.resetAllMocks();
    mockdate.reset();
  });

  const mockUrls = (...urls: Array<string>) => {
    mocked(mocks.page.url).mockImplementation(() => urls.shift() ?? '');
  };

  describe('start', () => {
    it('should launch puppeteer with given options', async () => {
      const scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123',
        puppeteerOpts: {
          defaultViewport: {
            height: 600,
            width: 800
          }
        }
      });

      await scraper.start();

      expect(mocked(puppeteer.launch)).toBeCalledWith({
        defaultViewport: {
          height: 600,
          width: 800
        }
      });
    });
  });

  describe('stop', () => {
    it('should close puppeteer', async () => {
      const scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123',
        puppeteerOpts: {
          defaultViewport: {
            height: 600,
            width: 800
          }
        }
      });

      await scraper.start();
      await scraper.stop();

      expect(mocked(mocks.browser.close)).toBeCalled();
    });
  });

  describe('login', () => {
    it('should log in with given credentials', async () => {
      mockUrls('https://www.amazon.com/ap/signin');

      const scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await scraper.getOrders().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith(
        'input[name=email]',
        'testuser@example.com'
      );

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=password]', 'test123');
      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberMe]');
    });

    it('should throw error if OTP code is required, but no OTP option is provided', async () => {
      mockUrls('https://www.amazon.com/ap/signin', 'https://www.amazon.com/ap/mfa');

      const scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await expect(scraper.getOrders().next()).rejects.toThrow(
        '2FA code requested, but neither otpSecret nor otpFn were provided'
      );
    });

    it('should login using generated OTP code if otpSecret is provided', async () => {
      mockUrls('https://www.amazon.com/ap/signin', 'https://www.amazon.com/ap/mfa');

      const scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123',
        otpSecret: 'GVYX4RKDFYXXMNDJ'
      });

      await scraper.getOrders().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=otpCode]', '930899');
      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberDevice]');
    });

    it('should login using OTP code provided by otpFn', async () => {
      mockUrls('https://www.amazon.com/ap/signin', 'https://www.amazon.com/ap/mfa');

      const scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123',
        otpFn: async () => '123456'
      });

      await scraper.getOrders().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=otpCode]', '123456');
      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberDevice]');
    });

    it('should skip account fix-up page during login', async () => {
      mockUrls(
        'https://www.amazon.com/ap/signin',
        'https://www.amazon.com/ap/accountfixup',
        'https://www.amazon.com/ap/accountfixup'
      );

      const scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await scraper.getOrders().next();

      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('a[id*=skip]');
    });

    it('should throw error if sign-out assertion fails', async () => {
      mockUrls('https://www.amazon.com/ap/signin');
      mocked(mocks.page.$).mockResolvedValue(null);

      const scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await expect(scraper.getOrders().next()).rejects.toThrow('No sign-out link detected');
    });

    it('should throw error on bad response', async () => {
      mockUrls('https://www.amazon.com/ap/signin');
      mocked(mocks.response.ok).mockReturnValue(false);

      const scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await expect(scraper.getOrders().next()).rejects.toThrow('Failed request');
    });
  });

  describe('getOrders', () => {
    let scraper: AmazonScraper;
    let pages: {
      [index: string]: Array<{ [selector: string]: Array<{ [attr: string]: string }> }>;
    };

    beforeEach(() => {
      scraper = new AmazonScraper({
        username: 'testuser@example.com',
        password: 'test123'
      });

      pages = {
        '0': [
          {
            '.value': [
              { textContent: 'February 29, 2020' },
              { textContent: '$13.85' },
              { textContent: 'Scrandleton Sprunt' },
              { textContent: '123-6543210-0123456' }
            ]
          },
          {
            '.value': [
              { textContent: 'January 20, 2020' },
              { textContent: '$107.95' },
              { textContent: '098-1234567-7654321' }
            ]
          },
          {
            '.value': [
              { textContent: 'January 1, 2020' },
              { textContent: '$10' },
              { textContent: 'Scrandleton Sprunt' },
              { textContent: '876-4567890-0987654' }
            ]
          }
        ],
        '10': [
          {
            '.value': [
              { textContent: 'February 29, 2019' },
              { textContent: '$13.85' },
              { textContent: 'Scrandleton Sprunt' },
              { textContent: '223-6543210-0123456' }
            ]
          },
          {
            '.value': [
              { textContent: 'January 20, 2019' },
              { textContent: '$107.95' },
              { textContent: '198-1234567-7654321' }
            ]
          },
          {
            '.value': [
              { textContent: 'January 1, 2019' },
              { textContent: '$10' },
              { textContent: 'Scrandleton Sprunt' },
              { textContent: 'D01-4567890-0987654' }
            ]
          }
        ]
      };

      let orderInfos: typeof pages[0];

      mocked(mocks.page.goto).mockImplementation(async (url: string) => {
        const { startIndex } = url.match(/startIndex=(?<startIndex>\d+)/)?.groups ?? {};
        if (startIndex) {
          orderInfos = pages[startIndex] ?? [];
        } else {
          orderInfos = [];
        }

        return mocks.response;
      });

      mocked(mocks.page.$$eval).mockImplementation(
        async <R, X1, X2>(
          selector: string,
          fn: (els: Array<Element>, x1: X1, x2: X2) => R | Promise<R>,
          x1: X1,
          x2: X2
        ) => {
          if (selector !== '.order-info') {
            return [];
          }

          return fn(
            orderInfos.map(
              (orderInfo) =>
                (({
                  querySelectorAll: (selector: string) => orderInfo[selector]
                } as unknown) as Element)
            ),
            x1,
            x2
          );
        }
      );
    });

    it('should return order info', async () => {
      const results = [];
      for await (const order of scraper.getOrders()) {
        results.push(order);
      }

      expect(results).toEqual([
        {
          id: '123-6543210-0123456',
          date: 'February 29, 2020',
          shipTo: 'Scrandleton Sprunt',
          total: '$13.85'
        },
        { id: '098-1234567-7654321', date: 'January 20, 2020', total: '$107.95' },
        {
          id: '876-4567890-0987654',
          date: 'January 1, 2020',
          shipTo: 'Scrandleton Sprunt',
          total: '$10'
        },
        {
          date: 'February 29, 2019',
          id: '223-6543210-0123456',
          shipTo: 'Scrandleton Sprunt',
          total: '$13.85'
        },
        {
          date: 'January 20, 2019',
          id: '198-1234567-7654321',
          total: '$107.95'
        },
        {
          date: 'January 1, 2019',
          id: 'D01-4567890-0987654',
          shipTo: 'Scrandleton Sprunt',
          total: '$10'
        }
      ]);
    });

    it('should throw error on failure to parse order ID', async () => {
      pages[0].push({
        '.value': [
          { textContent: 'December 25, 2019' },
          { textContent: '$95.00' },
          { textContent: 'weird content' }
        ]
      });

      await expect(async () => {
        for await (const _ of scraper.getOrders()) {
        }
      }).rejects.toThrow('Failed to parse order ID');
    });

    it('should throw error on too few values', async () => {
      pages[0].push({
        '.value': [{ textContent: 'December 25, 2019' }, { textContent: '$95.00' }]
      });

      await expect(async () => {
        for await (const _ of scraper.getOrders()) {
        }
      }).rejects.toThrow('Order info has fewer values than expected');
    });

    it('should stop paging at limit', async () => {
      const results = [];
      for await (const order of scraper.getOrders({ limit: 10 })) {
        results.push(order);
      }

      expect(results.map((r) => r.id)).toEqual([
        '123-6543210-0123456',
        '098-1234567-7654321',
        '876-4567890-0987654'
      ]);
    });

    it('start from given startIndex', async () => {
      const results = [];
      for await (const order of scraper.getOrders({ startIndex: 10 })) {
        results.push(order);
      }

      expect(results.map((r) => r.id)).toEqual([
        '223-6543210-0123456',
        '198-1234567-7654321',
        'D01-4567890-0987654'
      ]);
    });

    it('should handle years in timePeriod', async () => {
      for await (const _ of scraper.getOrders({ timePeriod: 2020 })) {
      }

      expect(mocked(mocks.page.goto)).toBeCalledWith(
        'https://www.amazon.com/gp/your-account/order-history?orderFilter=year-2020&startIndex=0'
      );
    });

    it('should handle LAST_3_MONTHS in timePeriod', async () => {
      for await (const _ of scraper.getOrders({ timePeriod: TimePeriod.LAST_3_MONTHS })) {
      }

      expect(mocked(mocks.page.goto)).toBeCalledWith(
        'https://www.amazon.com/gp/your-account/order-history?orderFilter=months-3&startIndex=0'
      );
    });
  });
});
