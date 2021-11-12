import { ApolloServer, gql } from "apollo-server";
import { ApolloServerPluginUsageReportingDisabled } from "apollo-server-core";
import { buildSubgraphSchema } from "@apollo/subgraph";

import { AddFullSdlToServiceResponsePlugin } from "../../../../dist";
import { Astronaut, astronauts } from "./data";

const port = 4001;

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

  type Astronaut @key(fields: "id") @cost(weight: "2.0") {
    id: ID!
    name: String @cost(weight: "1.5")
  }

  type AstronautEdge {
    node: Astronaut
  }

  type AstronautConnection {
    edges: [AstronautEdge]
  }

  extend type Query {
    astronaut(id: ID!): Astronaut
    astronauts(first: Int = 5): AstronautConnection
      @listSize(sizedFields: ["edges"], slicingArguments: ["first"])
  }
`;

const resolvers = {
  Astronaut: {
    __resolveReference(reference: Pick<Astronaut, "id">) {
      return astronauts.find(astronaut => astronaut.id === reference.id);
    }
  },
  Query: {
    astronaut(root: any, { id }: { id: string }) {
      return astronauts.find(astronaut => astronaut.id === id);
    },
    astronauts(root: any, { first }: { first: number }) {
      if (first) {
        return {
          edges: astronauts
            .slice(0, first)
            .map(astronaut => ({ node: astronaut }))
        };
      }
      return { edges: astronauts.map(astronaut => ({ node: astronaut })) };
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
  console.log(`Astronauts service ready at ${url}`);
});
