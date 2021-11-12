import { ApolloError } from "apollo-server";
import { ApolloServerPlugin } from "apollo-server-plugin-base";
import { parse } from "graphql";

import {
  analyzeOperationResponse,
  analyzeOperationStatically
} from "./costAnalysis";

const MAX_FIELD_COST_PER_OPERATION = 100;

export function CostDirectivesPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart({
      context: { schemaCostMap },
      request: { variables, query },
      schema
    }) {
      if (!query) {
        return;
      }

      // Must parse operation manually to get fragment definitions
      const parsedOperation = parse(query);

      return {
        // At this point we know what operation to execute based on a
        // request's document AST but resolvers have not yet executed so
        // static query analysis happens here.
        async didResolveOperation({ operation }) {
          if (operation?.name?.value === "IntrospectionQuery") {
            return;
          }

          // The result of the static analysis on the operation will provide
          // upper bounds for the potential type costs and fields costs of the
          // query. Type cost roughly corresponds to how much data this query
          // might produce. Field cost corresponds to how much work might need
          // to be done to produce that data.
          //
          // Below, we will use field cost to determine whether to proceed with
          // executing the operation using arbitrary max. field cost allowed
          // per operation.
          //
          // See: https://mmatsa.com/blog/graphql-static-analysis-example-1/

          const staticOperationCosts = analyzeOperationStatically(
            parsedOperation,
            schema,
            schemaCostMap,
            variables
          );

          if (
            staticOperationCosts?.fieldCost &&
            staticOperationCosts?.fieldCost > MAX_FIELD_COST_PER_OPERATION
          ) {
            throw new ApolloError(
              `Estimated field cost of ${staticOperationCosts.fieldCost} exceeds maximum operation field cost of ${MAX_FIELD_COST_PER_OPERATION}.`
            );
          }

          // @TODO: Here, we could also use a client identifier to check the
          // cost against that client's rate limit for a given time window
          // to see if executing this operation may exceed the limit (and if
          // so, throw an error here as well).
        },
        // We have the response data so we can do query response analysis and
        // update rate limits.
        async willSendResponse({ operation, response }) {
          if (operation?.name?.value === "IntrospectionQuery") {
            return;
          }

          if (operation) {
            const responseOperationCosts = analyzeOperationResponse(
              parsedOperation,
              response,
              schema,
              schemaCostMap,
              variables
            );

            // @TODO, At this point, we finally deduct the true cost of the
            // operation from the client's rate limit.

            // Add the cost data to the extensions of the response so it's
            // accessible from the client. The GraphQL Cost Directives
            // specification suggests adding this to introspection, but that
            // hasn't been implemented in this solution yet.
            //
            // See: https://ibm.github.io/graphql-specs/cost-spec.html#sec-Introspection

            response.extensions = {
              ...response.extensions,
              operationCosts: responseOperationCosts
            };
          }
        }
      };
    }
  };
}
