const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/pay", async (req, res) => {
    const { amount } = req.body;
    const redirectUrl = "https://pay.rexzbot.xyz/payment/status/PAYMENT_SUCCESS";
    const merchantOrderId = `ORDER-${Date.now()}`;

    try {
        const tokenResponse = await axios.request("https://api.phonepe.com/apis/identity-manager/v1/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.PHONEPE_CLIENT_ID,
                client_secret: process.env.PHONEPE_CLIENT_SECRET,
                grant_type: "client_credentials",
            }),
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const paymentBody = JSON.stringify({
            merchantOrderId,
            amount,
            currency: "INR",
            expireAfter: 1200,
            paymentFlow: {
                type: "PG_CHECKOUT",
                merchantUrls: { redirectUrl },
            },
        });

        const paymentResponse = await axios.request("https://api.phonepe.com/apis/pg/checkout/v2/pay", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `O-Bearer ${accessToken}` },
            body: paymentBody,
        });

        const paymentResult = await paymentResponse.json();
        res.json(paymentResult);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3002, () => console.log("Server running"));