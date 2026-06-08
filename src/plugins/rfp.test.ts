import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";

test("RFP API failures produce safe chat responses and never leak secrets", async () => {
  const secret = "rfp-secret-token";
  const logs: string[] = [];
  const originalPost = axios.post;
  const originalLog = console.log;
  const originalSecret = process.env.RFP_SECRET_KEY;
  const originalAegisUrl = process.env.AEGIS_URL;
  const originalCampaign = process.env.RFP_CAMPAIGN;
  const restoreEnv = (key: string, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  process.env.RFP_SECRET_KEY = secret;
  process.env.AEGIS_URL = "https://aegis.example.invalid";
  process.env.RFP_CAMPAIGN = "campaign-1";
  axios.post = async () => {
    const error = new Error(`request failed with ${secret}`);
    (error as Error & { config?: unknown }).config = {
      data: { secretKey: secret },
    };
    throw error;
  };
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    const { grantRFP } = await import("./rfp");

    assert.equal(await grantRFP(["wallet-1"], 0.01), false);
    assert.equal(logs.join("\n").includes(secret), false);
  } finally {
    axios.post = originalPost;
    console.log = originalLog;
    restoreEnv("RFP_SECRET_KEY", originalSecret);
    restoreEnv("AEGIS_URL", originalAegisUrl);
    restoreEnv("RFP_CAMPAIGN", originalCampaign);
  }
});
