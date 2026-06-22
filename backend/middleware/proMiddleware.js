const requirePro = (req, res, next) => {
    // Expecting req.user to be populated by authMiddleware
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    if (req.user.isPro === true || (req.user.plan === "PRO" && req.user.subscriptionStatus === "ACTIVE")) {
        return next();
    }

    return res.status(403).json({ 
        success: false, 
        message: "Upgrade to Pro to access this feature." 
    });
};

module.exports = requirePro;
