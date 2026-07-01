const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const asyncLocalStorage = new AsyncLocalStorage();

const requestIdMiddleware = (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-ID', requestId);
    asyncLocalStorage.run({ requestId }, () => {
        next();
    });
};

module.exports = {
    requestIdMiddleware,
    asyncLocalStorage
};
