import execa from "execa";

(async function () {
  const apolloKey = process.env.APOLLO_KEY;
  if (!apolloKey) {
    throw new Error("Please add an `APOLLO_KEY` environment variable!");
  }

  if (!(await isRoverInstalled())) {
    throw new Error(
      "Please install rover! https://www.apollographql.com/docs/rover/getting-started/"
    );
  }

  const graphName = apolloKey.split(":")[1];
  const graphVariant = process.env.APOLLO_GRAPH_VARIANT || "development";
  const serviceArgs = process.argv.slice(2);
  const services = [
    { name: "astronauts", url: "http://localhost:4001" },
    { name: "missions", url: "http://localhost:4002" },
    { name: "vehicles", url: "http://localhost:4003" }
  ];
  const servicesToPush = serviceArgs.length
    ? services.filter(service => serviceArgs.includes(service.name))
    : services;

  await servicesToPush.reduce(
    (previousPromise, subgraph) =>
      previousPromise.then(() =>
        introspectAndPublish({
          endpointUrl: subgraph.url,
          graphRef: `${graphName}@${graphVariant}`,
          key: apolloKey,
          name: subgraph.name,
          routingUrl: subgraph.url
        })
      ),
    Promise.resolve(null)
  );
})();

async function isRoverInstalled() {
  return (await execa("rover", ["--version"])).stdout.startsWith("Rover ");
}

async function introspectAndPublish({
  endpointUrl,
  graphRef,
  key,
  name,
  routingUrl
}) {
  const schema = await introspect(endpointUrl);
  await publish({ graphRef, key, name, routingUrl, schema });
}

async function introspect(endpointUrl) {
  const { stdout } = await execa("rover", [
    "subgraph",
    "introspect",
    endpointUrl
  ]);
  return stdout;
}

async function publish({ graphRef, key, name, routingUrl, schema }) {
  const subprocess = execa(
    "rover",
    [
      "subgraph",
      "publish",
      graphRef,
      "--name",
      name,
      "--routing-url",
      routingUrl,
      "--schema",
      "-"
    ],
    {
      input: schema,
      env: { APOLLO_KEY: key }
    }
  );

  subprocess.stdout.pipe(process.stdout);
  subprocess.stderr.pipe(process.stderr);

  await subprocess;
}
