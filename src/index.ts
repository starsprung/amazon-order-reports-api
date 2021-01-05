import camelcase from 'camelcase';
import csv from 'csv-parse';
import { createReadStream, watch } from 'fs';
import { mkdtemp, readdir, unlink } from 'fs/promises';
import { DateTime } from 'luxon';
import { tmpdir } from 'os';
import { authenticator } from 'otplib';
import { join } from 'path';
import { Browser, Cookie, LaunchOptions, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import queryString from 'query-string';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, Logger, LogLevel } from './logger';
import delay from 'delay';

const DEFAULT_BASE_URL = 'https://www.amazon.com';
const REPORTS_PATH = '/gp/b2b/reports';
const REPORT_PREFIX = 'amzscr-';
const DOWNLOAD_DIR_PREFIX = 'amzscr';

// Logging in too quickly can trigger a captcha
const LOGIN_STEP_DELAY = 1000;
const LOGIN_TYPING_DELAY = 200;

puppeteer.use(StealthPlugin());

interface ReportItem {
  buyerName: string;
  groupName: string;
  orderDate: Date;
  orderId: string;
  purchaseOrderNumber?: string;
  website: string;
}

interface LineItem extends ReportItem {
  asinIsbn: string;
  category: string;
  quantity: number;
  seller: string;
  sellerCredentials: string;
  taxExemptionApplied: string;
  title: string;
}

export interface OrderItem extends LineItem {
  asinIsbn: string;
  carrierNameTrackingNumber?: string;
  category: string;
  condition: string;
  currency: string;
  exemptionOptOut: string;
  itemSubtotal: number;
  itemSubtotalTax: number;
  itemTotal: number;
  listPricePerUnit: number;
  orderStatus?: string;
  orderingCustomerEmail: string;
  paymentInstrumentType: string;
  poLineNumber?: string;
  purchasePricePerUnit: number;
  quantity: number;
  releaseDate?: Date;
  seller: string;
  sellerCredentials: string;
  shipmentDate?: Date;
  shippingAddressCity?: string;
  shippingAddressName?: string;
  shippingAddressState?: string;
  shippingAddressStreet1?: string;
  shippingAddressStreet2?: string;
  shippingAddressZip?: string;
  taxExemptionApplied: string;
  taxExemptionType: string;
  title: string;
  unspscCode: string;
}

export interface Refund extends LineItem {
  asinIsbn: string;
  category: string;
  quantity: number;
  refundAmount: number;
  refundCondition: string;
  refundDate: Date;
  refundReason: string;
  refundTaxAmount: number;
  seller: string;
  sellerCredentials: string;
  taxExemptionApplied: string;
  title: string;
}

export interface Shipment extends ReportItem {
  carrierNameTrackingNumber: string;
  orderStatus: string;
  orderingCustomerEmail: string;
  paymentInstrumentType: string;
  shipmentDate: Date;
  shippingAddressCity?: string;
  shippingAddressName?: string;
  shippingAddressState?: string;
  shippingAddressStreet1?: string;
  shippingAddressStreet2?: string;
  shippingAddressZip?: string;
  shippingCharge: number;
  subtotal: number;
  taxBeforePromotions: number;
  taxCharged: number;
  totalCharged: number;
  totalPromotions: number;
}

enum ReportType {
  ITEMS = 'ITEMS',
  REFUNDS = 'REFUNDS',
  SHIPMENTS = 'SHIPMENTS',
}

enum Selectors {
  DELETE_REPORT = '@name="delete-report"',
  EMAIL_INPUT = 'input[name=email]',
  OTP_INPUT = 'input[name=otpCode]',
  PASSWORD_INPUT = 'input[name=password]',
  REMEMBER_DEVICE_INPUT = 'input[name=rememberDevice]',
  REMEMBER_ME_INPUT = 'input[name=rememberMe]',
  REPORT_CONFIRM_LINK = '#report-confirm',
  REPORT_END_DAY_INPUT = '#report-day-end',
  REPORT_END_MONTH_INPUT = '#report-month-end',
  REPORT_END_YEAR_INPUT = '#report-year-end',
  REPORT_NAME_INPUT = '#report-name',
  REPORT_START_DAY_INPUT = '#report-day-start',
  REPORT_START_MONTH_INPUT = '#report-month-start',
  REPORT_START_YEAR_INPUT = '#report-year-start',
  REPORT_TYPE_INPUT = '#report-type',
  SIGN_OUT_LINK = 'a[href*=sign-out]',
  SKIP_ACCOUNT_FIXUP_LINK = 'a[id*=skip]',
  SUBMIT_INPUT = 'input[type=submit]',
}

enum Urls {
  ACCOUNT_FIXUP = 'ap/accountfixup',
  DOWNLOAD_REPORT = 'b2b/reports/download',
  MFA = 'ap/mfa',
  NEW_MFA = 'ap/mfa/new-otp',
  SIGN_IN = 'ap/signin',
}

