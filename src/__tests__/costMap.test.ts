import { buildFederatedSchemaCostMap } from "../costMap";

import { productsSdl, reviewsSdl, supergraphSdl } from "./schemas";

jest.mock("node-fetch", () =>
  jest.fn(url =>
    Promise.resolve({
      json: () => ({
        data: null,
        extensions: {
          sdlWithDirectives:
            url === "http://products" ? productsSdl : reviewsSdl
        }
      })
    })
  )
);

describe("Cost map", () => {
  it("Retrieves cost directives from subgraph SDLs", async () => {
    const costMap = await buildFederatedSchemaCostMap(supergraphSdl);
    expect(costMap).toMatchObject({
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
    });
  });
});
