const { default: axios } = require("axios");

axios
  .get("https://cdn.jsdelivr.net/npm/@alilc/lowcode-code-generator@1.0.8/dist/standalone-worker.min.js", {
    timeout: 10000,
    responseType: "stream",
  })
  .then((res) => {
    console.log(res);
  })
  .catch((e) => {
    console.log("err", e);
  });
