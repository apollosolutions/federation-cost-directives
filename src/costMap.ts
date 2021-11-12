import { gql } from "apollo-server";
import { ArgumentNode, ASTNode, DirectiveNode, visit } from "graphql";
import fetch from "node-fetch";

import {
  CostDirectiveData,
  NodeCount,
  ListSizeDirectiveData,
  SchemaCostMap
} from "./types";

function costFromDirective(
  directives: readonly DirectiveNode[] | undefined
): CostDirectiveData | undefined {
  if (!directives) {
    return undefined;
  }

  const costDirective = directives.find(
    (directive: DirectiveNode) => directive.name.value === "cost"
  );

  if (!costDirective) {
    return undefined;
  }

  const weight = costDirective?.arguments?.find(
    (argument: ArgumentNode) => argument.name.value === "weight"
  );

  return {
    weight:
      weight?.value &&
      "value" in weight.value &&
      typeof weight.value.value === "string"
        ? weight.value.value
        : undefined
  };
}

function hasExternalDirective(
  directives: DirectiveNode[] | undefined
): boolean {
  if (!directives) {
    return false;
  }

  const externalDirective = directives.find(
    directive => directive.name.value === "external"
  );

  return externalDirective ? true : false;
}

function listSizeFromDirective(
  directives: DirectiveNode[] | undefined
): ListSizeDirectiveData | undefined {
  if (!directives) {
    return undefined;
  }

  const listSizeDirective = directives.find(
    directive => directive.name.value === "listSize"
  );

  if (!listSizeDirective) {
    return undefined;
  }

  const assumedSize = listSizeDirective?.arguments?.find(
    argument => argument.name.value === "assumedSize"
  );
  const slicingArguments = listSizeDirective?.arguments?.find(
    argument => argument.name.value === "slicingArguments"
  );
  const sizedFields = listSizeDirective?.arguments?.find(
    argument => argument.name.value === "sizedFields"
  );
  const requireOneSlicingArgument = listSizeDirective?.arguments?.find(
    argument => argument.name.value === " requireOneSlicingArgument"
  );

  let requireOneSlicingArgumentValue;

  if (
    requireOneSlicingArgument?.value &&
    "value" in requireOneSlicingArgument.value &&
    (slicingArguments || sizedFields)
  ) {
    requireOneSlicingArgumentValue = requireOneSlicingArgument.value.value;
  } else if (slicingArguments || sizedFields) {
    requireOneSlicingArgumentValue = true;
  }

  return {
    ...(assumedSize?.value &&
      "value" in assumedSize.value &&
      typeof assumedSize.value.value === "string" && {
        assumedSize: parseInt(assumedSize.value.value)
      }),
    ...(slicingArguments?.value &&
      "values" in slicingArguments.value && {
        slicingArguments: slicingArguments.value.values
          .map(value =>
            "value" in value && typeof value.value === "string"
              ? value.value
              : ""
          )
          .filter(slicingArgument => slicingArgument !== "")
      }),
    ...(sizedFields?.value &&
      "values" in sizedFields.value && {
        sizedFields: sizedFields.value.values
          .map(value =>
            "value" in value && typeof value.value === "string"
              ? value.value
              : ""
          )
          .filter(sizeField => sizeField !== "")
      }),
    ...(typeof requireOneSlicingArgumentValue == "boolean" && {
      requireOneSlicingArgument: requireOneSlicingArgumentValue
    })
  };
}

function getDirectivesForNode(
  directives: readonly DirectiveNode[] | undefined
): NodeCount | undefined {
  const ignoredDirectives = [
    "cost",
    "external",
    "inaccessible",
    "key",
    "listSize",
    "provides",
    "requires",
    "tag"
  ];
  const directiveMap = {};

  if (!directives || !directives.length) {
    return undefined;
  }

  directives.forEach(directive => {
    const directiveName = directive.name.value;

    if (
      !ignoredDirectives.includes(directiveName) &&
      directive.arguments?.length
    ) {
      directive.arguments.forEach(arg => {
        const argName = arg.name.value;
        directiveMap[`@${directiveName}(${argName}:)`] = directiveMap[
          `@${directiveName}(${argName}:)`
        ]
          ? directiveMap[`@${directiveName}(${argName}:)`] + 1
          : 1;
      });
    } else if (!ignoredDirectives.includes(directiveName)) {
      directiveMap[`@${directiveName}`] = directiveMap[`@${directiveName}`]
        ? directiveMap[`@${directiveName}`] + 1
        : 1;
    }
  });

  if (!Object.keys(directiveMap).length) {
    return undefined;
  }

  return directiveMap;
}

function getNamedTypeFromAST(astNode: ASTNode): string | undefined {
  if (astNode.kind === "NamedType") {
    return astNode.name.value;
  } else if ("type" in astNode) {
    return getNamedTypeFromAST(astNode.type);
  }
  return undefined;
}

