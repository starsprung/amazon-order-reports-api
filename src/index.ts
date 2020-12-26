import { authenticator } from 'otplib';
import { Browser, LaunchOptions, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { URL } from 'url';
import { createLogger, Logger, LogLevel } from './logger';

const DEFAULT_BASE_URL = 'https://www.amazon.com';
const ORDER_ID_PATTERN = '\\d{3}-\\d{7}-\\d{7}';
const ORDER_HISTORY_PATH = '/gp/your-account/order-history';

puppeteer.use(StealthPlugin());

export interface Order {
  date: string;
  id: string;
  shipTo?: string;
  total: string;
}

export interface Options {
  baseUrl?: string;
  logLevel?: LogLevel;
  otpFn?: () => string | Promise<string>;
  otpSecret?: string;
  password: string;
  puppeteerOpts?: LaunchOptions;
  username: string;
}

enum Selectors {
  EMAIL_INPUT = 'input[name=email]',
  ORDER_INFO_CLASS = '.order-info',
  OTP_INPUT = 'input[name=otpCode]',
  PASSWORD_INPUT = 'input[name=password]',
  REMEMBER_DEVICE_INPUT = 'input[name=rememberDevice]',
  REMEMBER_ME_INPUT = 'input[name=rememberMe]',
  SIGN_OUT_LINK = 'a[href*=sign-out]',
  SKIP_ACCOUNT_FIXUP_LINK = 'a[id*=skip]',
  SUBMIT_INPUT = 'input[type=submit]',
  VALUE_CLASS = '.value'
}

enum Urls {
  ACCOUNT_FIXUP = 'ap/accountfixup',
  MFA = 'ap/mfa',
  SIGN_IN = 'ap/signin'
}

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

  // TODO: parameters for time period, limits (num, time)
  async getOrders(): Promise<Array<Order>> {
    await this._navigate(ORDER_HISTORY_PATH);

    const page = await this._getPage();

    return await page.$$eval(
      Selectors.ORDER_INFO_CLASS,
      (orderInfos: Array<Element>, orderIdPattern, valueClass): Array<Order> =>
        orderInfos.map((el) => {
          const valueNodeList = el.querySelectorAll(valueClass);
          if ((valueNodeList?.length ?? 0) < 3) {
            throw new Error('Order info has fewer values than expected');
          }

          const values = Array.from(valueNodeList).map((value) => value.textContent?.trim() ?? '');

          const [date, total, shipTo] = values;
          const potentialOrderId = values.slice(-1)[0];
          const match = potentialOrderId.match(new RegExp(orderIdPattern));
          if (!match) {
            throw new Error(`Failed to parse order ID from value: ${potentialOrderId}`);
          }

          const [id] = match;

          const order: Order = { id, date, total };
          if (values.length >= 4) {
            order.shipTo = shipTo;
          }

          return order;
        }),
      ORDER_ID_PATTERN,
      Selectors.VALUE_CLASS
    );
  }

  private async _assert(selector: string, message?: string): Promise<void> {
    const page = await this._getPage();

    if (!(await page.$(selector))) {
      throw new Error(message ?? `Assertion failed! No element matching selector: ${selector}`);
    }
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

  private async _navClick(selector: string): Promise<void> {
    const page = await this._getPage();

    this.#logger.debug(`Clicking ${selector}`);
    await Promise.all([page.click(selector), page.waitForNavigation()]);
  }

  private async _navigate(path: string): Promise<void> {
    const page = await this._getPage();

    const url = new URL(path, this.#options.baseUrl ?? DEFAULT_BASE_URL).toString();
    this.#logger.debug(`Navigating to ${url}`);
    const response = await page.goto(
      new URL(path, this.#options.baseUrl ?? DEFAULT_BASE_URL).toString()
    );
    if (!response?.ok()) {
      throw new Error(`Failed request while loading ${path}`);
    }

    await this._handleLogin();
  }
}

export { LogLevel } from './logger';