type AmazonOrderReportsApiOptions = ConstructorParameters<typeof AmazonOrderReportsApi>[0];

interface GetReportReturnType {
  [ReportType.ITEMS]: OrderItem;
  [ReportType.REFUNDS]: Refund;
  [ReportType.SHIPMENTS]: Shipment;
}

const identity = <T>(x: T): T => x;
// Amazon apparently uses Pacific time for all US users ?
const parseDate = (d: string): Date =>
  DateTime.fromFormat(d, 'MM/dd/yy', { zone: 'America/Los_Angeles' }).toJSDate();
const parsePrice = (p: string) => parseFloat(p.replace(/[^\d.]/g, ''));

export class AmazonOrderReportsApi {
  #browser?: Browser;
  #logger: Logger;
  #options: AmazonOrderReportsApiOptions;
  #page?: Page;

  constructor(options: {
    /**
     * Base URL to use for Amazon.
     * @default https://www.amazon.com
     */
    baseUrl?: string;

    /**
     * Cookies from a previous run. These can be acquired using **saveCookiesFn** to avoid
     * unnecessary repeated authentications.
     */
    cookies?: Array<Cookie>;

    /**
     * Emit log messages at this level. Currently only {@link LogLevel.DEBUG} is used.
     * @default {@link LogLevel.NONE}
     */
    logLevel?: LogLevel;

    /**
     * If provided, otpFn will be called during login if a OTP code is required.
     * This option will be ignored if **otpSecret** is provided.
     */
    otpFn?: () => string | Promise<string>;

    /**
     * If provided, otpSecret will be used to generate an OTP code during login.
     * This is the code you get during the Authenticator App setup on the 2SV Settings page.
     * Care should be taken to store this securely. An insecurely stored OTP secret is the same
     * as not having OTP at all.
     */
    otpSecret?: string;

    /**
     * Amazon account password. This may be a string or a provider function.
     */
    password: string | (() => string | Promise<string>);

    /**
     * Puppeteer launch options.
     * See the [Puppeteer docs]{@link https://pptr.dev/#?product=Puppeteer&version=v5.5.0&show=api-puppeteerlaunchoptions}
     * for more info.
     */
    puppeteerOpts?: LaunchOptions;

    /**
     * If provided, this function will be called with Puppeteer's cookies after login
     * which can be provided to **cookies** when creating a new instance of AmazonOrderReportsApi.
     */
    saveCookiesFn?: (cookies: Array<Cookie>) => void | Promise<void>;

    /**
     * Amazon account username. This may be a string or a provider function.
     */
    username: string | (() => string | Promise<string>);
  }) {
    this.#logger = createLogger(options.logLevel ?? LogLevel.NONE);
    this.#options = options;
  }

  /**
   * Start the internal Puppeteer isntance. This will be called automatically by
   * {@link getItems}, {@link getRefunds} and {@link getShipments}, but you may also call it manually.
   */
  async start(): Promise<void> {
    if (!this.#browser) {
      this.#browser = await puppeteer.launch(this.#options.puppeteerOpts ?? {});
    }

    if (!this.#page) {
      this.#page = await this.#browser.newPage();

      if (this.#options.cookies) {
        this.#logger.debug('Using provided cookies');
        await this.#page.setCookie(...this.#options.cookies);
      }
    }
  }

  /**
   * Stop the internal Puppeteer instance.
   */
  async stop(): Promise<void> {
    await this.#browser?.close();
    this.#page = undefined;
    this.#browser = undefined;
  }

