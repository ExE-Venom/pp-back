const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const sha256 = require("sha256");
const uniqid = require("uniqid");
require("dotenv").config();

const app = express();
const MERCHANT_ID = process.env.MERCHANT_ID;
const SALT_INDEX = 1;
const SALT_KEY = process.env.SALT_KEY;
const PHONE_PE_HOST_URL = process.env.PHONE_PE_HOST_URL;
const APP_BE_URL = process.env.APP_BE_URL; // our application
const APP_FE_URL = process.env.APP_FE_URL; // frontend application

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.send("PhonePe Integration APIs!");
});

app.get("/pay", async function (req, res, next) {
  const amount = +req.query.amount;
  let userId = uniqid();
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).send({ error: "Invalid amount" });
  }
  let merchantTransactionId = uniqid();

  let normalPayLoad = {
    merchantId: MERCHANT_ID,
    merchantTransactionId: merchantTransactionId,
    merchantUserId: userId,
    amount: amount * 100,
    redirectUrl: `${APP_BE_URL}/payment/validate/${merchantTransactionId}`,
    redirectMode: "REDIRECT",
    mobileNumber: "9999999999",
    paymentInstrument: {
      type: "PAY_PAGE",
    },
  };

  let bufferObj = Buffer.from(JSON.stringify(normalPayLoad), "utf8");
  let base64EncodedPayload = bufferObj.toString("base64");

  let string = base64EncodedPayload + "/pg/v1/pay" + SALT_KEY;
  let sha256_val = sha256(string);
  let xVerifyChecksum = sha256_val + "###" + SALT_INDEX;

  try {
    const response = await axios.post(
      `${PHONE_PE_HOST_URL}/pg/pay`,
      {
        request: base64EncodedPayload,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerifyChecksum,
          accept: "application/json",
        },
      }
    );
    res.redirect(response.data.data.instrumentResponse.redirectInfo.url);
  } catch (error) {
    res.status(500).send({ error: "Failed to initiate payment", details: error.response?.data || error.message });
  }
});

app.get("/payment/validate/:merchantTransactionId", async function (req, res) {
  const { merchantTransactionId } = req.params;
  if (merchantTransactionId) {
    let statusUrl = `${PHONE_PE_HOST_URL}/pg/status/${MERCHANT_ID}/${merchantTransactionId}`;

    let string = `/pg/v1/status/${MERCHANT_ID}/${merchantTransactionId}` + SALT_KEY;
    let sha256_val = sha256(string);
    let xVerifyChecksum = sha256_val + "###" + SALT_INDEX;

    try {
      const response = await axios.get(statusUrl, {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerifyChecksum,
          "X-MERCHANT-ID": MERCHANT_ID,
          accept: "application/json",
        },
      });
      if (response.data && response.data.code === "PAYMENT_SUCCESS") {
        res.redirect(`${APP_FE_URL}/payment/status/PAYMENT_SUCCESS`);
      } else {
        res.redirect(`${APP_FE_URL}/payment/status/${response.data.code}`);
      }
    } catch (error) {
      res.redirect(`${APP_FE_URL}/payment/status/ERROR`);
    }
  } else {
    res.redirect(`${APP_FE_URL}/payment/status/ERROR`);
  }
});

const port = 3002;
app.listen(port, () => {
  console.log(`PhonePe application listening on port ${port}`);
});