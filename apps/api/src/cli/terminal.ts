import { createInterface, emitKeypressEvents } from "node:readline";

export async function askText(label: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await new Promise<string>((resolve) =>
      readline.question(label, resolve),
    );
  } finally {
    readline.close();
  }
}

export async function askSecret(label: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || !process.stdout.isTTY || !input.setRawMode) {
    throw new Error("An interactive terminal is required");
  }
  process.stdout.write(label);
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onKeypress = (
      character: string,
      key: { name?: string; ctrl?: boolean; meta?: boolean },
    ) => {
      if (key.ctrl && key.name === "c") return finish(new Error("Cancelled"));
      if (key.name === "return" || key.name === "enter") return finish();
      if (key.name === "backspace") {
        value = [...value].slice(0, -1).join("");
        return;
      }
      if (
        !key.ctrl &&
        !key.meta &&
        character &&
        !/[\x00-\x1f\x7f]/.test(character)
      ) {
        value += character;
      }
    };
    input.on("keypress", onKeypress);
  });
}
