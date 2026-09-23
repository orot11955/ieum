import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const forbiddenBackend =
  /^(?:@ieum\/(?:backend|db|database)(?:\/|$)|@nestjs\/|(?:drizzle-orm|pg|postgres)(?:\/|$))/;

function sourceFiles(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) return [];
      if (entry.isDirectory()) return sourceFiles(target);
      return entry.isFile() &&
        /\.[cm]?[jt]sx?$/.test(entry.name) &&
        !/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
        ? [target]
        : [];
    });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function importsIn(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")
      ) {
        found.push(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

export function findBoundaryViolations(root = defaultRoot) {
  const groups = [
    ["core", path.join(root, "packages/core/src")],
    ["web", path.join(root, "apps/web/src")],
    ["web", path.join(root, "packages/ui/src")],
    ["delivery", path.join(root, "packages/contracts/src/delivery")],
  ];
  const violations = [];
  for (const [group, directory] of groups) {
    const files =
      group === "delivery"
        ? [
            path.join(root, "packages/contracts/src/delivery.ts"),
            ...sourceFiles(directory),
          ]
        : sourceFiles(directory);
    for (const file of files) {
      try {
        readFileSync(file, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      for (const specifier of importsIn(file)) {
        const relative = specifier.startsWith(".");
        const resolved = relative
          ? path.resolve(path.dirname(file), specifier)
          : "";
        const backendPath =
          resolved.includes(
            `${path.sep}packages${path.sep}backend${path.sep}`,
          ) ||
          resolved.includes(`${path.sep}apps${path.sep}api${path.sep}`) ||
          resolved.includes(`${path.sep}apps${path.sep}worker${path.sep}`);
        const corePath = resolved.startsWith(
          path.join(root, "packages/core") + path.sep,
        );
        const forbidden =
          group === "core"
            ? !relative ||
              !resolved.startsWith(
                path.join(root, "packages/core/src") + path.sep,
              )
            : forbiddenBackend.test(specifier) ||
              backendPath ||
              (group === "delivery" &&
                (specifier.startsWith("@ieum/core") ||
                  corePath ||
                  specifier.includes("management")));
        if (forbidden)
          violations.push(`${path.relative(root, file)} imports ${specifier}`);
      }
    }
  }
  return violations;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const rootFlag = process.argv.indexOf("--root");
  if (rootFlag !== -1 && !process.argv[rootFlag + 1])
    throw new Error("--root requires a path");
  const violations = findBoundaryViolations(
    rootFlag === -1 ? defaultRoot : path.resolve(process.argv[rootFlag + 1]),
  );
  if (violations.length) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Architecture imports: PASS");
  }
}
