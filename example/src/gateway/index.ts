import { resolve } from "path";
import { readFileSync } from "fs";

import { ApolloGateway, GatewayConfig } from "@apollo/gateway";
import { ApolloServer } from "apollo-server";
import {
  ApolloServerPluginUsageReporting,
  ApolloServerPluginUsageReportingDisabled
} from "apollo-server-core";

import {
  buildFederatedSchemaCostMap,
  CostDirectivesPlugin,
  SchemaCostMap
} from "../../../dist";
import { compose } from "./compose";

(async function () {
  const port = 4000;
  const isProd = process.env.NODE_ENV === "production";
  const apolloKey = process.env.APOLLO_KEY;
  let gatewayOptions: GatewayConfig;

  if (!apolloKey) {
    console.log("Head to https://studio.apollographql.com set-up your graph");

    await compose();

    gatewayOptions = {
      supergraphSdl: readFileSync(
        resolve(__dirname, "./supergraph.graphql")
      ).toString(),
      debug: isProd ? false : true
    };
  } else {
    gatewayOptions = {
      debug: isProd ? false : true
    };
  }

  const apolloUsageReportingPlugin = apolloKey
    ? ApolloServerPluginUsageReporting()
    : ApolloServerPluginUsageReportingDisabled();

  const gateway = new ApolloGateway(gatewayOptions);

  // Generate schema cost map on gateway start-up and when the schema reloads.
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

  const { url } = await server.listen({ port });
  console.log(`Server ready at ${url}`);
})();
