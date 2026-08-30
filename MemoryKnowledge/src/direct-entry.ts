import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Normalize the argv entry before comparing it with an ESM module URL. */
export function isDirectModuleExecution(
  moduleUrl: string,
  argvEntry: string | undefined,
): boolean {
  if (!argvEntry) return false;
  return moduleUrl === pathToFileURL(resolve(argvEntry)).href;
}
