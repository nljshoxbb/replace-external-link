"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadFile = exports.logTask = exports.writeFile = exports.readFile = void 0;
const chalk = require("chalk");
const axios_1 = require("axios");
const fs = require("fs-extra");
const readFile = (file) => {
    return new Promise((resolve, reject) => {
        fs.readFile(file, "utf-8", (err, data) => {
            resolve(data);
        });
    });
};
exports.readFile = readFile;
const writeFile = (file, content) => {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, content, "utf-8", (err) => {
            resolve(1);
        });
    });
};
exports.writeFile = writeFile;
const logTask = (fileUrl, outputPath, status) => {
    const msg = `\nsource:${fileUrl} \ndest: ${outputPath} \nstatus: ${status}`;
    console.log(status === "success" ? chalk.green(msg) : chalk.red(msg));
};
exports.logTask = logTask;
async function downloadFile(fileUrl, outputPath) {
    const writer = fs.createWriteStream(outputPath);
    return (0, axios_1.default)({
        method: "get",
        url: fileUrl,
        responseType: "stream",
        timeout: 5000,
    })
        .then((response) => {
        return new Promise((resolve, reject) => {
            response.data.pipe(writer);
            let error = null;
            writer.on("finish", () => {
                (0, exports.logTask)(fileUrl, outputPath, "success");
            });
            writer.on("error", (err) => {
                error = err;
                writer.close();
                reject(err);
            });
            writer.on("close", () => {
                if (!error) {
                    resolve(true);
                }
            });
        });
    })
        .catch((e) => {
        (0, exports.logTask)(fileUrl, outputPath, "fail");
        return Promise.reject(e);
    });
}
exports.downloadFile = downloadFile;
