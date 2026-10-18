// node_modules/@netlify/blobs/dist/chunk-XR3MUBBK.js
var NF_ERROR = "x-nf-error";
var NF_REQUEST_ID = "x-nf-request-id";
var BlobsInternalError = class extends Error {
  constructor(res) {
    let details = res.headers.get(NF_ERROR) || `${res.status} status code`;
    if (res.headers.has(NF_REQUEST_ID)) {
      details += `, ID: ${res.headers.get(NF_REQUEST_ID)}`;
    }
    super(`Netlify Blobs has generated an internal error (${details})`);
    this.name = "BlobsInternalError";
  }
};
var collectIterator = async (iterator) => {
  const result = [];
  for await (const item of iterator) {
    result.push(item);
  }
  return result;
};
var base64Decode = (input) => {
  const { Buffer: Buffer2 } = globalThis;
  if (Buffer2) {
    return Buffer2.from(input, "base64").toString();
  }
  return atob(input);
};
var base64Encode = (input) => {
  const { Buffer: Buffer2 } = globalThis;
  if (Buffer2) {
    return Buffer2.from(input).toString("base64");
  }
  return btoa(input);
};
var getEnvironment = () => {
  const { Deno, Netlify: Netlify2, process } = globalThis;
  return Netlify2?.env ?? Deno?.env ?? {
    delete: (key) => delete process?.env[key],
    get: (key) => process?.env[key],
    has: (key) => Boolean(process?.env[key]),
    set: (key, value) => {
      if (process?.env) {
        process.env[key] = value;
      }
    },
    toObject: () => process?.env ?? {}
  };
};
var getEnvironmentContext = () => {
  const context = globalThis.netlifyBlobsContext || getEnvironment().get("NETLIFY_BLOBS_CONTEXT");
  if (typeof context !== "string" || !context) {
    return {};
  }
  const data = base64Decode(context);
  try {
    return JSON.parse(data);
  } catch {
  }
  return {};
};
var MissingBlobsEnvironmentError = class extends Error {
  constructor(requiredProperties) {
    super(
      `The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: ${requiredProperties.join(
        ", "
      )}`
    );
    this.name = "MissingBlobsEnvironmentError";
  }
};
var BASE64_PREFIX = "b64;";
var METADATA_HEADER_INTERNAL = "x-amz-meta-user";
var METADATA_HEADER_EXTERNAL = "netlify-blobs-metadata";
var METADATA_MAX_SIZE = 2 * 1024;
var encodeMetadata = (metadata) => {
  if (!metadata) {
    return null;
  }
  const encodedObject = base64Encode(JSON.stringify(metadata));
  const payload = `b64;${encodedObject}`;
  if (METADATA_HEADER_EXTERNAL.length + payload.length > METADATA_MAX_SIZE) {
    throw new Error("Metadata object exceeds the maximum size");
  }
  return payload;
};
var decodeMetadata = (header) => {
  if (!header || !header.startsWith(BASE64_PREFIX)) {
    return {};
  }
  const encodedData = header.slice(BASE64_PREFIX.length);
  const decodedData = base64Decode(encodedData);
  const metadata = JSON.parse(decodedData);
  return metadata;
};
var getMetadataFromResponse = (response) => {
  if (!response.headers) {
    return {};
  }
  const value = response.headers.get(METADATA_HEADER_EXTERNAL) || response.headers.get(METADATA_HEADER_INTERNAL);
  try {
    return decodeMetadata(value);
  } catch {
    throw new Error(
      "An internal error occurred while trying to retrieve the metadata for an entry. Please try updating to the latest version of the Netlify Blobs client."
    );
  }
};
var BlobsConsistencyError = class extends Error {
  constructor() {
    super(
      `Netlify Blobs has failed to perform a read using strong consistency because the environment has not been configured with a 'uncachedEdgeURL' property`
    );
    this.name = "BlobsConsistencyError";
  }
};
var regions = {
  "us-east-1": true,
  "us-east-2": true,
  "eu-central-1": true,
  "ap-southeast-1": true,
  "ap-southeast-2": true
};
var isValidRegion = (input) => Object.keys(regions).includes(input);
var InvalidBlobsRegionError = class extends Error {
  constructor(region) {
    super(
      `${region} is not a supported Netlify Blobs region. Supported values are: ${Object.keys(regions).join(", ")}.`
    );
    this.name = "InvalidBlobsRegionError";
  }
};
var DEFAULT_RETRY_DELAY = getEnvironment().get("NODE_ENV") === "test" ? 1 : 5e3;
var MIN_RETRY_DELAY = 1e3;
var MAX_RETRY = 5;
var RATE_LIMIT_HEADER = "X-RateLimit-Reset";
var fetchAndRetry = async (fetch, url, options, attemptsLeft = MAX_RETRY) => {
  try {
    const res = await fetch(url, options);
    if (attemptsLeft > 0 && (res.status === 429 || res.status >= 500)) {
      const delay = getDelay(res.headers.get(RATE_LIMIT_HEADER));
      await sleep(delay);
      return fetchAndRetry(fetch, url, options, attemptsLeft - 1);
    }
    return res;
  } catch (error) {
    if (attemptsLeft === 0) {
      throw error;
    }
    const delay = getDelay();
    await sleep(delay);
    return fetchAndRetry(fetch, url, options, attemptsLeft - 1);
  }
};
var getDelay = (rateLimitReset) => {
  if (!rateLimitReset) {
    return DEFAULT_RETRY_DELAY;
  }
  return Math.max(Number(rateLimitReset) * 1e3 - Date.now(), MIN_RETRY_DELAY);
};
var sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
var SIGNED_URL_ACCEPT_HEADER = "application/json;type=signed-url";
var Client = class {
  constructor({ apiURL, consistency, edgeURL, fetch, region, siteID, token, uncachedEdgeURL }) {
    this.apiURL = apiURL;
    this.consistency = consistency ?? "eventual";
    this.edgeURL = edgeURL;
    this.fetch = fetch ?? globalThis.fetch;
    this.region = region;
    this.siteID = siteID;
    this.token = token;
    this.uncachedEdgeURL = uncachedEdgeURL;
    if (!this.fetch) {
      throw new Error(
        "Netlify Blobs could not find a `fetch` client in the global scope. You can either update your runtime to a version that includes `fetch` (like Node.js 18.0.0 or above), or you can supply your own implementation using the `fetch` property."
      );
    }
  }
  async getFinalRequest({
    consistency: opConsistency,
    key,
    metadata,
    method,
    parameters = {},
    storeName
  }) {
    const encodedMetadata = encodeMetadata(metadata);
    const consistency = opConsistency ?? this.consistency;
    let urlPath = `/${this.siteID}`;
    if (storeName) {
      urlPath += `/${storeName}`;
    }
    if (key) {
      urlPath += `/${key}`;
    }
    if (this.edgeURL) {
      if (consistency === "strong" && !this.uncachedEdgeURL) {
        throw new BlobsConsistencyError();
      }
      const headers = {
        authorization: `Bearer ${this.token}`
      };
      if (encodedMetadata) {
        headers[METADATA_HEADER_INTERNAL] = encodedMetadata;
      }
      if (this.region) {
        urlPath = `/region:${this.region}${urlPath}`;
      }
      const url2 = new URL(urlPath, consistency === "strong" ? this.uncachedEdgeURL : this.edgeURL);
      for (const key2 in parameters) {
        url2.searchParams.set(key2, parameters[key2]);
      }
      return {
        headers,
        url: url2.toString()
      };
    }
    const apiHeaders = { authorization: `Bearer ${this.token}` };
    const url = new URL(`/api/v1/blobs${urlPath}`, this.apiURL ?? "https://api.netlify.com");
    for (const key2 in parameters) {
      url.searchParams.set(key2, parameters[key2]);
    }
    if (this.region) {
      url.searchParams.set("region", this.region);
    }
    if (storeName === void 0 || key === void 0) {
      return {
        headers: apiHeaders,
        url: url.toString()
      };
    }
    if (encodedMetadata) {
      apiHeaders[METADATA_HEADER_EXTERNAL] = encodedMetadata;
    }
    if (method === "head" || method === "delete") {
      return {
        headers: apiHeaders,
        url: url.toString()
      };
    }
    const res = await this.fetch(url.toString(), {
      headers: { ...apiHeaders, accept: SIGNED_URL_ACCEPT_HEADER },
      method
    });
    if (res.status !== 200) {
      throw new BlobsInternalError(res);
    }
    const { url: signedURL } = await res.json();
    const userHeaders = encodedMetadata ? { [METADATA_HEADER_INTERNAL]: encodedMetadata } : void 0;
    return {
      headers: userHeaders,
      url: signedURL
    };
  }
  async makeRequest({
    body: body2,
    consistency,
    headers: extraHeaders,
    key,
    metadata,
    method,
    parameters,
    storeName
  }) {
    const { headers: baseHeaders = {}, url } = await this.getFinalRequest({
      consistency,
      key,
      metadata,
      method,
      parameters,
      storeName
    });
    const headers = {
      ...baseHeaders,
      ...extraHeaders
    };
    if (method === "put") {
      headers["cache-control"] = "max-age=0, stale-while-revalidate=60";
    }
    const options = {
      body: body2,
      headers,
      method
    };
    if (body2 instanceof ReadableStream) {
      options.duplex = "half";
    }
    return fetchAndRetry(this.fetch, url, options);
  }
};
var getClientOptions = (options, contextOverride) => {
  const context = contextOverride ?? getEnvironmentContext();
  const siteID = context.siteID ?? options.siteID;
  const token = context.token ?? options.token;
  if (!siteID || !token) {
    throw new MissingBlobsEnvironmentError(["siteID", "token"]);
  }
  if (options.region !== void 0 && !isValidRegion(options.region)) {
    throw new InvalidBlobsRegionError(options.region);
  }
  const clientOptions = {
    apiURL: context.apiURL ?? options.apiURL,
    consistency: options.consistency,
    edgeURL: context.edgeURL ?? options.edgeURL,
    fetch: options.fetch,
    region: options.region,
    siteID,
    token,
    uncachedEdgeURL: context.uncachedEdgeURL ?? options.uncachedEdgeURL
  };
  return clientOptions;
};

