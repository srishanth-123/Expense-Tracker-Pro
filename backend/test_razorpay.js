const axios = require('axios');
const crypto = require('crypto');

// --- Configuration ---
// Make sure to replace this with the token you get from logging in via Postman!
const AUTH_TOKEN = "YOUR_JWT_TOKEN_HERE"; 
const BASE_URL = "http://localhost:5000";

// Grab the secret from your environment (since you are testing locally)
// If you changed this in your .env, update it here too!
const RAZORPAY_SECRET = "test_secret"; 

async function testRazorpayFlow() {
    try {
        console.log("1. Creating Order...");
        const orderRes = await axios.post(
            `${BASE_URL}/api/payments/create-order`,
            { amount: 500 }, // Testing a 500 Rupee top-up
            { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
        );

        const orderId = orderRes.data.orderId;
        console.log(`✅ Order created successfully: ${orderId}`);

        console.log("\n2. Simulating Razorpay generating cryptographic signature...");
        // In reality, Razorpay's UI generates a real payment ID. 
        // We will fake one to trick our backend into verifying it.
        const fakePaymentId = `pay_fake_${Date.now()}`;
        
        // This is exactly what the razorpay checkout.js script does!
        const body = orderId + "|" + fakePaymentId;
        const generatedSignature = crypto
            .createHmac("sha256", RAZORPAY_SECRET)
            .update(body.toString())
            .digest("hex");
            
        console.log(`✅ Cryptographic signature generated: ${generatedSignature}`);

        console.log("\n3. Verifying Payment with Backend (Triggering Saga)...");
        const verifyRes = await axios.post(
            `${BASE_URL}/api/payments/verify`,
            {
                razorpay_order_id: orderId,
                razorpay_payment_id: fakePaymentId,
                razorpay_signature: generatedSignature
            },
            { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
        );

        console.log(`✅ Payment Verified & Wallet Updated! Status: ${verifyRes.data.status}`);

    } catch (error) {
        console.error("❌ Test Failed:", error.response ? error.response.data : error.message);
    }
}

testRazorpayFlow();
