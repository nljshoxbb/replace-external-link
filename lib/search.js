"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const util_1 = require("util");
const glob_1 = require("glob");
const readFile = (0, util_1.promisify)(fs.readFile);
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
    }
    else {
        // alert("No match");
    }
};
const search = async () => {
    /** 扫描当前文件 */
    const results = await (0, glob_1.glob)("**", { stat: true, withFileTypes: true });
    const periodResults = await (0, glob_1.glob)("**/.**/**", { stat: true, withFileTypes: true });
    const files = results.map((path) => path.fullpath());
    const periodFiles = periodResults.map((path) => path.fullpath());
    console.log([...files, ...periodFiles]);
    for (const file of [...files, ...periodFiles]) {
        fs.readFile(file, "utf-8", (err, data) => {
            data && checkContainUrl(data);
        });
    }
};
exports.default = search;
