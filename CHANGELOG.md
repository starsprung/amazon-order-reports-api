## [3.3.4](https://github.com/starsprung/amazon-order-reports-api/compare/v3.3.3...v3.3.4) (2022-08-07)


### Bug Fixes

* update selectors for new reports site ([#22](https://github.com/starsprung/amazon-order-reports-api/issues/22)) ([04843bf](https://github.com/starsprung/amazon-order-reports-api/commit/04843bfb7b325438613a90c8fa2edfdd70f76298))

## [3.3.3](https://github.com/starsprung/amazon-order-reports-api/compare/v3.3.2...v3.3.3) (2021-01-05)


### Bug Fixes

* always attempt to delete report in Amazon ([#17](https://github.com/starsprung/amazon-order-reports-api/issues/17)) ([3c209c2](https://github.com/starsprung/amazon-order-reports-api/commit/3c209c25318e66cb1d418ea80bdaafbf0df32639))

## [3.3.2](https://github.com/starsprung/amazon-order-reports-api/compare/v3.3.1...v3.3.2) (2021-01-05)


### Bug Fixes

* handle empty reports ([5d1a5e0](https://github.com/starsprung/amazon-order-reports-api/commit/5d1a5e04c0e7071ca1cf37e2526cf85d383f24da))

## [3.3.1](https://github.com/starsprung/amazon-order-reports-api/compare/v3.3.0...v3.3.1) (2021-01-04)


### Bug Fixes

* fix incorrect types on Shipment ([ccaf751](https://github.com/starsprung/amazon-order-reports-api/commit/ccaf751044e5fe1b0cd9be6925d2d0f8b6c56153))

# [3.3.0](https://github.com/starsprung/amazon-order-reports-api/compare/v3.2.1...v3.3.0) (2021-01-04)


### Features

* add getShipments ([122a4ce](https://github.com/starsprung/amazon-order-reports-api/commit/122a4ce45d25e7496df778afd3e84a1058024273))

## [3.2.1](https://github.com/starsprung/amazon-order-reports-api/compare/v3.2.0...v3.2.1) (2021-01-02)


### Bug Fixes

* request username and password before starting login ([54a5478](https://github.com/starsprung/amazon-order-reports-api/commit/54a5478d3a4589b1d55549ec4e07d71f0a6c8d6e))

# [3.2.0](https://github.com/starsprung/amazon-order-reports-api/compare/v3.1.0...v3.2.0) (2021-01-02)


### Features

* allow provider functions for username and password ([1db0f3a](https://github.com/starsprung/amazon-order-reports-api/commit/1db0f3a6f5303366d3b064f52d5ce26e618604c3))

# [3.1.0](https://github.com/starsprung/amazon-order-reports-api/compare/v3.0.1...v3.1.0) (2021-01-02)


### Features

* add support for saving/loading cookies ([bea79b1](https://github.com/starsprung/amazon-order-reports-api/commit/bea79b152601ed6b7e90c3d0023f614ba827ca0f))

## [3.0.1](https://github.com/starsprung/amazon-order-reports-api/compare/v3.0.0...v3.0.1) (2021-01-01)


### Bug Fixes

* handle OTP method selection screen ([e702f7d](https://github.com/starsprung/amazon-order-reports-api/commit/e702f7d9fd966601c0271c672baf7f4232f29a01))

# [3.0.0](https://github.com/starsprung/amazon-order-reports-api/compare/v2.0.1...v3.0.0) (2021-01-01)


### Code Refactoring

* more consistent naming ([b467cc8](https://github.com/starsprung/amazon-order-reports-api/commit/b467cc8e4631621d75d4a64107d5c958f98baa8b))


### BREAKING CHANGES

* renamed AmazonOrderApi tp AmazonOrderReportsApi

## [2.0.1](https://github.com/starsprung/amazon-order-reports-api/compare/v2.0.0...v2.0.1) (2021-01-01)

### Bug Fixes

- fix dependencies ([1d3eedc](https://github.com/starsprung/amazon-order-reports-api/commit/1d3eedc6e5677da0243fc8caa75c7ee7dd2bb176))

# [2.0.0](https://github.com/starsprung/amazon-order-reports-api/compare/v1.1.0...v2.0.0) (2021-01-01)

### Code Refactoring

- move default export to named export ([ae53320](https://github.com/starsprung/amazon-order-reports-api/commit/ae53320a7cf3adb96973ad4e3b9edfed0742b5b4))

### BREAKING CHANGES

- default export moved to AmazonOrderReportsApi

# [1.1.0](https://github.com/starsprung/amazon-order-reports-api/compare/v1.0.0...v1.1.0) (2021-01-01)

### Features

- add getRefunds ([8f7fe60](https://github.com/starsprung/amazon-order-reports-api/commit/8f7fe60c71a5ab2fe5caf2d27f7fee003a68cc95))

# 1.0.0 (2021-01-01)

### Features

- get rid of getOrders, add getItems based on CSV reports ([#2](https://github.com/starsprung/amazon-order-reports-api/issues/2)) ([2c26151](https://github.com/starsprung/amazon-order-reports-api/commit/2c2615109682e916844836ad5a208c6889868e2e))
- return order summary from getOrders() ([374deb3](https://github.com/starsprung/amazon-order-reports-api/commit/374deb31698a97f42080cf843ef523be402efae4))
- support multiple pages of orders ([acabd81](https://github.com/starsprung/amazon-order-reports-api/commit/acabd81badb0adb549a8fedf88433cdf1cb4c698))

### BREAKING CHANGES

- getOrders removed
