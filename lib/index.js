#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const generator_1 = require("./generator");
const commander_1 = require("commander");
const utils_1 = require("./utils");
const path = require("path");
const constant_1 = require("./constant");
const chalk = require("chalk");
const mapActions = {
    init: {
        description: "初始化配置文件",
        examples: ["replace-external-link init"],
    },
    build: {
        description: "生成替换文件",
        examples: ["replace-external-link build"],
    },
};
const main = async () => {
    const program = new commander_1.Command();
    Reflect.ownKeys(mapActions).forEach((action) => {
        program
            .command(action)
            .description(mapActions[action].description)
            .action(async () => {
            console.log(action, __dirname);
            if (action === "init") {
                const result = await (0, utils_1.readFile)(path.join(__dirname, "config.js"));
                const configPath = path.join(process.cwd(), constant_1.CONFIG_FILE_NAME);
                await (0, utils_1.writeFile)(path.join(process.cwd(), constant_1.CONFIG_FILE_NAME), result);
                console.log(chalk.green(`已生成配置文件 ${configPath}`));
            }
            if (action === "build") {
                new generator_1.default();
            }
        });
    });
    program.on("--help", () => {
        console.log("\nExamples:");
        Reflect.ownKeys(mapActions).forEach((action) => {
            mapActions[action].examples.forEach((example) => {
                console.log(`  ${example}`);
            });
        });
    });
    program.parse(process.argv);
};
main();
