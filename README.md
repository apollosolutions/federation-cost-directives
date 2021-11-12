# Cost Directives with Apollo Federation

This demonstration plugin shows an implementation of the [GraphQL Cost Directives specification](https://ibm.github.io/graphql-specs/cost-spec.html) for Apollo Federation.

**The code in this repository is experimental and has been provided for reference purposes only. Community feedback is welcome but this project may not be supported in the same way that repositories in the official [Apollo GraphQL GitHub organization](https://github.com/apollographql) are. If you need help you can file an issue on this repository, [contact Apollo](https://www.apollographql.com/contact-sales) to talk to an expert, or create a ticket directly in Apollo Studio.**


## Installation

In the root of this repository, run the following to install the plugin dependencies and compile the output to a `dist` folder:

```sh
npm i && npm run compile
```

There are a few tests available that you can run too:

```sh
npm run test
```

## Try the Demo

### Run in Unmanaged Mode

From the `example` directory, run the following command to install dependencies and then start the gateway and subgraphs:

```sh
npm i && npm start
```

You can then navigate to [http://localhost:4000](http://localhost:4000) to open Apollo Sandbox and run queries against the gateway. For example, the following query:

```graphql
query GetAllAstronauts {
  astronauts (first: 10) {
    edges {
       node {
         id
          name
          missions {
            id
            designation
            startDate
            endDate
          }
       }
    }
  }
}
```

Should produce this output:

```json
{
  "data": {
    "astronauts": {
      // ...
  },
  "extensions": {
    "operationCosts": {
      "typeCost": 92,
      "fieldCost": 87
    }
  }
}
```

However, if the `first` argument value is changed to `20`, it will exceed the maximum operation cost in the plugin and an error will be returned:

```json
{
  "errors": [
    {
      "message": "Field cost of 172 exceeds maximum operation field cost of 100.",
      "extensions": {
        "code": "INTERNAL_SERVER_ERROR",
        "exception": {
          "stacktrace": [
            "Error: Field cost of 172 exceeds maximum operation field cost of 100.",
            // ....
          ]
        }
      }
    }
  ],
  "extensions": {
    "operationCosts": {
      "typeCost": 0,
      "fieldCost": 0
    }
  },
  "data": null
}
```

Note that no operation costs are provided in the `extensions` of the response above because the error is thrown prior to query execution by estimating the upper bounds of the cost using static analysis.

### Configure Managed Federation

If you want to run the included example with managed federation, rename the `.env.sample` file to `.env` , create a new graph in Apollo Studio, and then add the provided `APOLLO_KEY` to the `.env` file. You may also wish to set the `APOLLO_GRAPH_VARIANT` environment variable (`development` will be used by default).

Ensure that [Rover](https://www.apollographql.com/docs/rover/getting-started/) is installed and run the following command from the `example` directory to push both subgraph schemas up to Apollo Studio:

```sh
npm run studio:push
```

Restart the gateway and it will now run in managed mode.

You can use the same command to push schema updates on a per-service basis as well:

```sh
npm run studio:push astronauts
```

## Usage

**Important!** The `CostDirectivesPlugin` isn't meant to be used as-is. It's a demonstration of how the GraphQL Cost Directives specification can be implemented using [graphql.js]() and an Apollo Server plugin.

The `CostDirectivesPlugin` also doesn't implement any rate limiting at the moment either, though your preferred approach to rate limiting could be added to it and there are comments in the plugin's source code about where you may consider doing that.

### Using with Apollo Federation

Also note that support for federated graphs has been added to the example through the `AddFullSdlToServiceResponsePlugin` plugin in each of the subgraphs. Each of the subgraphs implements this plugin in its respective Apollo Server to add a field called `sdlWithDirectives` to the `extensions` of the response for the `query { _service { sdl } }` operation. This is necessary because federation disregards custom type system directives, including the `@cost` and `@listSize` directives that are defined as a part of the specification (they are available at the subgraph level only).

However, the gateway needs to be aware of these directive locations to perform static analysis on the operation prior to query plan execution. There are other means by which you could provide awareness of these directives at the gateway level, but this approach may be convenient if your subgraphs are implemented using Apollo Server.

From there, the `buildFederatedSchemaCostMap` function can be used to generate a cost map that must added on the gateway `context`. The `CostDirectivesPlugin` will expect that these costs will be available in the `context` under the `schemaCostMap` property. This map can be updated as schema changes become available using the gateway's `onSchemaLoadOrUpdate` method:

```js
let schemaCostMap: SchemaCostMap = {};

gateway.onSchemaLoadOrUpdate(schemaContext => {
  buildFederatedSchemaCostMap(schemaContext.coreSupergraphSdl).then(res => {
    schemaCostMap = res;
  });
});

const server = new ApolloServer({
  gateway,
  context: () => ({ schemaCostMap }),
  plugins: [apolloUsageReportingPlugin, CostDirectivesPlugin()]
});
```

### Using with a Non-Federated Apollo Server

While no example is provided here, this plugin should also work with a non-federated Apollo Server by calling the `buildCostMap` function directly on the SDL-based type definitions before the server starts up (under the hood, the `buildFederatedSchemaCostMap` just calls this on each subgraph SDL to generate the cost map). From there, you can apply the cost map to Apollo Server's `context` under the `schemaCostMap` property as you would for a federated graph.

## TODO

- [ ] Write more tests
- [ ] [Add costs to introspection](https://ibm.github.io/graphql-specs/cost-spec.html#sec-Introspection)
- [ ] Cache static analysis results by operation hash
