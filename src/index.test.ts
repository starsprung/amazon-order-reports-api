import appRootPath from 'app-root-path';
import { createReadStream, Dirent, FSWatcher, PathLike, ReadStream, watch } from 'fs';
import { mkdtemp, readdir, unlink } from 'fs/promises';
import mockdate from 'mockdate';
import { tmpdir } from 'os';
import { ElementHandle, Response, Cookie } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import { Readable } from 'stream';
import { mocked } from 'ts-jest/utils';
import { v4 as uuidv4 } from 'uuid';
import { AmazonOrderReportsApi, OrderItem, Refund, Shipment } from './index';
import { mocks } from './__mocks__/puppeteer-extra';

jest.mock('delay');
jest.mock('fs');
jest.mock('fs/promises');
jest.mock('os');
jest.mock('uuid');

describe('AmazonOrderReportsApi', () => {
  const reportId = '1232lkajsdf';

  beforeEach(() => {
    mocked(createReadStream).mockReturnValue((Readable.from([]) as unknown) as ReadStream);
    mocked(mkdtemp).mockResolvedValue('/tmp/amzscrKudNUt');
    mocked(mocks.browser.newPage).mockResolvedValue(mocks.page);
    mocked(mocks.page.$).mockResolvedValue(({} as unknown) as ElementHandle<Element>);
    mocked(mocks.page.goto).mockResolvedValue(mocks.response);
    mocked(mocks.page.target).mockReturnValue(mocks.target);
    mocked(mocks.page.url).mockReturnValue('');
    const mockedResponse = {
      url: () => `https://www.amazon.com/b2b/reports/download/${reportId}`,
    } as Response;
    mocked(mocks.page.waitForResponse).mockImplementation(async (fn) => {
      (fn as (response: Response) => boolean)(mockedResponse);
      return mockedResponse;
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
    const lastUrl = urls.pop();
    mocked(mocks.page.url).mockImplementation(() => urls.shift() ?? lastUrl ?? '');
  };

  describe('start', () => {
    it('should launch puppeteer with given options', async () => {
      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
        puppeteerOpts: {
          defaultViewport: {
            height: 600,
            width: 800,
          },
        },
      });

      await api.start();

      expect(mocked(puppeteer.launch)).toBeCalledWith({
        defaultViewport: {
          height: 600,
          width: 800,
        },
      });
    });

    it('should use provided cookies', async () => {
      const cookies = [
        {
          name: 'session-id',
          value: '938-4859302-3482917',
          domain: '.amazon.com',
          path: '/',
          expires: 1641091354.410085,
          size: 29,
          httpOnly: false,
          sameSite: 'Strict',
          secure: true,
          session: false,
        } as Cookie,
      ];

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
        cookies,
      });

      await api.start();

      expect(mocked(mocks.page.setCookie)).toBeCalledWith(cookies[0]);
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
            width: 800,
          },
        },
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
        password: 'test123',
      });

      await api.getItems().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith(
        'input[name=email]',
        'testuser@example.com',
        { delay: 200 },
      );

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=password]', 'test123', {
        delay: 200,
      });

      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberMe]');
    });

    it('should accept a function for username and password', async () => {
      mockUrls('https://www.amazon.com/ap/signin');

      const api = new AmazonOrderReportsApi({
        username: async () => 'testuser@example.com',
        password: async () => 'test123',
      });

      await api.getItems().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith(
        'input[name=email]',
        'testuser@example.com',
        { delay: 200 },
      );

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=password]', 'test123', {
        delay: 200,
      });

      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberMe]');
    });

    it('should call saveCookiesFn with cookies if it is provided', async () => {
      const cookies = [
        {
          name: 'session-id-time',
          value: '2082787201l',
          domain: '.amazon.com',
          path: '/',
          expires: 1641091354.410037,
          size: 26,
          httpOnly: false,
          secure: false,
          session: false,
        } as Cookie,
      ];

      mockUrls('https://www.amazon.com/ap/signin');
      mocked(mocks.page.cookies).mockResolvedValue(cookies);

      const saveCookiesFn = jest.fn();

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
        saveCookiesFn,
      });

      await api.getItems().next();

      expect(saveCookiesFn).toHaveBeenCalledWith(cookies);
    });

    it('should throw error if OTP code is required, but no OTP option is provided', async () => {
      mockUrls('https://www.amazon.com/ap/signin', 'https://www.amazon.com/ap/mfa');

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
      });

      await expect(api.getItems().next()).rejects.toThrow(
        '2FA code requested, but neither otpSecret nor otpFn were provided',
      );
    });

    it('should login using generated OTP code if otpSecret is provided', async () => {
      mockUrls('https://www.amazon.com/ap/signin', 'https://www.amazon.com/ap/mfa');

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
        otpSecret: 'GVYX4RKDFYXXMNDJ',
      });

      await api.getItems().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=otpCode]', '930899', {
        delay: 200,
      });
      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberDevice]');
    });

    it('should login using OTP code provided by otpFn', async () => {
      mockUrls(
        'https://www.amazon.com/ap/signin',
        'https://www.amazon.com/ap/mfa/new-otp',
        'https://www.amazon.com/ap/mfa',
      );

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
        otpFn: async () => '123456',
      });

      await api.getItems().next();

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('input[name=otpCode]', '123456', {
        delay: 200,
      });
      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('input[name=rememberDevice]');
    });

    it('should skip account fix-up page during login', async () => {
      mockUrls('https://www.amazon.com/ap/signin', 'https://www.amazon.com/ap/accountfixup');

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
      });

      await api.getItems().next();

      expect(mocked(mocks.page.click)).toHaveBeenCalledWith('a[id*=skip]');
    });

    it('should throw error if sign-out assertion fails', async () => {
      mockUrls('https://www.amazon.com/ap/signin');
      mocked(mocks.page.$).mockResolvedValue(null);

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
      });

      await expect(api.getItems().next()).rejects.toThrow('No sign-out link detected');
    });

    it('should throw error on bad response', async () => {
      mockUrls('https://www.amazon.com/ap/signin');
      mocked(mocks.response.ok).mockReturnValue(false);

      const api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
      });

      await expect(api.getItems().next()).rejects.toThrow('Failed request');
    });
  });

  describe('getItems', () => {
    let api: AmazonOrderReportsApi;

    beforeEach(() => {
      api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
      });

      mocked(createReadStream).mockImplementation(() =>
        jest.requireActual('fs').createReadStream(appRootPath.resolve('test-data/items.csv')),
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
        downloadPath: '/tmp/amzscrKudNUt',
      });
    });

    it('should use provided dates to retrieve report', async () => {
      for await (const _ of api.getItems({
        startDate: new Date('2020-01-07T00:00:00.000Z'),
        endDate: new Date('2021-02-14T00:00:00.000Z'),
      })) {
      }

      expect(mocked(mocks.page.type)).toHaveBeenCalledWith(
        '#startDateCalendar input',
        '01/06/2020',
      );
      expect(mocked(mocks.page.type)).toHaveBeenCalledWith('#endDateCalendar input', '02/13/2021');
    });

    it('should delete report after retrieval', async () => {
      for await (const _ of api.getItems()) {
      }

      expect(mocked(mocks.page.click)).toHaveBeenCalledWith(
        `input[name="deleteReportElement"][id*="${reportId}"]`,
      );
    });

    it('should delete report on disk', async () => {
      const fakeElements = ([{ click: jest.fn() }] as unknown) as Array<ElementHandle<Element>>;
      mocked(mocks.page.$x).mockResolvedValue(fakeElements);

      for await (const _ of api.getItems()) {
      }

      expect(unlink).toBeCalledWith('/tmp/amzscrKudNUt/01-Dec-2020_to_31-Dec-2020.csv');
    });

    it('should handle reports with no data', async () => {
      mocked(createReadStream).mockImplementationOnce(() =>
        jest
          .requireActual('fs')
          .createReadStream(appRootPath.resolve('test-data/items-no-data.csv')),
      );

      const items: Array<OrderItem> = [];
      for await (const item of api.getItems()) {
        items.push(item);
      }

      expect(items).toHaveLength(0);
    });
  });

  describe('getRefunds', () => {
    let api: AmazonOrderReportsApi;

    beforeEach(() => {
      api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
      });

      mocked(createReadStream).mockImplementation(() =>
        jest.requireActual('fs').createReadStream(appRootPath.resolve('test-data/refunds.csv')),
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

  describe('getShipments', () => {
    let api: AmazonOrderReportsApi;

    beforeEach(() => {
      api = new AmazonOrderReportsApi({
        username: 'testuser@example.com',
        password: 'test123',
      });

      mocked(createReadStream).mockImplementation(() =>
        jest.requireActual('fs').createReadStream(appRootPath.resolve('test-data/shipments.csv')),
      );
    });

    it('should return shipment for each row in report', async () => {
      const shipments: Array<Shipment> = [];
      for await (const shipment of api.getShipments()) {
        shipments.push(shipment);
      }

      expect(shipments).toHaveLength(3);
      expect(shipments).toMatchSnapshot();
    });
  });
});
