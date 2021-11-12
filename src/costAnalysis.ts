import {
  ArgumentNode,
  BREAK,
  DocumentNode,
  FieldNode,
  getNamedType,
  GraphQLSchema,
  isCompositeType,
  isScalarType,
  isEnumType,
  TypeInfo,
  visit,
  visitWithTypeInfo,
  GraphQLNamedType,
  ObjectFieldNode,
  VariableDefinitionNode
} from "graphql";
import {
  CostData,
  ListSizeAndOperationOptions,
  NodeCount,
  OperationCostData,
  OperationCountData,
  OperationCountInputs,
  SchemaCostMap,
  SlicingArgumentDefaultValue
} from "./types";
import get from "lodash/get";
import { GraphQLResponse, VariableValues } from "apollo-server-types";

function findSlicingArgument(
  slicingArgName: string,
  variables: VariableValues
): string | undefined {
  let slicingArgValue: string | undefined;

  Object.keys(variables).some((key: string) => {
    if (key === slicingArgName) {
      slicingArgValue = variables[key];
      return true;
    } else if (variables[key] && typeof variables[key] === "object") {
      slicingArgValue = findSlicingArgument(slicingArgName, variables[key]);
      return slicingArgValue !== undefined;
    }
    return false;
  });

  return slicingArgValue;
}

function getListSizeFromArgs({
  assumedSize,
  fieldArgs,
  slicingArguments,
  slicingArgDefaultValues,
  variables
}: ListSizeAndOperationOptions): number {
  if (assumedSize) {
    return assumedSize;
  } else if (slicingArguments) {
    // When multiple slicing arguments are defined and a query contains more
    // than one, static analysis should consider their largest value to ensure
    // producing upper bounds.
    if (fieldArgs?.length) {
      return fieldArgs
        .filter((arg: ArgumentNode) =>
          slicingArguments.includes(arg.name.value)
        )
        .reduce((acc: number, arg: ArgumentNode) => {
          let argValue = 1;

          if (variables && arg.value.kind === "Variable") {
            const slicingArgValue = findSlicingArgument(
              arg.name.value,
              variables
            );
            if (slicingArgValue) {
              argValue = parseInt(slicingArgValue);
            }
          } else if (
            "value" in arg.value &&
            typeof arg.value.value === "string"
          ) {
            argValue = parseInt(arg.value.value);
          }

          return argValue > acc ? argValue : acc;
        }, 1);
    } else if (slicingArgDefaultValues && slicingArguments) {
      return slicingArguments
        .map(arg => parseInt(slicingArgDefaultValues[arg].defaultValue!))
        .reduce((acc: number, curr: number) => {
          return curr > acc ? curr : acc;
        }, 1);
    }
  }
  return 1;
}

function isCountable(
  namedType: GraphQLNamedType,
  schemaCostMap: SchemaCostMap,
  typeCoordinate: string
): boolean {
  const isScalar = isScalarType(namedType);
  const isEnum = isEnumType(namedType);

  return (
    (!isEnum && !isScalar) ||
    (isEnum && typeCoordinate in schemaCostMap) ||
    (isScalar && typeCoordinate in schemaCostMap)
  );
}

