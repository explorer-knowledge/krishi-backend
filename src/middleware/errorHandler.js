const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    let statusCode = 500;
    let errorResponse = {
        success: false,
        error: "Internal Server Error",
        code: "INTERNAL_SERVER_ERROR"
    };

    if (err.name === 'ValidationError') {
        statusCode = 400;
        errorResponse.error = err.message;
        errorResponse.code = "VALIDATION_ERROR";
    } else if (err.code === 'SQLITE_CONSTRAINT') {
        statusCode = 409;
        errorResponse.error = "Duplicate entry found.";
        errorResponse.code = "DUPLICATE_KEY_ERROR";
    } else if (err.isAxiosError) {
        statusCode = err.response?.status || 502;
        errorResponse.error = "External API Error";
        errorResponse.code = "EXTERNAL_API_ERROR";
        // Optionally pass through specific message
        if (err.response?.data?.Message) {
            errorResponse.error = err.response.data.Message;
        }
    } else if (err.status) {
        statusCode = err.status;
        errorResponse.error = err.message || "Error";
        errorResponse.code = err.code || "ERROR";
    } else {
        errorResponse.error = err.message || "An unexpected error occurred.";
    }

    res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;
