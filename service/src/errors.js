// Small HTTP error type for the C4 service. The router (router.js) maps a
// status property to a JSON response body.

export class HttpError extends Error {
    constructor(status, error, extra = {}) {
        super(extra.errorMsg || error);
        this.status = status;
        this.error = error;
        this.extra = extra;
    }
}

export const httpError = (status, error, extra) => new HttpError(status, error, extra);
