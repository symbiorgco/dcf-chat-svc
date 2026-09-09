import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";

test("personas API failures produce safe chat responses and never leak secrets", async () => {
  const secret = "personas-secret-token";
  const logs: string[] = [];
  const originalGet = axios.get;
  const originalLog = console.log;

  axios.get = async () => {
    throw new Error(`upstream failed with ${secret}`);
  };
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    const { fetchPersonasProfile } = await import("./personas");

    assert.equal(await fetchPersonasProfile("wallet-1"), undefined);
    assert.equal(logs.join("\n").includes(secret), false);
  } finally {
    axios.get = originalGet;
    console.log = originalLog;
  }
});
