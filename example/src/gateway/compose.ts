import { resolve } from "path";
import { writeFileSync } from "fs";
import execa from "execa";

async function isRoverInstalled() {
  return (await execa("rover", ["--version"])).stdout.startsWith("Rover ");
}

export async function compose() {
  if (!(await isRoverInstalled())) {
    throw new Error(
      "Please install rover! https://www.apollographql.com/docs/rover/getting-started/"
    );
  }

  const { stdout } = await execa("rover", [
    "supergraph",
    "compose",
    "--config",
    "./src/gateway/supergraph-config.yaml"
  ]);

  writeFileSync(resolve(__dirname, "../gateway/supergraph.graphql"), stdout);
}
