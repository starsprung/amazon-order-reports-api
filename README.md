# amazon-order-reports-api

Scrapes orders and refunds from Amazon.com.

There's no offical API to retrieve these, so this library uses [Puppeteer](https://github.com/puppeteer/puppeteer/) internally to access them. As this isn't an officially supported API, it may break at any time. Puppeteer comes with some other caveats, notably when running in Docker. See [Puppeteer's troubleshooting section](https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md) if you run into issues.

This library has only been tested on Amazon.com with the language set to English. It's unknown if it will work in other regions/languages.

## Installation

```
npm i amazon-order-reports-api
```

## Usage

```
import { AmazonOrderReportsApi } from 'amazon-order-reports-api';

(async () => {
  const api = new AmazonOrderReportsApi({
    username: 'test@example.com',
    password: 'password1234',
    // Or use otpFn
    otpSecret: 'USJF YSN7 87YR PP4D AN78 FAAF 81D8 1PU9 JJRF QP87 9UDM IO3W SJRY'
  });

  for await (const item of api.getItems({
    startDate: new Date('2020-10-01'),
    endDate: new Date('2020-12-31')
  })) {
    console.log(item);
  }

  for await (const refund of api.getRefunds({
    startDate: new Date('2020-10-01'),
    endDate: new Date('2020-12-31')
  })) {
    console.log(refund);
  }

  await api.stop();
})();
```

## API

API docs are available on the [docs site](https://docs.starsprung.com/amazon-order-reports-api/)

## Email notifications

As a side effect of generating an order report, Amazon will send an email notification that the order report is ready. This can generate a large volume of emails if reports are retrieved frequently. In many mail providers, an e-mail filter can be used to delete or move these emails. E.g. in Gmail:

```
from:(no-reply@amazon.com) subject:(Your order history report)
```
