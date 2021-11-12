import { ApolloServer, gql } from "apollo-server";
import { ApolloServerPluginUsageReportingDisabled } from "apollo-server-core";
import { buildSubgraphSchema } from "@apollo/subgraph";

import { AddFullSdlToServiceResponsePlugin } from "../../../../dist";
import { Vehicle, vehicles } from "./data";

const port = 4003;

const typeDefs = gql`
  directive @cost(
    weight: String!
  ) on ARGUMENT_DEFINITION | ENUM | FIELD_DEFINITION | INPUT_FIELD_DEFINITION | OBJECT | SCALAR

  directive @listSize(
    assumedSize: Int
    requireOneSlicingArgument: Boolean = true
    sizedFields: [String!]
    slicingArguments: [String!]
  ) on FIELD_DEFINITION

  type Vehicle @key(fields: "id") {
    id: ID!
    model: String
  }

  extend type Query {
    vehicle(id: ID!): Vehicle
    vehicles: [Vehicle]
  }
`;

const resolvers = {
  Vehicle: {
    __resolveReference(reference: Pick<Vehicle, "id">) {
      return vehicles.find(vehicle => vehicle.id === reference.id);
    }
  },
  Query: {
    vehicle(root: any, { id }: { id: string }) {
      return vehicles.find(vehicle => vehicle.id === id);
    },
    vehicles(root, { limit }: { limit: number }, context, info) {
      if (limit) {
        return vehicles.slice(0, limit);
      }
      return vehicles;
    }
  }
};

const server = new ApolloServer({
  schema: buildSubgraphSchema([{ typeDefs, resolvers: resolvers as any }]),
  plugins: [
    ApolloServerPluginUsageReportingDisabled(),
    AddFullSdlToServiceResponsePlugin(typeDefs)
  ]
});

server.listen({ port }).then(({ url }) => {
  console.log(`Vehicles service ready at ${url}`);
});
