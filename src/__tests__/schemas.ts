export const productsSdl = `
directive @cost(weight: String!) on 
  | ARGUMENT_DEFINITION
  | ENUM
  | FIELD_DEFINITION
  | INPUT_FIELD_DEFINITION
  | OBJECT
  | SCALAR

directive @listSize(
  assumedSize: Int,
  slicingArguments: [String!],
  sizedFields: [String!],
  requireOneSlicingArgument: Boolean = true
) on FIELD_DEFINITION

type Product @key(fields: "id") {
  id: ID!
  name: String
  tags: [String] @cost(weight: "2") @listSize(assumedSize: 3)
}

type ProductEdge {
  cursor: ID
  node: Product
}

type ProductConnection {
  edges: [ProductEdge]
}

type Query {
  product(id: ID!): Product
  products(first: Int, last: Int, after: ID, before: ID): ProductConnection @listSize(
      slicingArguments: ["first", "last"],
      sizedFields: ["edges"],
      requireOneSlicingArgument: true
    )
}
`;

export const reviewsSdl = `
directive @cost(weight: String!) on 
  | ARGUMENT_DEFINITION
  | ENUM
  | FIELD_DEFINITION
  | INPUT_FIELD_DEFINITION
  | OBJECT
  | SCALAR

directive @listSize(
  assumedSize: Int,
  slicingArguments: [String!],
  sizedFields: [String!],
  requireOneSlicingArgument: Boolean = true
) on FIELD_DEFINITION

type Review @cost(weight: "2") {
  id: ID!
  content: String @cost(weight: "2")
  product: Product
}

extend type Product @key(fields: "id") {
  id: ID! @external
  reviews: [Review] @listSize(assumedSize: 5)
}
`;

export const apiSdl = `
type Product {
  id: ID!
  name: String
  reviews: [Review]
  tags: [String]
}

type ProductConnection {
  edges: [ProductEdge]
}

type ProductEdge {
  cursor: ID
  node: Product
}

type Query {
  product(id: ID!): Product
  products(after: ID, before: ID, first: Int, last: Int): ProductConnection
}

type Review {
  content: String
  id: ID!
  product: Product
}
`;

export const supergraphSdl = `
schema
  @core(feature: "https://specs.apollo.dev/core/v0.2"),
  @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
{
  query: Query
}

directive @core(as: String, feature: String!, for: core__Purpose) repeatable on SCHEMA

directive @join__field(graph: join__Graph, provides: join__FieldSet, requires: join__FieldSet) on FIELD_DEFINITION

directive @join__graph(name: String!, url: String!) on ENUM_VALUE

directive @join__owner(graph: join__Graph!) on INTERFACE | OBJECT

directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on INTERFACE | OBJECT

type Product
  @join__owner(graph: PRODUCTS)
  @join__type(graph: PRODUCTS, key: "id")
  @join__type(graph: REVIEWS, key: "id")
{
  id: ID! @join__field(graph: PRODUCTS)
  name: String @join__field(graph: PRODUCTS)
  reviews: [Review] @join__field(graph: REVIEWS)
  tags: [String] @join__field(graph: PRODUCTS)
}

type ProductConnection {
  edges: [ProductEdge]
}

type ProductEdge {
  cursor: ID
  node: Product
}

type Query {
  product(id: ID!): Product @join__field(graph: PRODUCTS)
  products(after: ID, before: ID, first: Int, last: Int): ProductConnection @join__field(graph: PRODUCTS)
}

type Review {
  content: String
  id: ID!
  product: Product
}

enum core__Purpose {
  """
  \`EXECUTION\` features provide metadata necessary to for operation execution.
  """
  EXECUTION

  """
  \`SECURITY\` features provide metadata necessary to securely resolve fields.
  """
  SECURITY
}

scalar join__FieldSet

enum join__Graph {
  PRODUCTS @join__graph(name: "products" url: "http://products")
  REVIEWS @join__graph(name: "reviews" url: "http://reviews")
}
`;
