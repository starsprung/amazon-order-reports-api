import appRootPath from 'app-root-path';
import { createReadStream, Dirent, FSWatcher, PathLike, ReadStream, watch } from 'fs';
import { mkdtemp, readdir, unlink } from 'fs/promises';
import mockdate from 'mockdate';
import { tmpdir } from 'os';
import { ElementHandle, Response } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import { Readable } from 'stream';
import { mocked } from 'ts-jest/utils';
import { v4 as uuidv4 } from 'uuid';
import { AmazonOrderReportsApi, OrderItem, Refund } from './index';
import { mocks } from './__mocks__/puppeteer-extra';

jest.mock('fs');
jest.mock('fs/promises');
jest.mock('os');
jest.mock('uuid');

describe('AmazonOrderReportsApi', () => {
  beforeEach(() => {
    mocked(createReadStream).mockReturnValue((Readable.from([]) as unknown) as ReadStream);
    mocked(mkdtemp).mockResolvedValue('/tmp/amzscrKudNUt');
    mocked(mocks.browser.newPage).mockResolvedValue(mocks.page);
    mocked(mocks.page.$).mockResolvedValue(({} as unknown) as ElementHandle<Element>);
    mocked(mocks.page.goto).mockResolvedValue(mocks.response);
    mocked(mocks.page.target).mockReturnValue(mocks.target);
    mocked(mocks.page.url).mockReturnValue('');
    mocked(mocks.page.waitForResponse).mockImplementation(async (fn) => {
      (fn as (response: Response) => boolean)(({
        url: () => 'https://www.amazon.com/b2b/reports/download'
      } as unknown) as Response);
      return {} as Response;
    });
    mocked(mocks.response.ok).mockReturnValue(true);
    mocked(mocks.target.createCDPSession).mockResolvedValue(mocks.cdpSession);
    mocked(puppeteer.launch).mockResolvedValue(mocks.browser);
    mocked(readdir).mockResolvedValue([('01-Dec-2020_to_31-Dec-2020.csv' as unknown) as Dirent]);
    mocked(tmpdir).mockReturnValue('/tmp/');
    mocked(uuidv4).mockReturnValue('5fb041e4-ad7a-41d4-879f-d1ec1919201a');
    mocked(watch).mockImplementation((_filename: PathLike, fn) => {
      (fn as (event: string, filename: string) => void)('rename', '01-Dec-2020_to_31-Dec-2020.csv');
      return ({ close: jest.fn() } as unknown) as FSWatcher;
    });

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
      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
        puppeteerOpts: {
          defaultViewport: {
            height: 600,
            width: 800
          }
        }
      });

      await api.start();

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
      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
        puppeteerOpts: {
          defaultViewport: {
            height: 600,
            width: 800
          }
        }
      });

      await api.start();
      await api.stop();

      expect(mocked(mocks.browser.close)).toBeCalled();
    });
  });

  describe('login', () => {
    it('should log in with given credentials', async () => {
      mockUrls('https://www.amazon.com/ap/signin');

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await api.getItems().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith(
        'input[name=email]',
        'testuser@example.com'
      );

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=password]', 'test123');
      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberMe]');
    });

    it('should throw error if OTP code is required, but no OTP option is provided', async () => {
      mockUrls('https://www.amazon.com/ap/signin', 'https://www.amazon.com/ap/mfa');

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await expect(api.getItems().next()).rejects.toThrow(
        '2FA code requested, but neither otpSecret nor otpFn were provided'
      );
    });

    it('should login using generated OTP code if otpSecret is provided', async () => {
      mockUrls('https://www.amazon.com/ap/signin', 'https://www.amazon.com/ap/mfa');

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
        otpSecret: 'GVYX4RKDFYXXMNDJ'
      });

      await api.getItems().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=otpCode]', '930899');
      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberDevice]');
    });

    it('should login using OTP code provided by otpFn', async () => {
      mockUrls('https://www.amazon.com/ap/signin', 'https://www.amazon.com/ap/mfa');

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
        otpFn: async () => '123456'
      });

      await api.getItems().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=otpCode]', '123456');
      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberDevice]');
    });

    it('should skip account fix-up page during login', async () => {
      mockUrls(
        'https://www.amazon.com/ap/signin',
        'https://www.amazon.com/ap/accountfixup',
        'https://www.amazon.com/ap/accountfixup'
      );

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await api.getItems().next();

      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('a[id*=skip]');
    });

    it('should throw error if sign-out assertion fails', async () => {
      mockUrls('https://www.amazon.com/ap/signin');
      mocked(mocks.page.$).mockResolvedValue(null);

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await expect(api.getItems().next()).rejects.toThrow('No sign-out link detected');
    });

    it('should throw error on bad response', async () => {
      mockUrls('https://www.amazon.com/ap/signin');
      mocked(mocks.response.ok).mockReturnValue(false);

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123'
      });

      await expect(api.getItems().next()).rejects.toThrow('Failed request');
    });
  });

  describe('getItems', () => {
    let api: AmazonOrderReportsApi;

    beforeEach(() => {
      api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123'
      });

      mocked(createReadStream).mockImplementation(() =>
        jest.requireActual('fs').createReadStream(appRootPath.resolve('test-data/items.csv'))
      );
    });

    it('should return item for each row in report', async () => {
      const items: Array<OrderItem> = [];
      for await (const item of api.getItems()) {
        items.push(item);
      }

      expect(items).toHaveLength(3);
      expect(items).toMatchSnapshot();
    });

    it('should should save to correct directory', async () => {
      for await (const _ of api.getItems()) {
      }

      expect(mocked(mocks.cdpSession.send)).toBeCalledWith('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: '/tmp/amzscrKudNUt'
      });
    });

    it('should use provided dates to retrieve report', async () => {
      for await (const _ of api.getItems({
        startDate: new Date('2020-01-07T00:00:00.000Z'),
        endDate: new Date('2021-02-14T00:00:00.000Z')
      })) {
      }

      expect(mocked(mocks.page.select)).toHaveBeenCalledWith('#report-day-start', '6');
      expect(mocked(mocks.page.select)).toHaveBeenCalledWith('#report-month-start', '1');
      expect(mocked(mocks.page.select)).toHaveBeenCalledWith('#report-year-start', '2020');
      expect(mocked(mocks.page.select)).toHaveBeenCalledWith('#report-day-end', '13');
      expect(mocked(mocks.page.select)).toHaveBeenCalledWith('#report-month-end', '2');
      expect(mocked(mocks.page.select)).toHaveBeenCalledWith('#report-year-end', '2021');
    });

    it('should delete report after retrieval', async () => {
      const fakeElements = ([{ click: jest.fn() }] as unknown) as Array<ElementHandle<Element>>;
      mocked(mocks.page.$x).mockResolvedValue(fakeElements);

      for await (const _ of api.getItems()) {
      }

      expect(mocked(mocks.page.$x)).toHaveBeenCalledWith(
        '//input[@name="delete-report" and ancestor::tr[contains(., \'amzscr-5fb041e4-ad7a-41d4-879f-d1ec1919201a\')]]'
      );
      expect(fakeElements[0].click).toBeCalled();
    });

    it('should delete report on disk', async () => {
      const fakeElements = ([{ click: jest.fn() }] as unknown) as Array<ElementHandle<Element>>;
      mocked(mocks.page.$x).mockResolvedValue(fakeElements);

      for await (const _ of api.getItems()) {
      }

      expect(unlink).toBeCalledWith('/tmp/amzscrKudNUt/01-Dec-2020_to_31-Dec-2020.csv');
    });
  });

  describe('getRefunds', () => {
    let api: AmazonOrderReportsApi;

    beforeEach(() => {
      api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123'
      });

      mocked(createReadStream).mockImplementation(() =>
        jest.requireActual('fs').createReadStream(appRootPath.resolve('test-data/refunds.csv'))
      );
    });

    it('should return refund for each row in report', async () => {
      const items: Array<Refund> = [];
      for await (const item of api.getRefunds()) {
        items.push(item);
      }

      expect(items).toHaveLength(3);
      expect(items).toMatchSnapshot();
    });
  });
});
