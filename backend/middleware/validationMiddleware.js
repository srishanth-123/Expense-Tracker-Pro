const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg,
            errors: errors.array()
        });
    }
    next();
};

const validateRegistration = [
    body('name')
        .notEmpty().withMessage('Name is required')
        .trim()
        .isLength({ min: 2 }).withMessage('Name must be at least 2 characters')
        .isLength({ max: 50 }).withMessage('Name must be at most 50 characters'),
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail()
        .custom((value) => {
            if (!value.toLowerCase().endsWith('@gmail.com')) {
                throw new Error('Only Gmail addresses (@gmail.com) are allowed');
            }
            return true;
        }),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number'),
    handleValidationErrors
];

const validateLogin = [
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail()
        .custom((value) => {
            if (!value.toLowerCase().endsWith('@gmail.com')) {
                throw new Error('Only Gmail addresses (@gmail.com) are allowed');
            }
            return true;
        }),
    body('password')
        .notEmpty().withMessage('Password is required'),
    handleValidationErrors
];

module.exports = {
    validateRegistration,
    validateLogin
};
