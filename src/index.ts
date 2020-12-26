import { authenticator } from 'otplib';
import puppeteer from 'puppeteer';
import { URL } from 'url';

const DEFAULT_BASE_URL = 'https://www.amazon.com';
const ORDER_ID_PATTERN = '\\d{3}-\\d{7}-\\d{7}';

export interface Order {
  id: string;
}

export interface Options {
  baseUrl?: string;
  otpFn?: () => string | Promise<string>;
  otpSecret?: string;
  password: string;
  puppeteerOpts?: puppeteer.LaunchOptions;
  username: string;
}

export default class AmazonScraper {
  #options: Options;

  #browser?: puppeteer.Browser;
  #page?: puppeteer.Page;

  constructor(options: Options) {
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

  async close(): Promise<void> {
    await this.#browser?.close();
  }

  async getOrders(): Promise<Array<Order>> {
    await this._navigate('/gp/your-account/order-history');

    const page = await this._getPage();

    return await page.$$eval(
      'a[href*="/order-details/"]',
      (els, orderIdPattern): Array<Order> =>
        els.map((el) => {
          const href = el.getAttribute('href') ?? '';

          const match = href.match(new RegExp(orderIdPattern));
          if (!match) {
            throw new Error(`Failed to parse order ID in URL: ${href}`);
          }

          const [id] = match;

          return { id };
        }),
      ORDER_ID_PATTERN
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

  private async _getPage(): Promise<puppeteer.Page> {
    await this.start();

    if (!this.#page) {
      throw new Error('Failed to load page');
    }

    return this.#page;
  }

  private async _handleLogin(): Promise<void> {
    const { username, password } = this.#options;
    const page = await this._getPage();

    if (!page.url().includes('ap/signin')) {
      console.log('No login required');
      return;
    }

    await page.type('input[type=email]', username);
    await this._navClick('input[type=submit]');

    await page.type('input[type=password]', password);
    await this._navClick('input[type=submit]');

    // TODO: verify this works for all MFA methods
    if (page.url().includes('ap/mfa')) {
      await page.type('input[type=tel]', await this._getOtp());
      await this._navClick('input[type=submit]');
    }

    if (page.url().includes('ap/accountfixup')) {
      await this._navClick('a[id*=skip]');
    }

    await this._assert('a[href*=sign-out]', 'No sign-out link detected, failed to sign in?');
  }

  private async _navClick(selector: string): Promise<void> {
    const page = await this._getPage();

    await Promise.all([page.click(selector), page.waitForNavigation()]);
  }

  private async _navigate(path: string): Promise<void> {
    const page = await this._getPage();

    await page.goto(new URL(path, this.#options.baseUrl ?? DEFAULT_BASE_URL).toString());

    await this._handleLogin();
  }
}