export function buildCostMap(sdl: string): SchemaCostMap {
  const documentNode = gql(sdl);
  const costMap: SchemaCostMap = {};

  const visitor = {
    enter(node: ASTNode) {
      if (
        node.kind === "InputObjectTypeDefinition" ||
        node.kind === "ObjectTypeDefinition" ||
        node.kind === "ObjectTypeExtension"
      ) {
        // Check type cost (but not for extended types)
        let typeCost: CostDirectiveData | undefined;
        if (node.kind !== "ObjectTypeExtension") {
          typeCost = costFromDirective(node.directives);
        }

        if (typeCost) {
          costMap[node.name.value] = typeCost;
        }

        const typeDirectives = getDirectivesForNode(node.directives);
        if (typeDirectives) {
          costMap[node.name.value] = costMap[node.name.value]
            ? { ...costMap[node.name.value], directives: typeDirectives }
            : { directives: typeDirectives };
        }

        node?.fields?.forEach(field => {
          // Ignore costs set on @external fields
          const isExternalField = hasExternalDirective(field.directives);

          if (!isExternalField) {
            // Check the type's field costs and list size
            const fieldCost = costFromDirective(field.directives);
            const listSize = listSizeFromDirective(field.directives);
            const fieldSchemaCoordinate = `${node.name.value}.${field.name.value}`;

            if (fieldCost || listSize) {
              costMap[fieldSchemaCoordinate] = {
                ...(fieldCost && fieldCost),
                ...(listSize && listSize)
              };
            }

            const fieldDirectives = getDirectivesForNode(field.directives);
            if (fieldDirectives) {
              costMap[fieldSchemaCoordinate] = costMap[fieldSchemaCoordinate]
                ? {
                    ...costMap[fieldSchemaCoordinate],
                    directives: fieldDirectives
                  }
                : { directives: fieldDirectives };
            }

            // Check the fields' argument costs (for fields on Object types only)
            if (field.arguments) {
              field.arguments.forEach(arg => {
                const fieldArgCost = costFromDirective(arg.directives);
                const fieldArgType = getNamedTypeFromAST(arg.type);
                const argSchemaCoordinate = `${node.name.value}.${field.name.value}(${arg.name.value}:)`;

                if (fieldArgCost) {
                  costMap[argSchemaCoordinate] = fieldArgCost;
                }

                if (fieldArgType) {
                  costMap[argSchemaCoordinate] = costMap[argSchemaCoordinate]
                    ? {
                        ...costMap[argSchemaCoordinate],
                        argumentType: fieldArgType
                      }
                    : { argumentType: fieldArgType };
                }

                if (listSize && arg.defaultValue?.value) {
                  costMap[argSchemaCoordinate] = costMap[argSchemaCoordinate]
                    ? {
                        ...costMap[argSchemaCoordinate],
                        defaultValue: arg.defaultValue.value
                      }
                    : { defaultValue: arg.defaultValue.value };
                }

                const argDirectives = getDirectivesForNode(arg.directives);
                if (argDirectives) {
                  costMap[argSchemaCoordinate] = costMap[argSchemaCoordinate]
                    ? {
                        ...costMap[argSchemaCoordinate],
                        directives: argDirectives
                      }
                    : { directives: argDirectives };
                }
              });
            }
          }
        });

        // Stop visiting node
        return false;
      } else if (
        node.kind === "ScalarTypeDefinition" ||
        node.kind === "EnumTypeDefinition"
      ) {
        const cost = costFromDirective(node.directives);

        if (!cost) {
          return false;
        }

        costMap[node.name.value] = cost;
        return;
      } else if (node.kind === "DirectiveDefinition") {
        // Collects costs of arguments on executable directives too
        if (node?.arguments?.length) {
          node.arguments.forEach(arg => {
            const directiveArgCost = costFromDirective(arg.directives);

            if (directiveArgCost) {
              costMap[`@${node.name.value}(${arg.name.value}:)`] =
                directiveArgCost;
            }
          });
        }

        return false;
      } else {
        return;
      }
    }
  };
  visit(documentNode, visitor);

  return costMap;
}

export async function buildFederatedSchemaCostMap(
  supergraphSdl: string
): Promise<SchemaCostMap> {
  const supergraphSchema = gql(supergraphSdl);
  const joinEnum = supergraphSchema.definitions.find(
    def => def.kind === "EnumTypeDefinition" && def.name.value === "join__Graph"
  );

  if (!joinEnum) {
    throw new Error('No "join__Graph" enum found in the supergraph SDL');
  }

  if ("values" in joinEnum && joinEnum.values && joinEnum.values.length) {
    const serviceUrls: string[] = joinEnum.values.map(value => {
      const joinGraphDirective: DirectiveNode | undefined = value.directives
        ? value.directives.find(directive => {
            return directive.name.value === "join__graph";
          })
        : undefined;
      const urlArg: ArgumentNode | undefined =
        joinGraphDirective && joinGraphDirective.arguments
          ? joinGraphDirective.arguments.find(arg => {
              return arg.name.value === "url";
            })
          : undefined;

      if (
        !urlArg ||
        !("value" in urlArg.value) ||
        typeof urlArg.value.value === "boolean"
      ) {
        throw new Error(
          'Can\'t get service URL from "join__graph" directive argument'
        );
      }

      return urlArg.value.value;
    });

    const responses = await Promise.all(
      serviceUrls.map(url =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ query: "query { _service { sdl } }" })
        })
      )
    );
    const data = await Promise.all(responses.map(res => res.json()));
    const subgraphSdls: (string | undefined)[] = data.map(({ extensions }) => {
      if (extensions?.sdlWithDirectives) {
        return extensions.sdlWithDirectives;
      } else {
        return undefined;
      }
    });

    return subgraphSdls.reduce((acc, sdl) => {
      if (sdl) {
        const costData = buildCostMap(sdl);
        return { ...acc, ...costData };
      }
      return acc;
    }, {});
  } else {
    throw new Error(
      'The "@join__graph" directive can\'t be found on any of the "join__Graph" enum values'
    );
  }
}
