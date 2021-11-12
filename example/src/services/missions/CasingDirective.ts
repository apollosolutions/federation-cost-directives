import { defaultFieldResolver } from "graphql";
import { SchemaDirectiveVisitor } from "@graphql-tools/utils";

export class CasingDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    const { resolve = defaultFieldResolver } = field;
    const { type } = this.args;

    field.resolve = async function (...args) {
      const result = await resolve.apply(this, args);
      if (typeof result === "string") {
        return type === "UPPER"
          ? result.toUpperCase()
          : result.toLocaleLowerCase();
      }
      return result;
    };
  }
}
