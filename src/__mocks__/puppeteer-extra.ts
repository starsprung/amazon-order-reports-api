import { Browser, Page, Response } from 'puppeteer';

const response = ({
  ok: jest.fn()
} as unknown) as Response;

const page = ({
  $: jest.fn(),
  $$eval: jest.fn(),
  click: jest.fn(),
  goto: jest.fn(),
  type: jest.fn(),
  url: jest.fn(),
  waitForNavigation: jest.fn()
} as unknown) as Page;

const browser = ({
  close: jest.fn(),
  newPage: jest.fn()
} as unknown) as Browser;

export const mocks = {
  browser,
  page,
  response
};

export default {
  launch: jest.fn(),
  use: jest.fn()
};