// node_modules/@netlify/blobs/dist/main.js
var DEPLOY_STORE_PREFIX = "deploy:";
var LEGACY_STORE_INTERNAL_PREFIX = "netlify-internal/legacy-namespace/";
var SITE_STORE_PREFIX = "site:";
var Store = class _Store {
  constructor(options) {
    this.client = options.client;
    if ("deployID" in options) {
      _Store.validateDeployID(options.deployID);
      let name = DEPLOY_STORE_PREFIX + options.deployID;
      if (options.name) {
        name += `:${options.name}`;
      }
      this.name = name;
    } else if (options.name.startsWith(LEGACY_STORE_INTERNAL_PREFIX)) {
      const storeName = options.name.slice(LEGACY_STORE_INTERNAL_PREFIX.length);
      _Store.validateStoreName(storeName);
      this.name = storeName;
    } else {
      _Store.validateStoreName(options.name);
      this.name = SITE_STORE_PREFIX + options.name;
    }
  }
  async delete(key) {
    const res = await this.client.makeRequest({ key, method: "delete", storeName: this.name });
    if (![200, 204, 404].includes(res.status)) {
      throw new BlobsInternalError(res);
    }
  }
  async get(key, options) {
    const { consistency, type } = options ?? {};
    const res = await this.client.makeRequest({ consistency, key, method: "get", storeName: this.name });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200) {
      throw new BlobsInternalError(res);
    }
    if (type === void 0 || type === "text") {
      return res.text();
    }
    if (type === "arrayBuffer") {
      return res.arrayBuffer();
    }
    if (type === "blob") {
      return res.blob();
    }
    if (type === "json") {
      return res.json();
    }
    if (type === "stream") {
      return res.body;
    }
    throw new BlobsInternalError(res);
  }
  async getMetadata(key, { consistency } = {}) {
    const res = await this.client.makeRequest({ consistency, key, method: "head", storeName: this.name });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200 && res.status !== 304) {
      throw new BlobsInternalError(res);
    }
    const etag = res?.headers.get("etag") ?? void 0;
    const metadata = getMetadataFromResponse(res);
    const result = {
      etag,
      metadata
    };
    return result;
  }
  async getWithMetadata(key, options) {
    const { consistency, etag: requestETag, type } = options ?? {};
    const headers = requestETag ? { "if-none-match": requestETag } : void 0;
    const res = await this.client.makeRequest({
      consistency,
      headers,
      key,
      method: "get",
      storeName: this.name
    });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200 && res.status !== 304) {
      throw new BlobsInternalError(res);
    }
    const responseETag = res?.headers.get("etag") ?? void 0;
    const metadata = getMetadataFromResponse(res);
    const result = {
      etag: responseETag,
      metadata
    };
    if (res.status === 304 && requestETag) {
      return { data: null, ...result };
    }
    if (type === void 0 || type === "text") {
      return { data: await res.text(), ...result };
    }
    if (type === "arrayBuffer") {
      return { data: await res.arrayBuffer(), ...result };
    }
    if (type === "blob") {
      return { data: await res.blob(), ...result };
    }
    if (type === "json") {
      return { data: await res.json(), ...result };
    }
    if (type === "stream") {
      return { data: res.body, ...result };
    }
    throw new Error(`Invalid 'type' property: ${type}. Expected: arrayBuffer, blob, json, stream, or text.`);
  }
  list(options = {}) {
    const iterator = this.getListIterator(options);
    if (options.paginate) {
      return iterator;
    }
    return collectIterator(iterator).then(
      (items) => items.reduce(
        (acc, item) => ({
          blobs: [...acc.blobs, ...item.blobs],
          directories: [...acc.directories, ...item.directories]
        }),
        { blobs: [], directories: [] }
      )
    );
  }
  async set(key, data, { metadata } = {}) {
    _Store.validateKey(key);
    const res = await this.client.makeRequest({
      body: data,
      key,
      metadata,
      method: "put",
      storeName: this.name
    });
    if (res.status !== 200) {
      throw new BlobsInternalError(res);
    }
  }
  async setJSON(key, data, { metadata } = {}) {
    _Store.validateKey(key);
    const payload = JSON.stringify(data);
    const headers = {
      "content-type": "application/json"
    };
    const res = await this.client.makeRequest({
      body: payload,
      headers,
      key,
      metadata,
      method: "put",
      storeName: this.name
    });
    if (res.status !== 200) {
      throw new BlobsInternalError(res);
    }
  }
  static formatListResultBlob(result) {
    if (!result.key) {
      return null;
    }
    return {
      etag: result.etag,
      key: result.key
    };
  }
  static validateKey(key) {
    if (key === "") {
      throw new Error("Blob key must not be empty.");
    }
    if (key.startsWith("/") || key.startsWith("%2F")) {
      throw new Error("Blob key must not start with forward slash (/).");
    }
    if (new TextEncoder().encode(key).length > 600) {
      throw new Error(
        "Blob key must be a sequence of Unicode characters whose UTF-8 encoding is at most 600 bytes long."
      );
    }
  }
  static validateDeployID(deployID) {
    if (!/^\w{1,24}$/.test(deployID)) {
      throw new Error(`'${deployID}' is not a valid Netlify deploy ID.`);
    }
  }
  static validateStoreName(name) {
    if (name.includes("/") || name.includes("%2F")) {
      throw new Error("Store name must not contain forward slashes (/).");
    }
    if (new TextEncoder().encode(name).length > 64) {
      throw new Error(
        "Store name must be a sequence of Unicode characters whose UTF-8 encoding is at most 64 bytes long."
      );
    }
  }
  getListIterator(options) {
    const { client, name: storeName } = this;
    const parameters = {};
    if (options?.prefix) {
      parameters.prefix = options.prefix;
    }
    if (options?.directories) {
      parameters.directories = "true";
    }
    return {
      [Symbol.asyncIterator]() {
        let currentCursor = null;
        let done = false;
        return {
          async next() {
            if (done) {
              return { done: true, value: void 0 };
            }
            const nextParameters = { ...parameters };
            if (currentCursor !== null) {
              nextParameters.cursor = currentCursor;
            }
            const res = await client.makeRequest({
              method: "get",
              parameters: nextParameters,
              storeName
            });
            let blobs = [];
            let directories = [];
            if (![200, 204, 404].includes(res.status)) {
              throw new BlobsInternalError(res);
            }
            if (res.status === 404) {
              done = true;
            } else {
              const page = await res.json();
              if (page.next_cursor) {
                currentCursor = page.next_cursor;
              } else {
                done = true;
              }
              blobs = (page.blobs ?? []).map(_Store.formatListResultBlob).filter(Boolean);
              directories = page.directories ?? [];
            }
            return {
              done: false,
              value: {
                blobs,
                directories
              }
            };
          }
        };
      }
    };
  }
};
var getStore = (input) => {
  if (typeof input === "string") {
    const clientOptions = getClientOptions({});
    const client = new Client(clientOptions);
    return new Store({ client, name: input });
  }
  if (typeof input?.name === "string" && typeof input?.siteID === "string" && typeof input?.token === "string") {
    const { name, siteID, token } = input;
    const clientOptions = getClientOptions(input, { siteID, token });
    if (!name || !siteID || !token) {
      throw new MissingBlobsEnvironmentError(["name", "siteID", "token"]);
    }
    const client = new Client(clientOptions);
    return new Store({ client, name });
  }
  if (typeof input?.name === "string") {
    const { name } = input;
    const clientOptions = getClientOptions(input);
    if (!name) {
      throw new MissingBlobsEnvironmentError(["name"]);
    }
    const client = new Client(clientOptions);
    return new Store({ client, name });
  }
  if (typeof input?.deployID === "string") {
    const clientOptions = getClientOptions(input);
    const { deployID } = input;
    if (!deployID) {
      throw new MissingBlobsEnvironmentError(["deployID"]);
    }
    const client = new Client(clientOptions);
    return new Store({ client, deployID });
  }
  throw new Error(
    "The `getStore` method requires the name of the store as a string or as the `name` property of an options object"
  );
};

