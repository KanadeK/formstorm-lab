#!/usr/bin/env node

import { Command } from "commander";
import { pathToFileURL } from "node:url";

import { VERSION } from "../core/version.js";

export function createProgram(): Command {
  return new Command()
    .name("formstorm")
    .description(
      "Generate reproducible form boundary, internationalization, accessibility, and validation tests.",
    )
    .version(VERSION);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await createProgram().parseAsync(process.argv);
}
