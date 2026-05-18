const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
    }
    next();
};

const validateTransaction = [
    body('amount')
        .notEmpty().withMessage('Amount is required')
        .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number greater than 0'),
    body('type')
        .notEmpty().withMessage('Type is required')
        .isIn(['income', 'expense']).withMessage('Type must be either income or expense'),
    body('category')
        .notEmpty().withMessage('Category is required'),
    body('date')
        .optional()
        .isISO8601().withMessage('Date must be a valid ISO8601 date string'),
    handleValidationErrors
];

const validateTransactionUpdate = [
    body('amount')
        .optional()
        .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number greater than 0'),
    body('type')
        .optional()
        .isIn(['income', 'expense']).withMessage('Type must be either income or expense'),
    body('date')
        .optional()
        .isISO8601().withMessage('Date must be a valid ISO8601 date string'),
    handleValidationErrors
];

module.exports = {
    validateTransaction,
    validateTransactionUpdate
};
