import { ApolloServer, gql } from "apollo-server";
import { ApolloServerPluginUsageReportingDisabled } from "apollo-server-core";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { SchemaDirectiveVisitor } from "@graphql-tools/utils";

import { AddFullSdlToServiceResponsePlugin } from "../../../../dist";
import { Astronaut, Mission, missions } from "./data";
import { DateTimeType } from "./DateTimeType";
import { CasingDirective } from "./CasingDirective";

const port = 4002;

interface MissionFilter {
  filter: {
    type: string;
    year: string;
  };
}

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

  directive @casing(type: CasingType! @cost(weight: "2.0")) on FIELD_DEFINITION

  scalar DateTime @cost(weight: "2.5")

  enum CasingType {
    LOWER
    UPPER
  }

  enum MissionType @cost(weight: "1.5") {
    ACCIDENT
    CREWED_EARTH_ORBITING
    LUNAR_ORBITING
    LUNAR_LANDING
    UNCREWED_EARTH_ORBITING
  }

  input MissionFilter {
    type: MissionType!
    year: String @cost(weight: "3.0")
  }

  type Mission {
    id: ID!
    crew: [Astronaut] @listSize(assumedSize: 3)
    designation: String! @casing(type: UPPER) @casing(type: LOWER)
    startDate: DateTime
    endDate: DateTime
    vehicle: Vehicle!
  }

  # Costs on extended types and external fields are ignored
  extend type Astronaut @key(fields: "id") @cost(weight: "2.0") {
    id: ID! @external @cost(weight: "3.0")
    missions: [Mission] @listSize(assumedSize: 1)
  }

  extend type Vehicle @key(fields: "id") {
    id: ID! @external
  }

  extend type Query {
    mission(id: ID!): Mission
    missions(filter: MissionFilter @cost(weight: "4.0")): [Mission]
      @listSize(assumedSize: 15)
  }
`;

const resolvers = {
  DateTime: DateTimeType,
  Astronaut: {
    missions(astronaut: Astronaut) {
      return missions.filter(({ crew }) => crew.includes(astronaut.id));
    }
  },
  Mission: {
    crew(mission: Mission) {
      return mission.crew.map(id => ({ __typename: "Astronaut", id }));
    },
    vehicle(mission: Mission) {
      return { __typename: "Vehicle", id: mission.vehicleID };
    }
  },
  Query: {
    mission(root: any, { id }: { id: string }) {
      return missions.find(mission => mission.id === id);
    },
    missions(root: any, { filter }: MissionFilter) {
      let type, year;

      if (filter) {
        ({ type, year } = filter);
      }

      if (!type) {
        return missions;
      } else if (type && year) {
        return missions.filter(mission => {
          if (mission.startDate) {
            return (
              mission.type === type && mission.startDate.split("-")[0] === year
            );
          } else {
            return false;
          }
        });
      } else {
        return missions.filter(mission => mission.type === type);
      }
    }
  }
};

const schema = buildSubgraphSchema([{ typeDefs, resolvers: resolvers as any }]);
SchemaDirectiveVisitor.visitSchemaDirectives(schema, {
  casing: CasingDirective
});

const server = new ApolloServer({
  schema,
  plugins: [
    ApolloServerPluginUsageReportingDisabled(),
    AddFullSdlToServiceResponsePlugin(typeDefs)
  ]
});

server.listen({ port }).then(({ url }) => {
  console.log(`Missions service ready at ${url}`);
});
