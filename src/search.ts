import * as fs from "fs-extra";
import * as path from "path";
import { resolve } from "path";
import { promisify } from "util";
import { glob, Glob } from "glob";

const readFile = promisify(fs.readFile);

const checkContainUrl = (content) => {
  //   var urlRE = new RegExp(
  //     "([a-zA-Z0-9]+://)?([a-zA-Z0-9_]+:[a-zA-Z0-9_]+@)?([a-zA-Z0-9.-]+\\.[A-Za-z]{2,4})(:[0-9]+)?([^ ])+"
  //   );
  //   const regex = new RegExp(urlRE);
  //   const result = content.match(regex);

  let regEx = /\b((http|https)?:\/\/.*?\.[a-z]{2,4}\/[^\s]*\b)/g;
  //   let str = "some text https://website.com/sH6Sd2x some more text";

  const result = content.match(regEx);

  //   var oldUrl = "http://host1.dev.local:8000/one/two";
  //   var url = new URL(oldUrl);
  //   console.log(url);

  if (result) {
    console.log(result);
    // console.log()
    // alert("Successful match");
  } else {
    // alert("No match");
  }
};

const search = async () => {
  /** 扫描当前文件 */
  const results = await glob("**", { stat: true, withFileTypes: true });
  const periodResults = await glob("**/.**/**", { stat: true, withFileTypes: true });
  const files = results.map((path) => path.fullpath());
  const periodFiles = periodResults.map((path) => path.fullpath());

  console.log([...files, ...periodFiles]);
  for (const file of [...files, ...periodFiles]) {
    fs.readFile(file, "utf-8", (err, data) => {
      data && checkContainUrl(data);
    });
  }
};

export default search;