  /**
   * Retrieve ordered items in the given date range. If no date range is given, the previous
   * 30 days will be used.
   */
  async *getItems(
    options: {
      /** Start of date range to report. */
      startDate: Date;
      /** End of date range to report. */
      endDate: Date;
    } = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    },
  ): AsyncGenerator<OrderItem> {
    yield* this._getReport(ReportType.ITEMS, options, AmazonOrderReportsApi._parseOrderItemRecord);
  }

  /**
   * Retrieve refunds in the given date range. If no date range is given, the previous
   * 30 days will be used.
   */
  async *getRefunds(
    options: {
      /** Start of date range to report. */
      startDate: Date;
      /** End of date range to report. */
      endDate: Date;
    } = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    },
  ): AsyncGenerator<Refund> {
    yield* this._getReport(ReportType.REFUNDS, options, AmazonOrderReportsApi._parseRefundRecord);
  }

  /**
   * Retrieve shipments in the given date range. If no date range is given, the previous
   * 30 days will be used.
   */
  async *getShipments(
    options: {
      /** Start of date range to report. */
      startDate: Date;
      /** End of date range to report. */
      endDate: Date;
    } = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    },
  ): AsyncGenerator<Shipment> {
    yield* this._getReport(
      ReportType.SHIPMENTS,
      options,
      AmazonOrderReportsApi._parseShipmentRecord,
    );
  }

  private static _parseOrderItemRecord(record: { [key: string]: string }): OrderItem {
    return (Object.fromEntries(
      Object.entries(record)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => {
          const transformFn =
            ({
              itemSubtotal: parsePrice,
              itemSubtotalTax: parsePrice,
              itemTotal: parsePrice,
              listPricePerUnit: parsePrice,
              orderDate: parseDate,
              purchasePricePerUnit: parsePrice,
              quantity: parseInt,
              releaseDate: parseDate,
              shipmentDate: parseDate,
            } as { [columnValue: string]: (value: unknown) => unknown })[key] ?? identity;

          return [key, transformFn(value)];
        }),
    ) as unknown) as OrderItem;
  }

  private static _parseRefundRecord(record: { [key: string]: string }): Refund {
    return (Object.fromEntries(
      Object.entries(record)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => {
          const transformFn =
            ({
              orderDate: parseDate,
              quantity: parseInt,
              refundAmount: parsePrice,
              refundDate: parseDate,
              refundTaxAmount: parsePrice,
            } as { [columnValue: string]: (value: unknown) => unknown })[key] ?? identity;

          return [key, transformFn(value)];
        }),
    ) as unknown) as Refund;
  }

  private static _parseShipmentRecord(record: { [key: string]: string }): Shipment {
    return (Object.fromEntries(
      Object.entries(record)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => {
          const transformFn =
            ({
              orderDate: parseDate,
              shipmentDate: parseDate,
              subtotal: parsePrice,
              shippingCharge: parsePrice,
              taxBeforePromotions: parsePrice,
              totalPromotions: parsePrice,
              taxCharged: parsePrice,
              totalCharged: parsePrice,
            } as { [columnValue: string]: (value: unknown) => unknown })[key] ?? identity;

          return [key, transformFn(value)];
        }),
    ) as unknown) as Shipment;
  }

  private async _assert(selector: string, message?: string): Promise<void> {
    const page = await this._getPage();

    if (!(await page.$(selector))) {
      throw new Error(message ?? `Assertion failed! No element matching selector: ${selector}`);
    }
  }

  private async _deleteReport(reportName: string): Promise<void> {
    await this._navClick(
      `//input[${Selectors.DELETE_REPORT} and ancestor::tr[contains(., '${reportName}')]]`,
      true,
    );
  }

  private async _downloadReport(): Promise<string> {
    const page = await this._getPage();

    const downloadDir = await mkdtemp(join(tmpdir(), DOWNLOAD_DIR_PREFIX));

    this.#logger.debug(`Saving report to directory: ${downloadDir}`);

    const cdpSession = await page.target().createCDPSession();
    cdpSession.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });

    const [downloadPath] = await Promise.all([
      new Promise<string>((resolve) => {
        const watcher = watch(downloadDir, async () => {
          const files = await readdir(downloadDir);
          const csvFile = files.find((file) => file.endsWith('.csv'));
          if (csvFile) {
            watcher.close();
            resolve(join(downloadDir, csvFile));
          }
        });
      }),
      page.click(Selectors.REPORT_CONFIRM_LINK),
      page.waitForResponse((r) => r.url().includes(Urls.DOWNLOAD_REPORT)),
    ]);

    return downloadPath;
  }

  private async _fillReportForm(
    reportType: ReportType,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const page = await this._getPage();

    const reportName = `${REPORT_PREFIX}${uuidv4()}`;

    await page.select(Selectors.REPORT_TYPE_INPUT, reportType);

    const startDateTime = DateTime.fromJSDate(startDate).setZone('America/Los_Angeles');
    const endDateTime = DateTime.fromJSDate(endDate).setZone('America/Los_Angeles');

    await page.select(Selectors.REPORT_START_DAY_INPUT, `${startDateTime.toFormat('d')}`);
    await page.select(Selectors.REPORT_START_MONTH_INPUT, `${startDateTime.toFormat('M')}`);
    await page.select(Selectors.REPORT_START_YEAR_INPUT, `${startDateTime.toFormat('yyyy')}`);
    await page.select(Selectors.REPORT_END_DAY_INPUT, `${endDateTime.toFormat('d')}`);
    await page.select(Selectors.REPORT_END_MONTH_INPUT, `${endDateTime.toFormat('M')}`);
    await page.select(Selectors.REPORT_END_YEAR_INPUT, `${endDateTime.toFormat('yyyy')}`);

    await page.type(Selectors.REPORT_NAME_INPUT, reportName);

    return reportName;
  }

  private async _getOtp(): Promise<string> {
    const { otpSecret, otpFn } = this.#options;

    if (otpSecret) {
      return authenticator.generate(otpSecret.replace(/ /g, ''));
    }

    if (otpFn) {
      return await otpFn();
    }

    throw new Error('2FA code requested, but neither otpSecret nor otpFn were provided');
  }

  private async _getPage(): Promise<Page> {
    await this.start();

    if (!this.#page) {
      throw new Error('Failed to load page');
    }

    return this.#page;
  }

  private async *_getReport<T extends ReportType>(
    reportType: T,
    options: {
      startDate: Date;
      endDate: Date;
    } = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    },
    parseFn: (record: { [key: string]: string }) => GetReportReturnType[T],
  ): AsyncGenerator<GetReportReturnType[T]> {
    await this._navigate(REPORTS_PATH);

    const { startDate, endDate } = options;

    const reportName = await this._fillReportForm(reportType, startDate, endDate);
    const reportPath = await this._downloadReport();

    try {
      const csvStream = createReadStream(reportPath).pipe(
        csv({
          columns: (headers: Array<string>) =>
            headers.map((header) => camelcase(header.replace(/\W/g, ' '))),
        }),
      );

      for await (const record of csvStream) {
        yield parseFn(record);
      }
    } catch (err) {
      if (
        err.code === 'CSV_RECORD_DONT_MATCH_COLUMNS_LENGTH' &&
        err.record?.[0] === 'No data found for this time period'
      ) {
        return;
      }

      throw err;
    } finally {
      try {
        await this._deleteReport(reportName);
      } catch {}

      try {
        await unlink(reportPath);
      } catch {}
    }
  }

  private async _handleLogin(): Promise<void> {
    const { username, password } = this.#options;

    const usernameProvider = typeof username === 'string' ? () => username : username;
    const passwordProvider = typeof password === 'string' ? () => password : password;

    const page = await this._getPage();

    if (!page.url().includes(Urls.SIGN_IN)) {
      this.#logger.debug('No login required');
      return;
    }
    this.#logger.debug('Login required');

    const providedUsername = await usernameProvider();
    const providedPassword = await passwordProvider();

    this.#logger.debug('Entering username');
    await page.type(Selectors.EMAIL_INPUT, providedUsername, { delay: LOGIN_TYPING_DELAY });
    await this._navClick(Selectors.SUBMIT_INPUT);

    await delay(LOGIN_STEP_DELAY);

    this.#logger.debug('Entering password');
    await page.type(Selectors.PASSWORD_INPUT, providedPassword, { delay: LOGIN_TYPING_DELAY });
    await page.click(Selectors.REMEMBER_ME_INPUT);
    await this._navClick(Selectors.SUBMIT_INPUT);

    await delay(LOGIN_STEP_DELAY);

    if (page.url().includes(Urls.NEW_MFA)) {
      this.#logger.debug('Using default MFA method');
      await this._navClick(Selectors.SUBMIT_INPUT);
      await delay(LOGIN_STEP_DELAY);
    }

    // TODO: verify this works for all MFA methods
    if (page.url().includes(Urls.MFA)) {
      this.#logger.debug('Entering OTP code');
      await page.type(Selectors.OTP_INPUT, await this._getOtp(), { delay: LOGIN_TYPING_DELAY });
      await page.click(Selectors.REMEMBER_DEVICE_INPUT);
      await this._navClick(Selectors.SUBMIT_INPUT);
    }

    if (page.url().includes(Urls.ACCOUNT_FIXUP)) {
      await this._navClick(Selectors.SKIP_ACCOUNT_FIXUP_LINK);
    }

    await this._assert(Selectors.SIGN_OUT_LINK, 'No sign-out link detected, failed to sign in?');

    if (this.#options.saveCookiesFn) {
      this.#logger.debug('Calling saveCookiesFn with cookies');
      this.#options.saveCookiesFn(await page.cookies());
    }
  }

  private async _navClick(selector: string, isXpath = false): Promise<void> {
    const page = await this._getPage();

    this.#logger.debug(`Clicking ${selector}`);
    if (isXpath) {
      const element = await page.$x(selector);
      if (element?.length > 0) {
        await element[0].click();
      }
    } else {
      await Promise.all([page.click(selector), page.waitForNavigation()]);
    }
  }

  private async _navigate(
    path: string,
    queryParams: { [key: string]: string | number } = {},
  ): Promise<void> {
    const page = await this._getPage();

    const url = Object.assign(new URL(path, this.#options.baseUrl ?? DEFAULT_BASE_URL), {
      search: queryString.stringify(queryParams),
    }).toString();

    this.#logger.debug(`Navigating to ${url}`);
    const response = await page.goto(url);
    if (!response?.ok()) {
      throw new Error(`Failed request while loading ${path}`);
    }

    await this._handleLogin();
  }
}

export { LogLevel } from './logger';
export { Cookie } from 'puppeteer';
