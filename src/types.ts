import { ArgumentNode, DocumentNode, GraphQLSchema } from "graphql";
import { GraphQLResponse, VariableValues } from "apollo-server-types";

// Operation Counts and Costs

export interface OperationCountInputs {
  documentAST: DocumentNode;
  response?: GraphQLResponse | undefined;
  schema: GraphQLSchema;
  schemaCostMap: SchemaCostMap;
  variables?: VariableValues | undefined;
}

export interface NodeCount {
  [schemaCoordinate: string]: number;
}

export interface OperationCountData {
  typeCounts: NodeCount;
  fieldCounts: NodeCount;
  fieldArgCounts?: NodeCount;
  directiveCounts?: NodeCount;
  directiveArgCounts?: NodeCount;
  inputTypeCounts?: NodeCount;
  inputFieldCounts?: NodeCount;
}

export interface OperationCostData {
  typeCost: number;
  fieldCost: number;
}

// Schema Cost Map

export interface CostData extends CostDirectiveData, ListSizeDirectiveData {
  argumentType?: string;
  defaultValue?: string;
  directives?: NodeCount;
}

export interface CostDataForSizeField {
  listCostData: CostData;
  arguments: ArgumentNode;
}

export interface CostDirectiveData {
  weight?: string;
}

export interface ListSizeDirectiveData {
  assumedSize?: number;
  requireOneSlicingArgument?: boolean;
  sizedFields?: string[];
  slicingArguments?: string[];
}

export interface ListSizeAndOperationOptions {
  assumedSize?: number;
  fieldArgs?: readonly ArgumentNode[];
  slicingArguments?: string[];
  slicingArgDefaultValues?: SlicingArgumentDefaultValue;
  variables?: VariableValues | undefined;
}

export interface SchemaCostMap {
  [schemaCoordinate: string]: CostData;
}

export interface SlicingArgumentDefaultValue {
  [argumentName: string]: CostData;
}
