const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

// Your configured PhonePe credentials
const PHONEPE_USERNAME = process.env.PHONEPE_USERNAME || 'yourUsername';
const PHONEPE_PASSWORD = process.env.PHONEPE_PASSWORD || 'yourPassword';

// Generate the expected Authorization header
function generateSHA256Auth(username, password) {
  const base = `${username}:${password}`;
  return crypto.createHash('sha256').update(base).digest('hex');
}

const expectedAuth = generateSHA256Auth(PHONEPE_USERNAME, PHONEPE_PASSWORD);


app.get("/", (req, res) => {
  res.send("Welcome to the PhonePe Payment API");
});


// Webhook route
app.post('/webhooks', (req, res) => {
  const receivedAuth = req.headers['authorization'];

  // Basic security check
  if (!receivedAuth || receivedAuth !== expectedAuth) {
    console.warn('Unauthorized webhook attempt');
    return res.status(401).send('Unauthorized');
  }

  const { event, payload } = req.body;

  // You should store or process based on payload.state and event
  console.log('📩 Received PhonePe Webhook');
  console.log('Event:', event);
  console.log('State:', payload?.state);
  console.log('Order ID:', payload?.orderId || payload?.originalMerchantOrderId);

  // You may log/store payloads depending on `event` and `payload.state`
  // Example: check if payment succeeded
  if (event === 'checkout.order.completed' && payload.state === 'COMPLETED') {
    // Fulfill order
    console.log('✅ Payment completed for Order:', payload.orderId);
  }
  // Example: check if payment failed
  else if (event === 'checkout.order.failed' && payload.state === 'FAILED') {
    // Handle failure
    console.log('❌ Payment failed for Order:', payload.orderId);
  }

  res.status(200).send('Webhook received');
});

// Payment initiation route
// This route is called from the frontend to initiate a payment
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
        message: "Payment message used for collect requests",
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
          Authorization: `O-Bearer ${accessToken}`,
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

// Payment status route
// This route is called after payment completion to check the status
app.get("/payment/status/:merchantOrderId", async (req, res) => {
  const { merchantOrderId } = req.params;
  if (!merchantOrderId) {
    console.error("Missing merchantOrderId");
    return res.redirect(`${process.env.APP_FE_URL || "https://store.rexzbot.xyz"}/payment/status/ERROR`);
  }


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

  const response = await axios.get(
    `https://api.phonepe.com/apis/pg/checkout/v2/order/${merchantOrderId}/status`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${accessToken}`,
      },
    }
  );

  const data = JSON.stringify(response.data, null, 2);
  const status = data.state;
  const TxnId = data?.paymentDetails?.transactionId;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (status === "COMPLETED") {
    // Handle successful payment
    // SEND LOGS VIA DISCORD_WEBHOOK_URL
    if (discordWebhookUrl) {
      const discordMessage = {
        content: `✅ Payment Successful! ✅\n\n**Amount:** ${data.amount / 100},\n**Transaction ID:** ${TxnId},\n**Order ID:** ${merchantOrderId}\n**Time:** ${new Date().toLocaleString()}`,
      };
      const payload = JSON.stringify(discordMessage);
      await axios.post(discordWebhookUrl, 
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return res.redirect(`${process.env.APP_FE_URL || "https://store.rexzbot.xyz"}/payment/status/PAYMENT_SUCCESS?TxnId=${TxnId}&merchantOrderId=${merchantOrderId}`);
  } else if (status === "FAILED") {
    // Handle failed payment
    // SEND LOGS VIA DISCORD_WEBHOOK_URL
    if (discordWebhookUrl) {
      const discordMessage = {
        content: `❌ Payment Failed! ❌\n\nAmount: ${data.amount / 100},\nTransaction ID: ${TxnId},\nOrder ID: ${merchantOrderId}`,
      };
      await axios.post(discordWebhookUrl, discordMessage);
    }
    return res.redirect(`${process.env.APP_FE_URL || "https://store.rexzbot.xyz"}/payment/status/PAYMENT_ERROR?TxnId=${TxnId}&merchantOrderId=${merchantOrderId}`);
  } else if (status === "PENDING") {
    // Handle pending payment
    // SEND LOGS VIA DISCORD_WEBHOOK_URL
    if (discordWebhookUrl) {
      const discordMessage = {
        content: `⏳ Payment Pending! ⏳\n\nAmount: ${data.amount / 100},\nTransaction ID: ${TxnId},\nOrder ID: ${merchantOrderId}`,
      };
      await axios.post(discordWebhookUrl, discordMessage);
    }
    return res.redirect(`${process.env.APP_FE_URL || "https://store.rexzbot.xyz"}/payment/status/PAYMENT_PENDING?TxnId=${TxnId}&merchantOrderId=${merchantOrderId}`);
  } else {
    // Handle unknown status
    // SEND LOGS VIA DISCORD_WEBHOOK_URL
    if (discordWebhookUrl) {
      const discordMessage = {
        content: `❓ Unknown Payment Status! ❓\n\nAmount: ${data.amount / 100},\nTransaction ID: ${TxnId},\nOrder ID: ${merchantOrderId}`,
      };
      await axios.post(discordWebhookUrl, discordMessage);
    }
    return res.redirect(`${process.env.APP_FE_URL || "https://store.rexzbot.xyz"}/payment/status/ERROR?TxnId=${TxnId}&merchantOrderId=${merchantOrderId}`);
  }
});

const port = process.env.PORT || 3002;
app.listen(port, () => console.log(`Server running on port ${port}`));