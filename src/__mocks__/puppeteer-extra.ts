import { Browser, CDPSession, Page, Response, Target } from 'puppeteer';

const response = ({
  ok: jest.fn()
} as unknown) as Response;

const cdpSession = ({
  send: jest.fn()
} as unknown) as CDPSession;

const target = ({ createCDPSession: jest.fn() } as unknown) as Target;

const page = ({
  $: jest.fn(),
  $x: jest.fn(),
  $$eval: jest.fn(),
  click: jest.fn(),
  goto: jest.fn(),
  select: jest.fn(),
  target: jest.fn(),
  type: jest.fn(),
  url: jest.fn(),
  waitForNavigation: jest.fn(),
  waitForResponse: jest.fn()
} as unknown) as Page;

const browser = ({
  close: jest.fn(),
  newPage: jest.fn()
} as unknown) as Browser;

export const mocks = {
  browser,
  cdpSession,
  page,
  response,
  target
};

export default {
  launch: jest.fn(),
  use: jest.fn()
};
