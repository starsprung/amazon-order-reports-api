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
import { AmazonOrderApi } from 'amazon-order-reports-api';

(async () => {
  const api = new AmazonOrderApi({
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

## License

Copyright 2020 Shaun Starsprung

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
