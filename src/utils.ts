import * as chalk from "chalk";
import axios from "axios";
import * as fs from "fs-extra";

export const readFile = (file): Promise<string> => {
  return new Promise((resolve, reject) => {
    fs.readFile(file, "utf-8", (err, data) => {
      resolve(data);
    });
  });
};

export const writeFile = (file, content) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(file, content, "utf-8", (err) => {
      resolve(1);
    });
  });
};

export const logTask = (fileUrl, outputPath, status: "success" | "fail") => {
  const msg = `\nsource:${fileUrl} \ndest: ${outputPath} \nstatus: ${status}`;
  console.log(status === "success" ? chalk.green(msg) : chalk.red(msg));
};

export async function downloadFile(fileUrl: string, outputPath: string) {
  const writer = fs.createWriteStream(outputPath);

  return axios({
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
          logTask(fileUrl, outputPath, "success");
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
      logTask(fileUrl, outputPath, "fail");
      e.outputPath = outputPath;
      return Promise.reject(e);
    });
}
