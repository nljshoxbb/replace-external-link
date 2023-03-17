#!/usr/bin/env node

import * as inquirer from "inquirer";
import * as path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import search from "./search";

const getQuestions = ({ argv }) => {
  return [
    {
      type: "list",
      name: "componentType",
      message: "请选择引擎生态元素类型",
      choices: [
        {
          name: "组件/物料",
          value: "component",
        },
        {
          name: "设置器 (setter)",
          value: "setter",
        },
        {
          name: "插件 (plugin)",
          value: "plugin",
        },
        {
          name: "编辑器 (editor)",
          value: "editor",
        },
      ],
    },
    {
      type: "input",
      name: "projectName",
      message: "生态元素包名",
      default(ans) {
        const pathBaseName = path.basename(path.join(process.cwd(), argv._[0] || "./"));
        return pathBaseName;
      },
    },
    {
      type: "input",
      name: "description",
      message: "简要介绍生态元素",
      default(ans) {
        return ans.projectName;
      },
    },
    {
      type: "input",
      name: "author",
      message: "作者名",
      default() {
        return process.env.USER || process.env.USERNAME;
      },
    },
  ];
};

const main = async () => {
  //   const argv = yargs(hideBin(process.argv))
  //     .option("verbose", {
  //       alias: "v",
  //       type: "boolean",
  //       description: "Run with verbose logging",
  //     })
  //     .parse();
  //   const argv = yargs(hideBin(process.argv))
  //     .command(
  //       "serve [port]",
  //       "start the server",
  //       (yargs) => {
  //         return yargs.positional("port", {
  //           describe: "port to bind on",
  //           default: 5000,
  //         });
  //       },
  //       (argv) => {
  //         if (argv.verbose) console.info(`start server on :${argv.port}`);
  //         // serve(argv.port);
  //       }
  //     )
  //     .option("verbose", {
  //       alias: "v",
  //       type: "boolean",
  //       description: "Run with verbose logging",
  //     })
  //     .parse();
  //   const result = await inquirer.prompt(getQuestions({ argv }));
  search();
};

main();
