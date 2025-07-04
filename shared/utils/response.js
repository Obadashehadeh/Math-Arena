const successResponse = (data, message = 'Success') => {
    return {
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    };
};

const errorResponse = (message, code = 'INTERNAL_ERROR', statusCode = 500) => {
    return {
        success: false,
        error: {
            code,
            message,
            statusCode
        },
        timestamp: new Date().toISOString()
    };
};

const validationErrorResponse = (errors) => {
    return {
        success: false,
        error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors,
            statusCode: 400
        },
        timestamp: new Date().toISOString()
    };
};

module.exports = {
    successResponse,
    errorResponse,
    validationErrorResponse
};