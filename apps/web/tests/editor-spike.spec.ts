import { expect, test } from "@playwright/test";

test("editor serializes stable block IDs, split, undo/redo and a source reference", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const editor = page.locator(".ieum-rich-editor");
  await expect(editor).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "문서 본문" }),
  ).toHaveAttribute("aria-multiline", "true");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" 추가");
  await page.getByText("저장 JSON 확인").click();
  const preview = page.getByTestId("editor-json-preview");
  await expect(preview).toContainText("한글 조합과 문단 ID 표본 추가");
  await expect(preview).toContainText("22222222-2222-4222-8222-222222222222");
  await page.keyboard.press("Escape");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("새 문단");
  await expect(preview).toContainText("새 문단");
  const afterSplit = JSON.parse(await preview.innerText()) as {
    content: { content: { attrs: { blockId: string } }[] };
  };
  expect(afterSplit.content.content).toHaveLength(2);
  expect(
    new Set(afterSplit.content.content.map((block) => block.attrs.blockId))
      .size,
  ).toBe(2);
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(preview).toContainText("새 문단");
  await page.getByRole("button", { name: "출처 표본 삽입" }).click();
  await expect(preview).toContainText('"sourceKind": "unit"');
  await expect(preview).toContainText('"sourceRevision": 1');
  await page.getByText("저장 JSON 확인").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator("#editor-spike")
    .screenshot({ path: testInfo.outputPath("fe-02-editor-390.png") });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(editor).toBeVisible();
});

test("form retains draft and presents server rejection before typed success", async ({
  page,
}) => {
  let serverOk = false;
  await page.route(
    "**/api/v1/workspaces/fixture-workspace/captures",
    async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toMatchObject({
        title: "표본 제목",
        rawBody: "FE-02 합성 입력 표본",
      });
      await route.fulfill({
        status: serverOk ? 201 : 422,
        contentType: "application/json",
        body: JSON.stringify(
          serverOk
            ? {
                id: "11111111-1111-4111-8111-111111111111",
                revision: 1,
                version: 1,
                unitId: "22222222-2222-4222-8222-222222222222",
                commandId: "33333333-3333-4333-8333-333333333333",
                replayed: false,
              }
            : { title: "Unprocessable Entity", status: 422 },
        ),
      });
    },
  );
  await page.goto("/");
  const title = page.getByLabel("문서 제목 표본");
  await page.getByRole("button", { name: "합성 저장 요청" }).click();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await title.fill("표본 제목");
  await page.getByRole("button", { name: "합성 저장 요청" }).click();
  await expect(page.getByText(/HTTP 422/)).toBeVisible();
  await expect(title).toHaveValue("표본 제목");
  serverOk = true;
  await page.getByRole("button", { name: "합성 저장 요청" }).click();
  await expect(page.getByText("응답 검증 완료 · revision 1")).toBeVisible();
});

test("merge preserves the surviving ID; clipboard paste and cut keep a valid draft", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const editor = page.locator(".ieum-rich-editor");
  const preview = page.getByTestId("editor-json-preview");
  await page.getByText("저장 JSON 확인").click();
  await editor.focus();
  await editor
    .locator("p")
    .first()
    .evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("둘째");
  await editor
    .locator("p")
    .last()
    .evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  await page.keyboard.press("Backspace");
  await expect(preview).toContainText("둘째");
  const merged = JSON.parse(await preview.innerText()) as {
    content: { content: { attrs: { blockId: string } }[] };
  };
  expect(merged.content.content).toHaveLength(1);
  expect(merged.content.content[0]?.attrs.blockId).toBe(
    "22222222-2222-4222-8222-222222222222",
  );
  await page.evaluate(async () => navigator.clipboard.writeText(" 붙여넣기"));
  await editor.locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor).toContainText("붙여넣기");
  await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode: Node | null;
    while ((textNode = walker.nextNode())) {
      const start = textNode.textContent?.indexOf("붙여넣기") ?? -1;
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + "붙여넣기".length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    throw new Error("Pasted text was not found in the editor");
  });
  await page.keyboard.press("ControlOrMeta+x");
  await expect(editor).not.toContainText("붙여넣기");
  expect(
    await page.evaluate(async () => navigator.clipboard.readText()),
  ).toContain("붙여넣기");
  await expect(editor).toContainText("둘째");
  const after = JSON.parse(await preview.innerText()) as {
    content: { content: { attrs: { blockId: string } }[] };
  };
  expect(
    new Set(after.content.content.map((block) => block.attrs.blockId)).size,
  ).toBe(after.content.content.length);
});

test("composition holds serialization until the Korean input is committed", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.locator(".ieum-rich-editor");
  await page.getByText("저장 JSON 확인").click();
  const preview = page.getByTestId("editor-json-preview");
  await editor.click();
  await editor.evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "한" }),
    ),
  );
  const before = await preview.innerText();
  await editor.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  await page.keyboard.press("End");
  await page.keyboard.insertText(" 한글");
  expect(await preview.innerText()).toBe(before);
  await editor.evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한글" }),
    ),
  );
  await expect(preview).toContainText(" 한글");
  const committed = JSON.parse(await preview.innerText()) as {
    content: { content: unknown[] };
  };
  expect(committed.content.content).toHaveLength(1);
});

test("malformed pasted source reference stays out of the saved JSON", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "문서 본문" });
  await page.getByText("저장 JSON 확인").click();
  const preview = page.getByTestId("editor-json-preview");
  const before = await preview.innerText();
  await page.evaluate(async () => {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob(
          ["<span data-ieum-source-ref='null'>비정상 참조</span>"],
          { type: "text/html" },
        ),
        "text/plain": new Blob(["비정상 참조"], { type: "text/plain" }),
      }),
    ]);
  });
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByText("편집 schema를 확인해 주세요.")).toBeVisible();
  expect(await preview.innerText()).toBe(before);
  await expect(editor).toContainText("출처 확인 필요");
});