function getOperationCounts(inputs: OperationCountInputs): OperationCountData {
  const { documentAST, response, schema, schemaCostMap, variables } = inputs;
  const typeInfo = new TypeInfo(schema);
  let listCostDataForSizedField: {
    [parentCoordinate: string]: {
      listCostData: CostData;
      arguments?: readonly ArgumentNode[];
    };
  } = {};
  let parentFieldTracker: Array<{
    fieldName: string;
    size: number;
    typename: string;
  }> = [];

  const typeCounts: NodeCount = {};
  const fieldCounts: NodeCount = {};
  const fieldArgCounts: NodeCount = {};
  const directiveCounts: NodeCount = {};
  const directiveArgCounts: NodeCount = {};
  const inputTypeCounts: NodeCount = {};
  const inputFieldCounts: NodeCount = {};

  const visitor = {
    // TOP-LEVEL
    OperationDefinition: {
      enter() {
        // The response data was null, so stop traversal.
        if (response && !response.data) {
          return BREAK;
        }

        const type = typeInfo.getType();
        const schemaCoordinate = String(type);
        typeCounts[schemaCoordinate] = 1;
      }
    },
    // FIELDS
    Field: {
      enter(node: FieldNode) {
        const parentType = typeInfo.getParentType();
        const type = typeInfo.getType();

        if (!type) {
          return;
        }

        const namedType = getNamedType(type);
        const typeCoordinate = String(namedType);
        const fieldName = node.name.value;
        const fieldCoordinate = `${String(parentType)}.${fieldName}`;
        let fieldSize = 1;

        // Get the estimated or actual field size.
        if (response) {
          // Check if the current field matches the previously set sized field.
          // QUERY RESPONSE ANALYSIS
          // Get the actual field sizes from response to get the true cost.
          // @TODO: Exclude null fields in response?
          if (response.data) {
            const responsePath = parentFieldTracker.reduce(
              (acc: string[], curr) => {
                acc.push(curr.fieldName);
                if (curr.size > 1) {
                  acc.push("0");
                }
                return acc;
              },
              []
            );
            const fieldData = get(response.data, [...responsePath, fieldName]);

            if (Array.isArray(fieldData)) {
              fieldSize = fieldData.length;
            }
          }
        } else {
          // STATIC QUERY ANALYSIS
          // Get data from @listCost directive to estimate field sizes.
          const listCostData = schemaCostMap[fieldCoordinate];

          // Bail if too many slicing arguments were submitted for this field.
          if (listCostData?.requireOneSlicingArgument) {
            let submittedSlicingArgs: string[] = [];

            if (node.arguments?.length && node.arguments.length > 1) {
              submittedSlicingArgs = node.arguments
                .map(arg => arg.name.value)
                .filter(argName =>
                  listCostData.slicingArguments?.includes(argName)
                );
            }

            if (submittedSlicingArgs.length > 1)
              throw new Error(
                `Only one slicing argument is allowed for the ${fieldCoordinate} field`
              );
          }

          // Check if the current field matches the previously set sized field.
          const sizedFieldsParentCoordinate = Object.keys(
            listCostDataForSizedField
          )[0];
          const sizedFieldsListCostData = sizedFieldsParentCoordinate
            ? listCostDataForSizedField[sizedFieldsParentCoordinate]
                .listCostData
            : undefined;
          const sizedFieldsArguments = sizedFieldsParentCoordinate
            ? listCostDataForSizedField[sizedFieldsParentCoordinate].arguments
            : undefined;
          const isSizedField =
            sizedFieldsListCostData?.sizedFields?.includes(fieldName) ?? false;

          // Get field size from @listCost directive or sized field data
          if ((listCostData && !listCostData.sizedFields) || isSizedField) {
            let assumedSize: number | undefined,
              slicingArguments: string[] | undefined;

            if (isSizedField) {
              ({ assumedSize, slicingArguments } = sizedFieldsListCostData!);

              const updatedSizedFields =
                sizedFieldsListCostData?.sizedFields?.filter(
                  field => field !== fieldName
                ) ?? [];

              if (updatedSizedFields.length) {
                listCostDataForSizedField[
                  sizedFieldsParentCoordinate
                ].listCostData.sizedFields = updatedSizedFields;
              } else {
                listCostDataForSizedField = {};
              }
            } else {
              ({ assumedSize, slicingArguments } = listCostData);
            }

            const slicingArgDefaultValues:
              | SlicingArgumentDefaultValue
              | undefined = slicingArguments
              ? slicingArguments.reduce((acc, arg) => {
                  const fieldCostData =
                    schemaCostMap[
                      `${
                        isSizedField
                          ? sizedFieldsParentCoordinate
                          : fieldCoordinate
                      }(${arg}:)`
                    ];
                  acc[arg] = fieldCostData;
                  return acc;
                }, {})
              : undefined;

            fieldSize = getListSizeFromArgs({
              assumedSize,
              fieldArgs: sizedFieldsArguments
                ? sizedFieldsArguments
                : node.arguments,
              slicingArguments,
              slicingArgDefaultValues,
              variables
            });
          } else if (listCostData?.sizedFields) {
            // This field will have children that are sized fields so cache its
            // @listCost data for later.
            listCostDataForSizedField = {
              [fieldCoordinate]: { arguments: node.arguments, listCostData }
            };
          }
        }

        // Keep track of the parent fields' multiplier as fields are visited.
        if (isCompositeType(namedType)) {
          parentFieldTracker.push({
            fieldName,
            size: fieldSize,
            typename: typeCoordinate
          });
        } else if (
          parentFieldTracker.length &&
          parentFieldTracker[parentFieldTracker.length - 1].typename !==
            `${String(parentType)}`
        ) {
          parentFieldTracker.pop();
        }

        const totalFieldSize = parentFieldTracker.length
          ? parentFieldTracker.reduce((acc, curr, i, arr) => {
              if (isCompositeType(namedType) && i === arr.length - 1) {
                return acc;
              }
              return curr.size * acc;
            }, 1)
          : 1;

        // Only count composite types or scalars and enums with costs applied.
        if (isCountable(namedType, schemaCostMap, typeCoordinate)) {
          // Increment type count for the field type
          typeCounts[typeCoordinate] = typeCounts[typeCoordinate]
            ? typeCounts[typeCoordinate] + totalFieldSize * fieldSize
            : totalFieldSize * fieldSize;
        }

        // @TODO Get directive counts for types? (Not outlined in spec.)

        // Only count fields that output composite types or scalars and enums
        // with costs applied.
        if (isCountable(namedType, schemaCostMap, fieldCoordinate)) {
          // Increment field count.
          fieldCounts[fieldCoordinate] = fieldCounts[fieldCoordinate]
            ? fieldCounts[fieldCoordinate] + totalFieldSize
            : totalFieldSize;

          // Increment field argument counts.
          if (node?.arguments?.length) {
            node.arguments.forEach(arg => {
              const fieldArgCoordinate = `${fieldCoordinate}(${arg.name.value}:)`;
              fieldArgCounts[fieldArgCoordinate] = fieldArgCounts[
                fieldArgCoordinate
              ]
                ? fieldArgCounts[fieldArgCoordinate] + totalFieldSize
                : totalFieldSize;
            });
          }

          // Increment operation directive counts.
          if (node?.directives?.length) {
            node.directives.forEach(directive => {
              const directiveCoordinate = `${fieldCoordinate}@${directive.name.value}`;
              directiveCounts[directiveCoordinate] = directiveCounts[
                directiveCoordinate
              ]
                ? directiveCounts[directiveCoordinate] + totalFieldSize
                : totalFieldSize;

              // Increment operation directive argument counts.
              if (directive?.arguments?.length) {
                directive.arguments.forEach(arg => {
                  const directiveArgCoordinate = `${fieldCoordinate}@${directive.name.value}(${arg.name.value}:)`;
                  directiveArgCounts[directiveArgCoordinate] =
                    directiveArgCounts[directiveArgCoordinate]
                      ? directiveArgCounts[directiveArgCoordinate] +
                        totalFieldSize
                      : totalFieldSize;
                });
              }
            });
          }

          // Increment type system directive counts.
          let typeSystemDirectives;

          if (schemaCostMap[fieldCoordinate]) {
            ({ directives: typeSystemDirectives } =
              schemaCostMap[fieldCoordinate]);
          }

          if (typeSystemDirectives) {
            for (const directive in typeSystemDirectives) {
              const directiveCoordinate = `${fieldCoordinate}${directive}`;
              const directiveCount = typeSystemDirectives[directive];
              const totalDirectiveCountForField =
                totalFieldSize * directiveCount;

              // Increment type system directive argument counts.
              if (directiveCoordinate.includes(":)")) {
                const [directiveCoordinateNoArg] =
                  directiveCoordinate.split(/(?=\()/g);

                // Only count the total applications of the directive once per
                // field (no matter how many arguments it has, but base the
                // count off of the maximally used argument).
                if (directiveCounts[directiveCoordinateNoArg]) {
                  directiveCounts[directiveCoordinateNoArg] = Math.max(
                    directiveCounts[directiveCoordinateNoArg],
                    totalDirectiveCountForField
                  );
                } else {
                  directiveCounts[directiveCoordinateNoArg] =
                    totalDirectiveCountForField;
                }

                directiveArgCounts[directiveCoordinate] =
                  totalDirectiveCountForField;
              } else {
                directiveCounts[directiveCoordinate] =
                  totalDirectiveCountForField;
              }
            }
          }
        }
      }
    },
    // INPUTS
    ObjectValue: {
      enter() {
        const inputType = typeInfo.getInputType();

        if (!inputType) {
          return;
        }

        const namedInputType = getNamedType(inputType);
        const inputTypeCoordinate = String(namedInputType);

        // Only count composite types or scalars and enums with costs applied.
        if (isCountable(namedInputType, schemaCostMap, inputTypeCoordinate)) {
          // Increment the input type count.
          inputTypeCounts[inputTypeCoordinate] = inputTypeCounts[
            inputTypeCoordinate
          ]
            ? inputTypeCounts[inputTypeCoordinate] + 1
            : 1;
        }
      }
    },
    ObjectField: {
      enter(node: ObjectFieldNode) {
        const inputParentType = typeInfo.getParentInputType();
        const inputType = typeInfo.getInputType();

        if (!inputType) {
          return;
        }

        const namedInputType = getNamedType(inputType);
        const inputTypeCoordinate = String(namedInputType);
        const inputFieldCoordinate = `${String(inputParentType)}.${
          node.name.value
        }`;

        // Only count composite types or scalars and enums with costs applied.
        if (isCountable(namedInputType, schemaCostMap, inputTypeCoordinate)) {
          // Increment type count for the input field's type.
          typeCounts[inputTypeCoordinate] = typeCounts[inputTypeCoordinate]
            ? typeCounts[inputTypeCoordinate] + 1
            : 1;
        }

        // Only count fields that output composite types or scalars and enums
        // with costs applied.
        if (isCountable(namedInputType, schemaCostMap, inputFieldCoordinate)) {
          // Increment input field count.
          inputFieldCounts[inputFieldCoordinate] = inputFieldCounts[
            inputFieldCoordinate
          ]
            ? inputFieldCounts[inputFieldCoordinate] + 1
            : 1;
        }
      }
    },
    // VARIABLES
    VariableDefinition: {
      enter(node: VariableDefinitionNode) {
        const inputType = typeInfo.getInputType();

        if (!inputType) {
          return;
        }

        const namedInputType = getNamedType(inputType);
        const inputTypeCoordinate = String(namedInputType);

        // Only count composite types or scalars and enums with costs applied.
        if (isCountable(namedInputType, schemaCostMap, inputTypeCoordinate)) {
          // Increment type count for the variable's type.
          inputTypeCounts[inputTypeCoordinate] = inputTypeCounts[
            inputTypeCoordinate
          ]
            ? inputTypeCounts[inputTypeCoordinate] + 1
            : 1;
        }

        if (
          "getFields" in namedInputType &&
          typeof namedInputType.getFields === "function"
        ) {
          const inputTypeFields = namedInputType.getFields();
          const variableName = node.variable.name.value;
          const variableFields = variables?.[variableName]
            ? Object.keys(variables[variableName]).map(
                name => inputTypeFields[name]
              )
            : [];

          variableFields.forEach(field => {
            const variableFieldCoordinate = `${String(inputType)}.${
              field.name
            }`;
            const namedVariableFieldType = getNamedType(field.type);
            const variableTypeCoordinate = String(namedVariableFieldType);

            // Only count composite types or scalars and enums with costs
            // applied.
            const isScalarField = isScalarType(namedInputType);
            const isEnumField = isEnumType(namedInputType);

            if (
              (!isEnumField && !isScalarField) ||
              (isEnumField && variableTypeCoordinate in schemaCostMap) ||
              (isScalarField && variableTypeCoordinate in schemaCostMap)
            ) {
              // Increment type count for the input field's type.
              typeCounts[variableTypeCoordinate] = typeCounts[
                variableTypeCoordinate
              ]
                ? typeCounts[variableTypeCoordinate] + 1
                : 1;
            }

            // Only count fields that output composite types and scalars or
            // enums with costs applied.
            if (
              (!isEnumField && !isScalarField) ||
              (isEnumField && variableFieldCoordinate in schemaCostMap) ||
              (isScalarField && variableFieldCoordinate in schemaCostMap)
            ) {
              // Increment input field count.
              inputFieldCounts[variableFieldCoordinate] = inputFieldCounts[
                variableFieldCoordinate
              ]
                ? inputFieldCounts[variableFieldCoordinate] + 1
                : 1;
            }
          });
        }
      }
    }
  };

  visit(documentAST, visitWithTypeInfo(typeInfo, visitor));

  return {
    typeCounts,
    fieldCounts,
    fieldArgCounts,
    directiveCounts,
    directiveArgCounts,
    inputTypeCounts,
    inputFieldCounts
  };
}

function getOperationCosts(
  operationCounts: OperationCountData,
  schemaCostMap: SchemaCostMap
): OperationCostData {
  const costs: OperationCostData = { typeCost: 0, fieldCost: 0 };
  const fieldArgCountKeys =
    operationCounts.fieldArgCounts &&
    Object.keys(operationCounts.fieldArgCounts);
  const inputFieldCountKeys =
    operationCounts.inputFieldCounts &&
    Object.keys(operationCounts.inputFieldCounts);
  const directiveArgCountKeys =
    operationCounts.directiveArgCounts &&
    Object.keys(operationCounts.directiveArgCounts);

  // Calculate type cost.
  for (const typeCoordinate in operationCounts.typeCounts) {
    let weight = 1.0;
    if (
      schemaCostMap[typeCoordinate] &&
      "weight" in schemaCostMap[typeCoordinate]
    ) {
      weight = parseFloat(schemaCostMap[typeCoordinate].weight!);
    }

    costs.typeCost =
      costs.typeCost + operationCounts.typeCounts[typeCoordinate] * weight;
  }

  // @TODO Get directive costs for types? (Not outlined in spec.)
  costs.typeCost = Math.max(0, costs.typeCost);

  // Calculate field cost.
  for (const fieldCoordinate in operationCounts.fieldCounts) {
    const fieldNamePattern = new RegExp(fieldCoordinate);
    let totalFieldCost = 0;

    // Get the cost of the field itself.
    let fieldWeight = 1.0;

    if (schemaCostMap[fieldCoordinate]?.weight) {
      fieldWeight = parseFloat(schemaCostMap[fieldCoordinate].weight!);
    }
    totalFieldCost = operationCounts.fieldCounts[fieldCoordinate] * fieldWeight;

    // Get field argument costs.
    if (fieldArgCountKeys) {
      fieldArgCountKeys.forEach(fieldArgCoordinate => {
        if (fieldNamePattern.test(fieldArgCoordinate)) {
          const fieldArgCostData = schemaCostMap[fieldArgCoordinate];

          if (fieldArgCostData?.weight) {
            totalFieldCost =
              totalFieldCost +
              operationCounts.fieldCounts[fieldCoordinate] *
                parseFloat(fieldArgCostData.weight);
          }

          // Get the input field costs for the field argument.
          if (inputFieldCountKeys && fieldArgCostData.argumentType) {
            const fieldArgNamePattern = new RegExp(
              fieldArgCostData.argumentType
            );

            inputFieldCountKeys.forEach(inputFieldArgCoordinate => {
              if (fieldArgNamePattern.test(inputFieldArgCoordinate)) {
                const inputFieldArgCostData =
                  schemaCostMap[inputFieldArgCoordinate];

                if (inputFieldArgCostData.weight) {
                  totalFieldCost =
                    totalFieldCost +
                    operationCounts.fieldCounts[fieldCoordinate] *
                      parseFloat(inputFieldArgCostData.weight);
                }
              }
            });
          }
        }
      });
    }

    // Get field directive and directive argument costs.
    if (directiveArgCountKeys) {
      directiveArgCountKeys.forEach(fieldDirectiveArgCoordinate => {
        if (fieldNamePattern.test(fieldDirectiveArgCoordinate)) {
          const directiveArgCoordinate = fieldDirectiveArgCoordinate.substring(
            fieldDirectiveArgCoordinate.indexOf("@")
          );
          const directiveArgCostData = schemaCostMap[directiveArgCoordinate];

          const directiveArgCount = operationCounts.directiveArgCounts
            ? operationCounts.directiveArgCounts[fieldDirectiveArgCoordinate]
            : undefined;

          if (directiveArgCount && directiveArgCostData?.weight) {
            totalFieldCost =
              totalFieldCost +
              directiveArgCount * parseFloat(directiveArgCostData.weight);
          }
        }
      });
    }

    // Add the total cost of this field to the running total for all fields.
    costs.fieldCost = costs.fieldCost + Math.max(0, totalFieldCost);
  }

  return costs;
}

export function analyzeOperationStatically(
  documentAST: DocumentNode,
  schema: GraphQLSchema,
  schemaCostMap: SchemaCostMap,
  variables: VariableValues | undefined
): OperationCostData | undefined {
  const operationCounts = getOperationCounts({
    documentAST,
    schema,
    schemaCostMap,
    variables
  });
  return getOperationCosts(operationCounts, schemaCostMap);
}

export function analyzeOperationResponse(
  documentAST: DocumentNode,
  response: GraphQLResponse,
  schema: GraphQLSchema,
  schemaCostMap: SchemaCostMap,
  variables: VariableValues | undefined
): OperationCostData | undefined {
  const operationCounts = getOperationCounts({
    documentAST,
    schema,
    schemaCostMap,
    variables,
    response
  });
  return getOperationCosts(operationCounts, schemaCostMap);
}