// src/api.mjs
import crypto from "node:crypto";

// src/openings.json
var openings_default = {
  w: [
    {
      id: "w-italian-game",
      name: "Italian Game",
      aliases: [
        "Giuoco Piano"
      ],
      side: "w",
      difficulty: 1,
      vars: [
        {
          id: "w-italian-game--giuoco-pianissimo",
          name: "Giuoco Pianissimo",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bc4",
            "Bc5",
            "c3",
            "Nf6",
            "d3",
            "d6",
            "O-O",
            "O-O"
          ],
          fu: 5,
          vu: 7
        },
        {
          id: "w-italian-game--evans-gambit",
          name: "Evans Gambit",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bc4",
            "Bc5",
            "b4",
            "Bxb4",
            "c3",
            "Ba5",
            "d4",
            "exd4",
            "O-O"
          ],
          fu: 5,
          vu: 7
        },
        {
          id: "w-italian-game--two-knights-defence",
          name: "Two Knights Defence",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bc4",
            "Nf6",
            "Ng5",
            "d5",
            "exd5",
            "Na5",
            "Bb5+",
            "c6",
            "dxc6",
            "bxc6",
            "Be2",
            "h6"
          ],
          fu: 5,
          vu: 10
        },
        {
          id: "w-italian-game--fried-liver-attack",
          name: "Fried Liver Attack",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bc4",
            "Nf6",
            "Ng5",
            "d5",
            "exd5",
            "Nxd5",
            "Nxf7",
            "Kxf7",
            "Qf3+",
            "Ke6",
            "Nc3"
          ],
          fu: 5,
          vu: 10
        }
      ]
    },
    {
      id: "w-ruy-lopez",
      name: "Ruy Lopez",
      aliases: [
        "Spanish Game"
      ],
      side: "w",
      difficulty: 1,
      vars: [
        {
          id: "w-ruy-lopez--berlin-defence",
          name: "Berlin Defence",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bb5",
            "Nf6",
            "O-O",
            "Nxe4",
            "d4",
            "Nd6",
            "Bxc6",
            "dxc6",
            "dxe5",
            "Nf5",
            "Qxd8+",
            "Kxd8"
          ],
          fu: 5,
          vu: 6
        },
        {
          id: "w-ruy-lopez--exchange-variation",
          name: "Exchange Variation",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bb5",
            "a6",
            "Bxc6",
            "dxc6",
            "O-O",
            "f6",
            "d4",
            "exd4",
            "Nxd4",
            "c5"
          ],
          fu: 5,
          vu: 7
        },
        {
          id: "w-ruy-lopez--closed-ruy-lopez",
          name: "Closed Ruy Lopez",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bb5",
            "a6",
            "Ba4",
            "Nf6",
            "O-O",
            "Be7",
            "Re1",
            "b5",
            "Bb3",
            "d6",
            "c3",
            "O-O"
          ],
          fu: 5,
          vu: 10
        },
        {
          id: "w-ruy-lopez--open-ruy-lopez",
          name: "Open Ruy Lopez",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bb5",
            "a6",
            "Ba4",
            "Nf6",
            "O-O",
            "Nxe4",
            "d4",
            "b5",
            "Bb3",
            "d5",
            "dxe5",
            "Be6"
          ],
          fu: 5,
          vu: 10
        },
        {
          id: "w-ruy-lopez--schliemann-defence",
          name: "Schliemann Defence",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bb5",
            "f5",
            "Nc3",
            "fxe4",
            "Nxe4",
            "d5",
            "Nxe5",
            "dxe4",
            "Nxc6",
            "Qg5"
          ],
          fu: 5,
          vu: 6
        }
      ]
    },
    {
      id: "w-scotch-game",
      name: "Scotch Game",
      aliases: [],
      side: "w",
      difficulty: 1,
      vars: [
        {
          id: "w-scotch-game--classical-variation",
          name: "Classical Variation",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "d4",
            "exd4",
            "Nxd4",
            "Bc5",
            "Be3",
            "Qf6",
            "c3",
            "Nge7",
            "Bc4",
            "Ne5"
          ],
          fu: 5,
          vu: 8
        },
        {
          id: "w-scotch-game--mieses-variation",
          name: "Mieses Variation",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "d4",
            "exd4",
            "Nxd4",
            "Nf6",
            "Nxc6",
            "bxc6",
            "e5",
            "Qe7",
            "Qe2",
            "Nd5",
            "c4",
            "Ba6"
          ],
          fu: 5,
          vu: 8
        },
        {
          id: "w-scotch-game--scotch-gambit",
          name: "Scotch Gambit",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "d4",
            "exd4",
            "Bc4",
            "Bc5",
            "O-O",
            "d6",
            "c3",
            "Nf6",
            "cxd4",
            "Bb6"
          ],
          fu: 5,
          vu: 7
        }
      ]
    },
    {
      id: "w-vienna-game",
      name: "Vienna Game",
      aliases: [],
      side: "w",
      difficulty: 2,
      vars: [
        {
          id: "w-vienna-game--vienna-gambit",
          name: "Vienna Gambit",
          moves: [
            "e4",
            "e5",
            "Nc3",
            "Nf6",
            "f4",
            "d5",
            "fxe5",
            "Nxe4",
            "Nf3",
            "Be7",
            "d3",
            "Nxc3",
            "bxc3",
            "O-O"
          ],
          fu: 3,
          vu: 5
        },
        {
          id: "w-vienna-game--mieses-variation",
          name: "Mieses Variation",
          moves: [
            "e4",
            "e5",
            "Nc3",
            "Nf6",
            "g3",
            "d5",
            "exd5",
            "Nxd5",
            "Bg2",
            "Nxc3",
            "bxc3",
            "Bd6"
          ],
          fu: 3,
          vu: 5
        }
      ]
    },
    {
      id: "w-kings-gambit",
      name: "King's Gambit",
      aliases: [],
      side: "w",
      difficulty: 2,
      vars: [
        {
          id: "w-kings-gambit--kieseritzky-gambit",
          name: "Kieseritzky Gambit",
          moves: [
            "e4",
            "e5",
            "f4",
            "exf4",
            "Nf3",
            "g5",
            "h4",
            "g4",
            "Ne5",
            "Nf6",
            "Bc4",
            "d5",
            "exd5",
            "Bd6"
          ],
          fu: 3,
          vu: 4
        },
        {
          id: "w-kings-gambit--falkbeer-counter-gambit",
          name: "Falkbeer Counter-Gambit",
          moves: [
            "e4",
            "e5",
            "f4",
            "d5",
            "exd5",
            "e4",
            "d3",
            "Nf6",
            "dxe4",
            "Nxe4",
            "Nf3",
            "Bc5"
          ],
          fu: 3,
          vu: 4
        },
        {
          id: "w-kings-gambit--kings-gambit-declined",
          name: "King's Gambit Declined",
          moves: [
            "e4",
            "e5",
            "f4",
            "Bc5",
            "Nf3",
            "d6",
            "c3",
            "Nf6",
            "b4",
            "Bb6"
          ],
          fu: 3,
          vu: 4
        }
      ]
    },
    {
      id: "w-queens-gambit",
      name: "Queen's Gambit",
      aliases: [],
      side: "w",
      difficulty: 1,
      vars: [
        {
          id: "w-queens-gambit--queens-gambit-declined",
          name: "Queen's Gambit Declined",
          moves: [
            "d4",
            "d5",
            "c4",
            "e6",
            "Nc3",
            "Nf6",
            "Bg5",
            "Be7",
            "e3",
            "O-O",
            "Nf3",
            "h6",
            "Bh4",
            "b6"
          ],
          fu: 3,
          vu: 4
        },
        {
          id: "w-queens-gambit--queens-gambit-accepted",
          name: "Queen's Gambit Accepted",
          moves: [
            "d4",
            "d5",
            "c4",
            "dxc4",
            "Nf3",
            "Nf6",
            "e3",
            "e6",
            "Bxc4",
            "c5",
            "O-O",
            "a6"
          ],
          fu: 3,
          vu: 4
        },
        {
          id: "w-queens-gambit--albin-counter-gambit",
          name: "Albin Counter-Gambit",
          moves: [
            "d4",
            "d5",
            "c4",
            "e5",
            "dxe5",
            "d4",
            "Nf3",
            "Nc6",
            "g3",
            "Be6"
          ],
          fu: 3,
          vu: 4
        }
      ]
    },
    {
      id: "w-london-system",
      name: "London System",
      aliases: [],
      side: "w",
      difficulty: 1,
      vars: [
        {
          id: "w-london-system--main-line",
          name: "Main Line",
          moves: [
            "d4",
            "d5",
            "Bf4",
            "Nf6",
            "e3",
            "e6",
            "Nf3",
            "Bd6",
            "Bg3",
            "O-O",
            "Nbd2",
            "c5",
            "c3",
            "Nc6"
          ],
          fu: 3,
          vu: 0
        }
      ]
    },
    {
      id: "w-colle-system",
      name: "Colle System",
      aliases: [],
      side: "w",
      difficulty: 3,
      vars: [
        {
          id: "w-colle-system--main-line",
          name: "Main Line",
          moves: [
            "d4",
            "d5",
            "Nf3",
            "Nf6",
            "e3",
            "e6",
            "Bd3",
            "c5",
            "c3",
            "Nc6",
            "Nbd2",
            "Bd6",
            "O-O",
            "O-O"
          ],
          fu: 5,
          vu: 0
        }
      ]
    },
    {
      id: "w-catalan-opening",
      name: "Catalan Opening",
      aliases: [],
      side: "w",
      difficulty: 3,
      vars: [
        {
          id: "w-catalan-opening--open-catalan",
          name: "Open Catalan",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "e6",
            "g3",
            "d5",
            "Bg2",
            "Be7",
            "Nf3",
            "O-O",
            "O-O",
            "dxc4",
            "Qc2",
            "a6"
          ],
          fu: 3,
          vu: 12
        },
        {
          id: "w-catalan-opening--closed-catalan",
          name: "Closed Catalan",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "e6",
            "g3",
            "d5",
            "Bg2",
            "Be7",
            "Nf3",
            "O-O",
            "O-O",
            "Nbd7",
            "Qc2",
            "c6",
            "Nbd2",
            "b6"
          ],
          fu: 3,
          vu: 12
        }
      ]
    },
    {
      id: "w-trompowsky-attack",
      name: "Trompowsky Attack",
      aliases: [],
      side: "w",
      difficulty: 3,
      vars: [
        {
          id: "w-trompowsky-attack--main-line",
          name: "Main Line",
          moves: [
            "d4",
            "Nf6",
            "Bg5",
            "Ne4",
            "Bf4",
            "c5",
            "f3",
            "Qa5+",
            "c3",
            "Nf6",
            "d5",
            "Qb6",
            "Qc2",
            "d6"
          ],
          fu: 3,
          vu: 0
        }
      ]
    },
    {
      id: "w-english-opening",
      name: "English Opening",
      aliases: [],
      side: "w",
      difficulty: 2,
      vars: [
        {
          id: "w-english-opening--symmetrical-variation",
          name: "Symmetrical Variation",
          moves: [
            "c4",
            "c5",
            "Nc3",
            "Nc6",
            "g3",
            "g6",
            "Bg2",
            "Bg7",
            "Nf3",
            "e6",
            "O-O",
            "Nge7"
          ],
          fu: 1,
          vu: 2
        },
        {
          id: "w-english-opening--reversed-sicilian",
          name: "Reversed Sicilian",
          moves: [
            "c4",
            "e5",
            "Nc3",
            "Nf6",
            "Nf3",
            "Nc6",
            "g3",
            "d5",
            "cxd5",
            "Nxd5",
            "Bg2",
            "Nb6",
            "O-O",
            "Be7"
          ],
          fu: 1,
          vu: 4
        },
        {
          id: "w-english-opening--botvinnik-system",
          name: "Botvinnik System",
          moves: [
            "c4",
            "e5",
            "Nc3",
            "Nc6",
            "g3",
            "g6",
            "Bg2",
            "Bg7",
            "e4",
            "d6",
            "Nge2",
            "Nge7",
            "O-O",
            "O-O"
          ],
          fu: 1,
          vu: 4
        }
      ]
    },
    {
      id: "w-reti-opening",
      name: "Reti Opening",
      aliases: [],
      side: "w",
      difficulty: 3,
      vars: [
        {
          id: "w-reti-opening--main-line",
          name: "Main Line",
          moves: [
            "Nf3",
            "d5",
            "c4",
            "e6",
            "g3",
            "Nf6",
            "Bg2",
            "Be7",
            "O-O",
            "O-O",
            "b3",
            "c5"
          ],
          fu: 3,
          vu: 0
        }
      ]
    },
    {
      id: "w-kings-indian-attack",
      name: "King's Indian Attack",
      aliases: [],
      side: "w",
      difficulty: 3,
      vars: [
        {
          id: "w-kings-indian-attack--main-line",
          name: "Main Line",
          moves: [
            "Nf3",
            "d5",
            "g3",
            "Nf6",
            "Bg2",
            "e6",
            "O-O",
            "Be7",
            "d3",
            "O-O",
            "Nbd2",
            "c5",
            "e4",
            "Nc6"
          ],
          fu: 3,
          vu: 0
        }
      ]
    },
    {
      id: "w-birds-opening",
      name: "Bird's Opening",
      aliases: [],
      side: "w",
      difficulty: 3,
      vars: [
        {
          id: "w-birds-opening--main-line",
          name: "Main Line",
          moves: [
            "f4",
            "d5",
            "Nf3",
            "Nf6",
            "e3",
            "g6",
            "b3",
            "Bg7",
            "Bb2",
            "O-O",
            "Be2",
            "c5"
          ],
          fu: 1,
          vu: 2
        },
        {
          id: "w-birds-opening--froms-gambit",
          name: "From's Gambit",
          moves: [
            "f4",
            "e5",
            "fxe5",
            "d6",
            "exd6",
            "Bxd6",
            "Nf3",
            "g5",
            "g3",
            "g4",
            "Nh4",
            "Ne7"
          ],
          fu: 1,
          vu: 2
        }
      ]
    }
  ],
  b: [
    {
      id: "b-sicilian-defence",
      name: "Sicilian Defence",
      aliases: [],
      side: "b",
      difficulty: 1,
      vars: [
        {
          id: "b-sicilian-defence--najdorf-variation",
          name: "Najdorf Variation",
          moves: [
            "e4",
            "c5",
            "Nf3",
            "d6",
            "d4",
            "cxd4",
            "Nxd4",
            "Nf6",
            "Nc3",
            "a6",
            "Be3",
            "e5",
            "Nb3",
            "Be6"
          ],
          fu: 2,
          vu: 10
        },
        {
          id: "b-sicilian-defence--dragon-variation",
          name: "Dragon Variation",
          moves: [
            "e4",
            "c5",
            "Nf3",
            "d6",
            "d4",
            "cxd4",
            "Nxd4",
            "Nf6",
            "Nc3",
            "g6",
            "Be3",
            "Bg7",
            "f3",
            "O-O",
            "Qd2",
            "Nc6"
          ],
          fu: 2,
          vu: 10
        },
        {
          id: "b-sicilian-defence--scheveningen-variation",
          name: "Scheveningen Variation",
          moves: [
            "e4",
            "c5",
            "Nf3",
            "d6",
            "d4",
            "cxd4",
            "Nxd4",
            "Nf6",
            "Nc3",
            "e6",
            "Be2",
            "Be7",
            "O-O",
            "O-O",
            "f4",
            "Nc6"
          ],
          fu: 2,
          vu: 10
        },
        {
          id: "b-sicilian-defence--sveshnikov-variation",
          name: "Sveshnikov Variation",
          moves: [
            "e4",
            "c5",
            "Nf3",
            "Nc6",
            "d4",
            "cxd4",
            "Nxd4",
            "Nf6",
            "Nc3",
            "e5",
            "Ndb5",
            "d6",
            "Bg5",
            "a6",
            "Na3",
            "b5"
          ],
          fu: 2,
          vu: 4
        },
        {
          id: "b-sicilian-defence--alapin-variation",
          name: "Alapin Variation",
          moves: [
            "e4",
            "c5",
            "c3",
            "Nf6",
            "e5",
            "Nd5",
            "d4",
            "cxd4",
            "Nf3",
            "Nc6",
            "cxd4",
            "d6"
          ],
          fu: 2,
          vu: 3
        },
        {
          id: "b-sicilian-defence--closed-sicilian",
          name: "Closed Sicilian",
          moves: [
            "e4",
            "c5",
            "Nc3",
            "Nc6",
            "g3",
            "g6",
            "Bg2",
            "Bg7",
            "d3",
            "d6",
            "Be3",
            "e6"
          ],
          fu: 2,
          vu: 3
        }
      ]
    },
    {
      id: "b-french-defence",
      name: "French Defence",
      aliases: [],
      side: "b",
      difficulty: 1,
      vars: [
        {
          id: "b-french-defence--advance-variation",
          name: "Advance Variation",
          moves: [
            "e4",
            "e6",
            "d4",
            "d5",
            "e5",
            "c5",
            "c3",
            "Nc6",
            "Nf3",
            "Qb6",
            "a3",
            "c4",
            "Nbd2",
            "Na5"
          ],
          fu: 2,
          vu: 5
        },
        {
          id: "b-french-defence--winawer-variation",
          name: "Winawer Variation",
          moves: [
            "e4",
            "e6",
            "d4",
            "d5",
            "Nc3",
            "Bb4",
            "e5",
            "c5",
            "a3",
            "Bxc3+",
            "bxc3",
            "Ne7",
            "Qg4",
            "Qc7"
          ],
          fu: 2,
          vu: 6
        },
        {
          id: "b-french-defence--tarrasch-variation",
          name: "Tarrasch Variation",
          moves: [
            "e4",
            "e6",
            "d4",
            "d5",
            "Nd2",
            "Nf6",
            "e5",
            "Nfd7",
            "Bd3",
            "c5",
            "c3",
            "Nc6",
            "Ne2",
            "cxd4",
            "cxd4",
            "f6"
          ],
          fu: 2,
          vu: 5
        },
        {
          id: "b-french-defence--classical-variation",
          name: "Classical Variation",
          moves: [
            "e4",
            "e6",
            "d4",
            "d5",
            "Nc3",
            "Nf6",
            "Bg5",
            "Be7",
            "e5",
            "Nfd7",
            "Bxe7",
            "Qxe7",
            "f4",
            "O-O",
            "Nf3",
            "c5"
          ],
          fu: 2,
          vu: 6
        },
        {
          id: "b-french-defence--exchange-variation",
          name: "Exchange Variation",
          moves: [
            "e4",
            "e6",
            "d4",
            "d5",
            "exd5",
            "exd5",
            "Nf3",
            "Nf6",
            "Bd3",
            "Bd6",
            "O-O",
            "O-O",
            "Bg5",
            "Bg4"
          ],
          fu: 2,
          vu: 5
        }
      ]
    },
    {
      id: "b-caro-kann-defence",
      name: "Caro-Kann Defence",
      aliases: [],
      side: "b",
      difficulty: 1,
      vars: [
        {
          id: "b-caro-kann-defence--advance-variation",
          name: "Advance Variation",
          moves: [
            "e4",
            "c6",
            "d4",
            "d5",
            "e5",
            "Bf5",
            "Nf3",
            "e6",
            "Be2",
            "c5",
            "Be3",
            "Nd7"
          ],
          fu: 2,
          vu: 5
        },
        {
          id: "b-caro-kann-defence--classical-variation",
          name: "Classical Variation",
          moves: [
            "e4",
            "c6",
            "d4",
            "d5",
            "Nc3",
            "dxe4",
            "Nxe4",
            "Bf5",
            "Ng3",
            "Bg6",
            "h4",
            "h6",
            "Nf3",
            "Nd7",
            "h5",
            "Bh7"
          ],
          fu: 2,
          vu: 5
        },
        {
          id: "b-caro-kann-defence--exchange-variation",
          name: "Exchange Variation",
          moves: [
            "e4",
            "c6",
            "d4",
            "d5",
            "exd5",
            "cxd5",
            "Bd3",
            "Nc6",
            "c3",
            "Nf6",
            "Bf4",
            "Bg4"
          ],
          fu: 2,
          vu: 7
        },
        {
          id: "b-caro-kann-defence--panov-botvinnik-attack",
          name: "Panov-Botvinnik Attack",
          moves: [
            "e4",
            "c6",
            "d4",
            "d5",
            "exd5",
            "cxd5",
            "c4",
            "Nf6",
            "Nc3",
            "e6",
            "Nf3",
            "Be7",
            "cxd5",
            "Nxd5"
          ],
          fu: 2,
          vu: 7
        },
        {
          id: "b-caro-kann-defence--fantasy-variation",
          name: "Fantasy Variation",
          moves: [
            "e4",
            "c6",
            "d4",
            "d5",
            "f3",
            "dxe4",
            "fxe4",
            "e5",
            "Nf3",
            "Bg4",
            "Bc4",
            "Nd7"
          ],
          fu: 2,
          vu: 5
        }
      ]
    },
    {
      id: "b-pirc-defence",
      name: "Pirc Defence",
      aliases: [],
      side: "b",
      difficulty: 2,
      vars: [
        {
          id: "b-pirc-defence--austrian-attack",
          name: "Austrian Attack",
          moves: [
            "e4",
            "d6",
            "d4",
            "Nf6",
            "Nc3",
            "g6",
            "f4",
            "Bg7",
            "Nf3",
            "O-O",
            "Bd3",
            "Na6"
          ],
          fu: 2,
          vu: 7
        },
        {
          id: "b-pirc-defence--classical-variation",
          name: "Classical Variation",
          moves: [
            "e4",
            "d6",
            "d4",
            "Nf6",
            "Nc3",
            "g6",
            "Nf3",
            "Bg7",
            "Be2",
            "O-O",
            "O-O",
            "c6",
            "a4",
            "Nbd7"
          ],
          fu: 2,
          vu: 7
        },
        {
          id: "b-pirc-defence--150-attack",
          name: "150 Attack",
          moves: [
            "e4",
            "d6",
            "d4",
            "Nf6",
            "Nc3",
            "g6",
            "Be3",
            "Bg7",
            "Qd2",
            "c6",
            "f3",
            "b5"
          ],
          fu: 2,
          vu: 7
        }
      ]
    },
    {
      id: "b-scandinavian-defence",
      name: "Scandinavian Defence",
      aliases: [
        "Centre Counter"
      ],
      side: "b",
      difficulty: 1,
      vars: [
        {
          id: "b-scandinavian-defence--main-line",
          name: "Main Line",
          moves: [
            "e4",
            "d5",
            "exd5",
            "Qxd5",
            "Nc3",
            "Qa5",
            "d4",
            "Nf6",
            "Nf3",
            "c6",
            "Bc4",
            "Bf5"
          ],
          fu: 2,
          vu: 4
        },
        {
          id: "b-scandinavian-defence--modern-variation",
          name: "Modern Variation",
          moves: [
            "e4",
            "d5",
            "exd5",
            "Nf6",
            "d4",
            "Nxd5",
            "Nf3",
            "g6",
            "Be2",
            "Bg7",
            "O-O",
            "O-O"
          ],
          fu: 2,
          vu: 4
        }
      ]
    },
    {
      id: "b-alekhines-defence",
      name: "Alekhine's Defence",
      aliases: [],
      side: "b",
      difficulty: 2,
      vars: [
        {
          id: "b-alekhines-defence--modern-variation",
          name: "Modern Variation",
          moves: [
            "e4",
            "Nf6",
            "e5",
            "Nd5",
            "d4",
            "d6",
            "Nf3",
            "Bg4",
            "Be2",
            "e6",
            "O-O",
            "Be7"
          ],
          fu: 2,
          vu: 7
        },
        {
          id: "b-alekhines-defence--four-pawns-attack",
          name: "Four Pawns Attack",
          moves: [
            "e4",
            "Nf6",
            "e5",
            "Nd5",
            "d4",
            "d6",
            "c4",
            "Nb6",
            "f4",
            "dxe5",
            "fxe5",
            "Nc6",
            "Be3",
            "Bf5"
          ],
          fu: 2,
          vu: 7
        }
      ]
    },
    {
      id: "b-kings-indian-defence",
      name: "King's Indian Defence",
      aliases: [],
      side: "b",
      difficulty: 2,
      vars: [
        {
          id: "b-kings-indian-defence--classical-variation",
          name: "Classical Variation",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "g6",
            "Nc3",
            "Bg7",
            "e4",
            "d6",
            "Nf3",
            "O-O",
            "Be2",
            "e5",
            "O-O",
            "Nc6",
            "d5",
            "Ne7"
          ],
          fu: 6,
          vu: 9
        },
        {
          id: "b-kings-indian-defence--samisch-variation",
          name: "Samisch Variation",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "g6",
            "Nc3",
            "Bg7",
            "e4",
            "d6",
            "f3",
            "O-O",
            "Be3",
            "e5",
            "Nge2",
            "c6"
          ],
          fu: 6,
          vu: 9
        },
        {
          id: "b-kings-indian-defence--four-pawns-attack",
          name: "Four Pawns Attack",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "g6",
            "Nc3",
            "Bg7",
            "e4",
            "d6",
            "f4",
            "O-O",
            "Nf3",
            "c5",
            "dxc5",
            "Qa5"
          ],
          fu: 6,
          vu: 9
        },
        {
          id: "b-kings-indian-defence--fianchetto-variation",
          name: "Fianchetto Variation",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "g6",
            "Nf3",
            "Bg7",
            "g3",
            "O-O",
            "Bg2",
            "d6",
            "O-O",
            "Nbd7",
            "Nc3",
            "e5",
            "e4",
            "c6"
          ],
          fu: 6,
          vu: 6
        }
      ]
    },
    {
      id: "b-grunfeld-defence",
      name: "Grunfeld Defence",
      aliases: [],
      side: "b",
      difficulty: 3,
      vars: [
        {
          id: "b-grunfeld-defence--exchange-variation",
          name: "Exchange Variation",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "g6",
            "Nc3",
            "d5",
            "cxd5",
            "Nxd5",
            "e4",
            "Nxc3",
            "bxc3",
            "Bg7",
            "Nf3",
            "c5"
          ],
          fu: 6,
          vu: 7
        },
        {
          id: "b-grunfeld-defence--russian-system",
          name: "Russian System",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "g6",
            "Nc3",
            "d5",
            "Nf3",
            "Bg7",
            "Qb3",
            "dxc4",
            "Qxc4",
            "O-O",
            "e4",
            "Bg4",
            "Be3",
            "Nfd7"
          ],
          fu: 6,
          vu: 7
        }
      ]
    },
    {
      id: "b-nimzo-indian-defence",
      name: "Nimzo-Indian Defence",
      aliases: [],
      side: "b",
      difficulty: 2,
      vars: [
        {
          id: "b-nimzo-indian-defence--rubinstein-variation",
          name: "Rubinstein Variation",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "e6",
            "Nc3",
            "Bb4",
            "e3",
            "O-O",
            "Bd3",
            "d5",
            "Nf3",
            "c5",
            "O-O",
            "Nc6"
          ],
          fu: 5,
          vu: 7
        },
        {
          id: "b-nimzo-indian-defence--classical-variation",
          name: "Classical Variation",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "e6",
            "Nc3",
            "Bb4",
            "Qc2",
            "O-O",
            "a3",
            "Bxc3+",
            "Qxc3",
            "b6",
            "Bg5",
            "Bb7"
          ],
          fu: 5,
          vu: 7
        },
        {
          id: "b-nimzo-indian-defence--samisch-variation",
          name: "Samisch Variation",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "e6",
            "Nc3",
            "Bb4",
            "a3",
            "Bxc3+",
            "bxc3",
            "c5",
            "e3",
            "Nc6",
            "Bd3",
            "O-O"
          ],
          fu: 5,
          vu: 7
        }
      ]
    },
    {
      id: "b-queens-indian-defence",
      name: "Queen's Indian Defence",
      aliases: [],
      side: "b",
      difficulty: 3,
      vars: [
        {
          id: "b-queens-indian-defence--main-line",
          name: "Main Line",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "e6",
            "Nf3",
            "b6",
            "g3",
            "Bb7",
            "Bg2",
            "Be7",
            "O-O",
            "O-O",
            "Nc3",
            "Ne4"
          ],
          fu: 5,
          vu: 0
        }
      ]
    },
    {
      id: "b-queens-gambit-declined",
      name: "Queen's Gambit Declined",
      aliases: [],
      side: "b",
      difficulty: 2,
      vars: [
        {
          id: "b-queens-gambit-declined--tartakower-variation",
          name: "Tartakower Variation",
          moves: [
            "d4",
            "d5",
            "c4",
            "e6",
            "Nc3",
            "Nf6",
            "Bg5",
            "Be7",
            "e3",
            "O-O",
            "Nf3",
            "h6",
            "Bh4",
            "b6"
          ],
          fu: 4,
          vu: 12
        },
        {
          id: "b-queens-gambit-declined--exchange-variation",
          name: "Exchange Variation",
          moves: [
            "d4",
            "d5",
            "c4",
            "e6",
            "Nc3",
            "Nf6",
            "cxd5",
            "exd5",
            "Bg5",
            "c6",
            "e3",
            "Be7",
            "Bd3",
            "Nbd7"
          ],
          fu: 4,
          vu: 7
        },
        {
          id: "b-queens-gambit-declined--orthodox-defence",
          name: "Orthodox Defence",
          moves: [
            "d4",
            "d5",
            "c4",
            "e6",
            "Nc3",
            "Nf6",
            "Bg5",
            "Be7",
            "e3",
            "O-O",
            "Nf3",
            "Nbd7",
            "Rc1",
            "c6"
          ],
          fu: 4,
          vu: 12
        }
      ]
    },
    {
      id: "b-slav-defence",
      name: "Slav Defence",
      aliases: [],
      side: "b",
      difficulty: 2,
      vars: [
        {
          id: "b-slav-defence--main-line",
          name: "Main Line",
          moves: [
            "d4",
            "d5",
            "c4",
            "c6",
            "Nf3",
            "Nf6",
            "Nc3",
            "dxc4",
            "a4",
            "Bf5",
            "e3",
            "e6",
            "Bxc4",
            "Bb4"
          ],
          fu: 4,
          vu: 8
        },
        {
          id: "b-slav-defence--semi-slav-meran",
          name: "Semi-Slav, Meran",
          moves: [
            "d4",
            "d5",
            "c4",
            "c6",
            "Nf3",
            "Nf6",
            "Nc3",
            "e6",
            "e3",
            "Nbd7",
            "Bd3",
            "dxc4",
            "Bxc4",
            "b5",
            "Bd3",
            "a6"
          ],
          fu: 4,
          vu: 8
        },
        {
          id: "b-slav-defence--exchange-slav",
          name: "Exchange Slav",
          moves: [
            "d4",
            "d5",
            "c4",
            "c6",
            "cxd5",
            "cxd5",
            "Nc3",
            "Nf6",
            "Bf4",
            "Nc6",
            "e3",
            "Bf5"
          ],
          fu: 4,
          vu: 5
        }
      ]
    },
    {
      id: "b-dutch-defence",
      name: "Dutch Defence",
      aliases: [],
      side: "b",
      difficulty: 2,
      vars: [
        {
          id: "b-dutch-defence--stonewall-variation",
          name: "Stonewall Variation",
          moves: [
            "d4",
            "f5",
            "g3",
            "Nf6",
            "Bg2",
            "e6",
            "Nf3",
            "d5",
            "O-O",
            "c6",
            "c4",
            "Bd6"
          ],
          fu: 2,
          vu: 8
        },
        {
          id: "b-dutch-defence--leningrad-variation",
          name: "Leningrad Variation",
          moves: [
            "d4",
            "f5",
            "g3",
            "Nf6",
            "Bg2",
            "g6",
            "Nf3",
            "Bg7",
            "O-O",
            "O-O",
            "c4",
            "d6",
            "Nc3",
            "Qe8"
          ],
          fu: 2,
          vu: 6
        },
        {
          id: "b-dutch-defence--classical-variation",
          name: "Classical Variation",
          moves: [
            "d4",
            "f5",
            "g3",
            "Nf6",
            "Bg2",
            "e6",
            "Nf3",
            "Be7",
            "O-O",
            "O-O",
            "c4",
            "d6",
            "Nc3",
            "Qe8"
          ],
          fu: 2,
          vu: 8
        }
      ]
    },
    {
      id: "b-benoni-defence",
      name: "Benoni Defence",
      aliases: [],
      side: "b",
      difficulty: 3,
      vars: [
        {
          id: "b-benoni-defence--modern-benoni",
          name: "Modern Benoni",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "c5",
            "d5",
            "e6",
            "Nc3",
            "exd5",
            "cxd5",
            "d6",
            "e4",
            "g6",
            "Nf3",
            "Bg7"
          ],
          fu: 4,
          vu: 6
        },
        {
          id: "b-benoni-defence--benko-gambit",
          name: "Benko Gambit",
          moves: [
            "d4",
            "Nf6",
            "c4",
            "c5",
            "d5",
            "b5",
            "cxb5",
            "a6",
            "bxa6",
            "Bxa6",
            "Nc3",
            "g6",
            "Nf3",
            "d6"
          ],
          fu: 4,
          vu: 6
        }
      ]
    },
    {
      id: "b-petrov-defence",
      name: "Petrov Defence",
      aliases: [
        "Russian Game",
        "Petroff"
      ],
      side: "b",
      difficulty: 1,
      vars: [
        {
          id: "b-petrov-defence--main-line",
          name: "Main Line",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "Nf6",
            "Nxe5",
            "d6",
            "Nf3",
            "Nxe4",
            "d4",
            "d5",
            "Bd3",
            "Nc6",
            "O-O",
            "Be7"
          ],
          fu: 4,
          vu: 0
        }
      ]
    },
    {
      id: "b-philidor-defence",
      name: "Philidor Defence",
      aliases: [],
      side: "b",
      difficulty: 2,
      vars: [
        {
          id: "b-philidor-defence--main-line",
          name: "Main Line",
          moves: [
            "e4",
            "e5",
            "Nf3",
            "d6",
            "d4",
            "Nf6",
            "Nc3",
            "Nbd7",
            "Bc4",
            "Be7",
            "O-O",
            "O-O"
          ],
          fu: 4,
          vu: 0
        }
      ]
    }
  ]
};

