import camelcase from 'camelcase';
import csv from 'csv-parse';
import { DateTime } from 'luxon';
import { createReadStream, watch } from 'fs';
import { mkdtemp, readdir, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { authenticator } from 'otplib';
import { join } from 'path';
import { Browser, LaunchOptions, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import queryString from 'query-string';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, Logger, LogLevel } from './logger';

const DEFAULT_BASE_URL = 'https://www.amazon.com';
const REPORTS_PATH = '/gp/b2b/reports';
const REPORT_PREFIX = 'amzscr-';
const DOWNLOAD_DIR_PREFIX = 'amzscr';

puppeteer.use(StealthPlugin());

export interface Options {
  baseUrl?: string;
  logLevel?: LogLevel;
  otpFn?: () => string | Promise<string>;
  otpSecret?: string;
  password: string;
  puppeteerOpts?: LaunchOptions;
  username: string;
}

export interface OrderItem {
  orderDate: Date;
  orderId: string;
  title: string;
  category: string;
  asinIsbn: string;
  unspscCode: string;
  website: string;
  releaseDate?: Date;
  condition: string;
  seller: string;
  sellerCredentials: string;
  listPricePerUnit: number;
  purchasePricePerUnit: number;
  quantity: number;
  paymentInstrumentType: string;
  purchaseOrderNumber?: string;
  poLineNumber?: string;
  orderingCustomerEmail: string;
  shipmentDate?: Date;
  shippingAddressName?: string;
  shippingAddressStreet1?: string;
  shippingAddressStreet2?: string;
  shippingAddressCity?: string;
  shippingAddressState?: string;
  shippingAddressZip?: string;
  orderStatus?: string;
  carrierNameTrackingNumber?: string;
  itemSubtotal: number;
  itemSubtotalTax: number;
  itemTotal: number;
  taxExemptionApplied: string;
  taxExemptionType: string;
  exemptionOptOut: string;
  buyerName: string;
  currency: string;
  groupName: string;
}

export interface GetItemsOptions {
  startDate: Date;
  endDate: Date;
}

enum ReportType {
  ITEMS = 'ITEMS',
  REFUNDS = 'REFUNDS'
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
  SUBMIT_INPUT = 'input[type=submit]'
}

enum Urls {
  ACCOUNT_FIXUP = 'ap/accountfixup',
  DOWNLOAD_REPORT = 'b2b/reports/download',
  MFA = 'ap/mfa',
  SIGN_IN = 'ap/signin'
}

const identity = <T>(x: T): T => x;
// Amazon apparently uses Pacific time for all US users
const parseDate = (d: string): Date =>
  DateTime.fromFormat(d, 'MM/dd/yy', { zone: 'America/Los_Angeles' }).toJSDate();
const parsePrice = (p: string) => parseFloat(p.replace(/[^\d.]/g, ''));

export default class AmazonScraper {
  #browser?: Browser;
  #logger: Logger;
  #options: Options;
  #page?: Page;

  constructor(options: Options) {
    this.#logger = createLogger(options.logLevel ?? LogLevel.NONE);
    this.#options = options;
  }

  async start(): Promise<void> {
    if (!this.#browser) {
      this.#browser = await puppeteer.launch(this.#options.puppeteerOpts ?? {});
    }

    if (!this.#page) {
      this.#page = await this.#browser.newPage();
    }
  }

  async stop(): Promise<void> {
    await this.#browser?.close();
  }

  async *getItems(
    options: GetItemsOptions = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date()
    }
  ): AsyncGenerator<OrderItem, void, undefined> {
    await this._navigate(REPORTS_PATH);

    const { startDate, endDate } = options;

    const reportName = await this._fillReportForm(ReportType.ITEMS, startDate, endDate);
    const reportPath = await this._downloadReport();

    await this._deleteReport(reportName);

    const csvStream = createReadStream(reportPath).pipe(
      csv({
        columns: (headers: Array<string>) =>
          headers.map((header) => camelcase(header.replace(/\W/g, ' ')))
      })
    );

    for await (const record of csvStream) {
      yield this._parseOrderItemRecord(record);
    }

    await unlink(reportPath);
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
      true
    );
  }

  private async _downloadReport(): Promise<string> {
    const page = await this._getPage();

    const downloadDir = await mkdtemp(join(tmpdir(), DOWNLOAD_DIR_PREFIX));

    this.#logger.debug(`Saving report to directory: ${downloadDir}`);

    const cdpSession = await page.target().createCDPSession();
    cdpSession.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir
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
      page.waitForResponse((r) => r.url().includes(Urls.DOWNLOAD_REPORT))
    ]);

    return downloadPath;
  }

  private async _fillReportForm(
    reportType: ReportType,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const page = await this._getPage();

    const reportName = `${REPORT_PREFIX}${uuidv4()}`;

    await page.select(Selectors.REPORT_TYPE_INPUT, reportType);

    const startDateTime = DateTime.fromJSDate(startDate);
    const endDateTime = DateTime.fromJSDate(endDate);

    await page.select(Selectors.REPORT_START_DAY_INPUT, `${startDateTime.day}`);
    await page.select(Selectors.REPORT_START_MONTH_INPUT, `${startDateTime.month}`);
    await page.select(Selectors.REPORT_START_YEAR_INPUT, `${startDateTime.year}`);
    await page.select(Selectors.REPORT_END_DAY_INPUT, `${endDateTime.day}`);
    await page.select(Selectors.REPORT_END_MONTH_INPUT, `${endDateTime.month}`);
    await page.select(Selectors.REPORT_END_YEAR_INPUT, `${endDateTime.year}`);

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

  private async _handleLogin(): Promise<void> {
    const { username, password } = this.#options;
    const page = await this._getPage();

    if (!page.url().includes(Urls.SIGN_IN)) {
      this.#logger.debug('No login required');
      return;
    }
    this.#logger.debug('Login required');

    this.#logger.debug('Entering username');
    await page.type(Selectors.EMAIL_INPUT, username);
    await this._navClick(Selectors.SUBMIT_INPUT);

    this.#logger.debug('Entering password');
    await page.type(Selectors.PASSWORD_INPUT, password);
    await page.click(Selectors.REMEMBER_ME_INPUT);
    await this._navClick(Selectors.SUBMIT_INPUT);

    // TODO: verify this works for all MFA methods
    if (page.url().includes(Urls.MFA)) {
      this.#logger.debug('Entering OTP code');
      await page.type(Selectors.OTP_INPUT, await this._getOtp());
      await page.click(Selectors.REMEMBER_DEVICE_INPUT);
      await this._navClick(Selectors.SUBMIT_INPUT);
    }

    if (page.url().includes(Urls.ACCOUNT_FIXUP)) {
      await this._navClick(Selectors.SKIP_ACCOUNT_FIXUP_LINK);
    }

    await this._assert(Selectors.SIGN_OUT_LINK, 'No sign-out link detected, failed to sign in?');
  }

  private async _navClick(selector: string, isXpath = false): Promise<void> {
    const page = await this._getPage();

    this.#logger.debug(`Clicking ${selector}`);
    if (isXpath) {
      const element = await page.$x(selector);
      if (element?.length > 0) {
        element[0].click();
      }
    } else {
      await Promise.all([page.click(selector), page.waitForNavigation()]);
    }
  }

  private async _navigate(
    path: string,
    queryParams: { [key: string]: string | number } = {}
  ): Promise<void> {
    const page = await this._getPage();

    const url = Object.assign(new URL(path, this.#options.baseUrl ?? DEFAULT_BASE_URL), {
      search: queryString.stringify(queryParams)
    }).toString();

    this.#logger.debug(`Navigating to ${url}`);
    const response = await page.goto(url);
    if (!response?.ok()) {
      throw new Error(`Failed request while loading ${path}`);
    }

    await this._handleLogin();
  }

  private _parseOrderItemRecord(record: { [key: string]: string }): OrderItem {
    return (Object.fromEntries(
      Object.entries(record)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => {
          const transformFn =
            ({
              orderDate: parseDate,
              releaseDate: parseDate,
              shipmentDate: parseDate,
              listPricePerUnit: parsePrice,
              purchasePricePerUnit: parsePrice,
              quantity: parseInt,
              itemSubtotal: parsePrice,
              itemSubtotalTax: parsePrice,
              itemTotal: parsePrice
            } as { [columnValue: string]: (value: unknown) => unknown })[key] ?? identity;

          return [key, transformFn(value)];
        })
    ) as unknown) as OrderItem;
  }
}

export { LogLevel } from './logger';
