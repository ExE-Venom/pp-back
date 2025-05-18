const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.APP_FE_URL || "https://pay.rexzbot.xyz",
    optionsSuccessStatus: 200,
  })
);
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/pay", async (req, res) => {
  const { amount } = req.body;
  const merchantOrderId = `ORDER-${Date.now()}`;
  const redirectUrl = `${process.env.APP_BE_URL || "https://payapi.rexzbot.xyz"}/payment/status`;

  // Validate amount
  if (!amount || isNaN(amount) || amount <= 0) {
    console.error("Invalid amount:", amount);
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    // Step 1: Obtain OAuth token
    const tokenResponse = await axios.post(
      "https://api.phonepe.com/apis/identity-manager/v1/oauth/token",
      new URLSearchParams({
        client_id: process.env.PHONEPE_CLIENT_ID,
        client_secret: process.env.PHONEPE_CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log("Access Token:", accessToken);

    // Step 2: Initiate payment
    const paymentBody = {
      merchantOrderId,
      amount: amount * 100, // Convert to paise
      currency: "INR",
      expireAfter: 1200,
      paymentFlow: {
        type: "PG_CHECKOUT",
        merchantUrls: {
          redirectUrl: `${redirectUrl}/${merchantOrderId}`,
        },
      },
    };

    console.log("Payment Payload:", JSON.stringify(paymentBody, null, 2));

    const paymentResponse = await axios.post(
      "https://api.phonepe.com/apis/pg/checkout/v2/pay",
      paymentBody,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    console.log("Payment Response:", JSON.stringify(paymentResponse.data, null, 2));
    res.json(paymentResponse.data);
  } catch (error) {
    console.error(
      "Payment error:",
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
    res.status(500).json({
      error: "Failed to initiate payment",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/payment/status/:merchantOrderId", async (req, res) => {
  const { merchantOrderId } = req.params;
  if (!merchantOrderId) {
    console.error("Missing merchantOrderId");
    return res.redirect(`${process.env.APP_FE_URL || "https://pay.rexzbot.xyz"}/payment/status/ERROR`);
  }

  try {
    // Optional: Implement status check if PhonePe provides a status API
    // For now, redirect to frontend for status handling
    res.redirect(`${process.env.APP_FE_URL || "https://pay.rexzbot.xyz"}/payment/status/PAYMENT_SUCCESS`);
  } catch (error) {
    console.error("Status error:", error.message);
    res.redirect(`${process.env.APP_FE_URL || "https://pay.rexzbot.xyz"}/payment/status/ERROR`);
  }
});

const port = process.env.PORT || 3002;
app.listen(port, () => console.log(`Server running on port ${port}`));