// src/api.mjs
var TOKEN_DAYS = 30;
var LAUNCH = Date.UTC(2026, 9, 17);
var DAILY_COUNT = 5;
var DAILY_MAX_SCORE = 3e3;
var NAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
var opts = (name) => ({ name, consistency: "strong" });
var json = (data, status = 200) => Response.json(data, { status });
var HttpError = class extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
};
var fail = (status, detail) => {
  throw new HttpError(status, detail);
};
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
var todayStr = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
var secretCache;
async function secret() {
  if (secretCache) return secretCache;
  const env = Netlify.env.get("JWT_SECRET");
  if (env) return secretCache = env;
  const cfg = getStore(opts("config"));
  let s = await cfg.get("jwt-secret");
  if (!s) {
    await cfg.set("jwt-secret", crypto.randomBytes(48).toString("hex"), { onlyIfNew: true });
    s = await cfg.get("jwt-secret");
  }
  return secretCache = s;
}
var b64 = (x) => Buffer.from(x).toString("base64url");
async function makeToken(user) {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body2 = b64(JSON.stringify({ sub: user.lower, exp: Math.floor(Date.now() / 1e3) + TOKEN_DAYS * 86400 }));
  const sig = crypto.createHmac("sha256", await secret()).update(`${head}.${body2}`).digest("base64url");
  return `${head}.${body2}.${sig}`;
}
async function readToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) fail(401, "Invalid token");
  const good = crypto.createHmac("sha256", await secret()).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== good.length || !crypto.timingSafeEqual(given, good)) fail(401, "Invalid token");
  let p;
  try {
    p = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch {
    fail(401, "Invalid token");
  }
  if (!p.exp || p.exp < Date.now() / 1e3) fail(401, "Session expired");
  return p;
}
var scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384 }, (e, k) => e ? rej(e) : res(k)));
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString("hex")}:${(await scrypt(pw, salt)).toString("hex")}`;
}
async function verifyPassword(pw, stored) {
  const [s, h] = stored.split(":");
  const want = Buffer.from(h, "hex");
  const got = await scrypt(pw, Buffer.from(s, "hex"));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
var publicUser = (u) => ({ id: u.id, username: u.username });
async function currentUser(req) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) fail(401, "Not authenticated");
  const p = await readToken(h.slice(7));
  const user = await getStore(opts("users")).get(p.sub, { type: "json" });
  if (!user) fail(401, "User not found");
  return user;
}
async function body(req) {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}
function allLines() {
  const lines = [];
  for (const s of ["w", "b"]) for (const f of openings_default[s]) for (const v of f.vars) lines.push({ side: s, family_id: f.id, var_id: v.id });
  return lines.sort((a, b) => a.var_id < b.var_id ? -1 : a.var_id > b.var_id ? 1 : 0);
}
function dailyPick(d) {
  const lines = allLines();
  const picked = [], fams = /* @__PURE__ */ new Set();
  for (let i = 0; picked.length < DAILY_COUNT; i++) {
    const h = BigInt("0x" + crypto.createHash("sha256").update(`gto-daily|${d}|${i}`).digest("hex"));
    const cand = lines[Number(h % BigInt(lines.length))];
    if (!fams.has(cand.family_id)) {
      fams.add(cand.family_id);
      picked.push(cand);
    }
  }
  return picked;
}
async function readAll(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const rows = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return rows.filter(Boolean);
}
var routes = {
  "POST /auth/register": async (req) => {
    const b = await body(req);
    const name = String(b.username ?? "").trim();
    const pw = String(b.password ?? "");
    if (!NAME_RE.test(name)) fail(400, "Username must be 3-20 letters, numbers, _ or -");
    if (pw.length < 6) fail(400, "Password must be at least 6 characters");
    const user = { id: crypto.randomUUID(), username: name, lower: name.toLowerCase(), password_hash: await hashPassword(pw), created_at: nowIso() };
    const { modified } = await getStore(opts("users")).setJSON(user.lower, user, { onlyIfNew: true });
    if (!modified) fail(409, "That username is taken");
    return json({ token: await makeToken(user), user: publicUser(user) });
  },
  "POST /auth/login": async (req, ctx) => {
    const b = await body(req);
    const name = String(b.username ?? "").trim().toLowerCase();
    const pw = String(b.password ?? "");
    const attempts = getStore(opts("attempts"));
    const ident = `${ctx.ip || "x"}:${name}`.slice(0, 200);
    const att = await attempts.get(ident, { type: "json" });
    if (att && att.count >= 5 && att.locked_until > nowIso()) fail(429, "Too many attempts. Try again in 15 minutes.");
    const user = NAME_RE.test(name) ? await getStore(opts("users")).get(name, { type: "json" }) : null;
    if (!user || !await verifyPassword(pw, user.password_hash)) {
      const count = (att?.count || 0) + 1;
      await attempts.setJSON(ident, { count, locked_until: count >= 5 ? new Date(Date.now() + 15 * 6e4).toISOString() : "" });
      fail(401, "Wrong username or password");
    }
    if (att) await attempts.delete(ident);
    return json({ token: await makeToken(user), user: publicUser(user) });
  },
  "GET /auth/me": async (req) => json(publicUser(await currentUser(req))),
  "GET /progress": async (req) => {
    const u = await currentUser(req);
    const doc = await getStore(opts("progress")).get(u.lower, { type: "json" });
    return json({ progress: doc ? doc.data : null });
  },
  "PUT /progress": async (req) => {
    const u = await currentUser(req);
    const b = await body(req);
    if (!b.progress || typeof b.progress !== "object" || Array.isArray(b.progress)) fail(422, "progress must be an object");
    if (JSON.stringify(b.progress).length > 9e5) fail(413, "Progress too large");
    const xp = Math.max(0, parseInt(b.progress.xp, 10) || 0);
    await getStore(opts("progress")).setJSON(u.lower, { data: b.progress, xp, username: u.username, updated_at: nowIso() });
    await getStore(opts("xp")).setJSON(u.lower, { username: u.username, xp });
    return json({ ok: true });
  },
  "GET /daily": async () => {
    const d = todayStr();
    const number = Math.round((Date.parse(d) - LAUNCH) / 864e5) + 1;
    return json({ date: d, number, items: dailyPick(d) });
  },
  "GET /daily/status": async (req) => {
    const u = await currentUser(req);
    const doc = await getStore(opts("daily")).get(`${todayStr()}/${u.lower}`, { type: "json" });
    return json({ played: !!doc, score: doc ? doc.score : null, grid: doc ? doc.grid : [] });
  },
  "POST /daily/submit": async (req) => {
    const u = await currentUser(req);
    const b = await body(req);
    if (b.date !== todayStr()) fail(400, "This daily challenge is closed");
    const score = b.score;
    if (!Number.isInteger(score) || score < 0 || score > DAILY_MAX_SCORE) fail(400, "Invalid score");
    const grid = (Array.isArray(b.grid) ? b.grid : []).filter((x) => typeof x === "string").slice(0, DAILY_COUNT).map((x) => x.slice(0, 16));
    const store = getStore(opts("daily"));
    const rec = { username: u.username, date: b.date, score, grid, created_at: nowIso() };
    const { modified } = await store.setJSON(`${b.date}/${u.lower}`, rec, { onlyIfNew: true });
    if (!modified) fail(409, "You have already played today's challenge");
    const all = await readAll(store, `${b.date}/`);
    return json({ ok: true, rank: all.filter((r) => r.score > score).length + 1 });
  },
  "GET /daily/leaderboard": async (req) => {
    const q = new URL(req.url).searchParams.get("date");
    const d = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayStr();
    const all = await readAll(getStore(opts("daily")), `${d}/`);
    all.sort((a, b) => b.score - a.score || (a.created_at < b.created_at ? -1 : 1));
    return json({ date: d, rows: all.slice(0, 50).map((r) => ({ username: r.username, score: r.score, grid: r.grid })) });
  },
  "GET /leaderboard/xp": async () => {
    const all = await readAll(getStore(opts("xp")));
    all.sort((a, b) => b.xp - a.xp);
    return json({ rows: all.slice(0, 50).map((r) => ({ username: r.username, xp: r.xp })) });
  },
  "GET /": async () => json({ message: "Guess the Opening API" })
};
var api_default = async (req, ctx) => {
  const path = new URL(req.url).pathname.replace(/^\/api/, "").replace(/(.)\/$/, "$1") || "/";
  const handler = routes[`${req.method} ${path}`];
  if (!handler) return json({ detail: "Not found" }, 404);
  try {
    return await handler(req, ctx);
  } catch (e) {
    if (e instanceof HttpError) return json({ detail: e.detail }, e.status);
    console.error(e);
    return json({ detail: "Server error" }, 500);
  }
};
var config = { path: ["/api", "/api/*"] };
export {
  config,
  api_default as default
};
