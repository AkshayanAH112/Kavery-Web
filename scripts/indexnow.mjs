// Submits URLs to IndexNow (Bing, Yandex, Naver, Seznam, etc.)
// Usage:
//   npm run indexnow
//   node scripts/indexnow.mjs [url1] [url2] ...

const HOST = "periyaneelavanaikaverysports.club";
const KEY = "acd5654f067f4511bbfe62c8788318b5";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/IndexNow";

const defaultPaths = [
  "",
  "/about",
  "/news",
  "/gallery",
  "/membership",
  "/membership/renew",
  "/live",
];

const defaultUrls = [];
for (const path of defaultPaths) {
  for (const locale of ["en", "ta"]) {
    defaultUrls.push(`https://${HOST}/${locale}${path}`);
  }
}

const customUrls = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const urlList = customUrls.length > 0 ? customUrls : defaultUrls;

console.log(`Submitting ${urlList.length} URL(s) to IndexNow (${ENDPOINT})...`);
console.log(`Host: ${HOST}`);
console.log(`Key: ${KEY}`);
console.log(`Key Location: ${KEY_LOCATION}`);

const payload = {
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList,
};

try {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 200 || response.status === 202) {
    console.log(`✓ Success (${response.status}): URLs submitted successfully.`);
  } else {
    const text = await response.text();
    console.error(`✗ Error (${response.status} ${response.statusText}): ${text || "Submission failed"}`);
    if (response.status === 403) {
      console.error("  Note: HTTP 403 means the key file is not reachable or not yet indexed/verified on the live host.");
    }
  }
} catch (err) {
  console.error("✗ Network request failed:", err);
  process.exitCode = 1;
}
