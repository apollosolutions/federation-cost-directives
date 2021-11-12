import { ApolloServerPlugin } from "apollo-server-plugin-base";
import { DocumentNode, print } from "graphql";

export function AddFullSdlToServiceResponsePlugin(
  typeDefs: DocumentNode
): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async willSendResponse({ response }) {
          if (response.data?._service) {
            response.extensions = {
              ...(response.extensions && response.extensions),
              sdlWithDirectives: print(typeDefs)
            };
          }
        }
      };
    }
  };
}
