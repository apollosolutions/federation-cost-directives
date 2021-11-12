import { buildSchema, parse } from "graphql";

import {
  analyzeOperationResponse,
  analyzeOperationStatically
} from "../costAnalysis";
import { apiSdl } from "./schemas";

const costMap = {
  "Product.tags": { weight: "2", assumedSize: 3 },
  "Query.product(id:)": { argumentType: "ID" },
  "Query.products": {
    slicingArguments: ["first", "last"],
    sizedFields: ["edges"],
    requireOneSlicingArgument: true
  },
  "Query.products(first:)": { argumentType: "Int" },
  "Query.products(last:)": { argumentType: "Int" },
  "Query.products(after:)": { argumentType: "ID" },
  "Query.products(before:)": { argumentType: "ID" },
  Review: { weight: "2" },
  "Review.content": { weight: "2" },
  "Product.reviews": { assumedSize: 5 }
};

const GET_PRODUCTS = `
  query GetProducts {
    products(first: 5, after: "1") {
      edges {
        node {
          id
          name
          tags
        }
      }
    }
  }
`;

const GET_PRODUCTS_WITH_VARIABLES = `
  query GetProducts($first: Int!, $after: ID!) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          name
          tags
        }
      }
    }
  }
`;

describe("Static analysis", () => {
  it("Checks operation for list arguments", () => {
    const documentAST = parse(GET_PRODUCTS);
    const schema = buildSchema(apiSdl);
    const costs = analyzeOperationStatically(documentAST, schema, costMap, {});
    expect(costs).toMatchObject({ typeCost: 12, fieldCost: 17 });
  });

  it("Checks operation variables for list arguments", () => {
    const documentAST = parse(GET_PRODUCTS_WITH_VARIABLES);
    const schema = buildSchema(apiSdl);
    const variables = { first: 5, after: "1" };
    const costs = analyzeOperationStatically(
      documentAST,
      schema,
      costMap,
      variables
    );
    expect(costs).toMatchObject({ typeCost: 12, fieldCost: 17 });
  });
});

describe("Response analysis", () => {
  it("Calculates true cost from operation response", () => {
    const documentAST = parse(GET_PRODUCTS);
    const schema = buildSchema(apiSdl);
    const response = {
      data: {
        products: {
          edges: [
            {
              node: {
                id: "2",
                name: "Chair",
                tags: ["modern", "black"]
              }
            },
            {
              node: {
                id: "3",
                name: "Table",
                tags: ["traditional", "red", "wood"]
              }
            },
            {
              node: {
                id: "4",
                name: "Bed",
                tags: ["rustic", "brown"]
              }
            }
          ]
        }
      }
    };
    const costs = analyzeOperationResponse(
      documentAST,
      response,
      schema,
      costMap,
      {}
    );
    expect(costs).toMatchObject({ typeCost: 8, fieldCost: 11 });
  });
});
