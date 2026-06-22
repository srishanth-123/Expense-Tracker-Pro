const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    createRequest,
    getRequests,
    acceptRequest,
    rejectRequest
} = require("../controllers/moneyRequestController");

router.use(authMiddleware);

router.post("/", createRequest);
router.get("/", getRequests);
router.post("/:id/accept", acceptRequest);
router.post("/:id/reject", rejectRequest);

module.exports = router;
