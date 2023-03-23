#!/usr/bin/env node

import * as inquirer from "inquirer";
import generator from "./generator";
import { Command } from "commander";
import { readFile, writeFile } from "./utils";
import * as path from "path";
import { CONFIG_FILE_NAME } from "./constant";
import * as chalk from "chalk";

const mapActions = {
  init: {
    description: "初始化配置文件",
    examples: ["replace-origin-link init"],
  },
  replace: {
    description: "生成替换文件",
    examples: ["replace-origin-link replace"],
  },
};

const main = async () => {
  const program = new Command();

  Reflect.ownKeys(mapActions).forEach((action: any) => {
    program
      .option("--log", "打印详细信息")
      .command(action)
      .description(mapActions[action].description)
      .action(async () => {
        if (action === "init") {
          console.log(program.getOptionValue("log"));
          const result = await readFile(path.join(__dirname, "config.js"));
          const configPath = path.join(process.cwd(), CONFIG_FILE_NAME);
          await writeFile(path.join(process.cwd(), CONFIG_FILE_NAME), result);
          console.log(chalk.green(`已生成配置文件 ${configPath}`));
        }
        if (action === "replace") {
          const { log } = program.opts();
          new generator(log);
        }
      });
  });

  program.on("--help", () => {
    console.log("\nExamples:");
    Reflect.ownKeys(mapActions).forEach((action: any) => {
      mapActions[action].examples.forEach((example) => {
        console.log(`  ${example}`);
      });
    });
  });

  program.parse(process.argv);
};

main();
