/**
 * Custom error classes for better error handling
 */

export class UnauthorizedError extends Error {
    statusCode = 403;

    constructor(message: string) {
        super(message);
        this.name = "UnauthorizedError";
    }
}

export class NotFoundError extends Error {
    statusCode = 404;

    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}

export class BadRequestError extends Error {
    statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = "BadRequestError";
    }
}
