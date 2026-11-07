import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.resolve(process.argv[2] || path.join(root, "dist", "release"));

let playwright;
try {
  playwright = require("playwright");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  const bundled = path.join(
    os.homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
    "node_modules",
    "playwright",
  );
  playwright = require(bundled);
}

const readers = [
  { name: "all", file: "离线阅读版.html", count: 83, age: false },
  { name: "primary", file: "小学版-离线试读.html", count: 79, age: true },
  { name: "secondary", file: "中学版-离线试读.html", count: 83, age: true },
];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
];
const outputDir = path.join(root, "work", "verification", `readers-${path.basename(releaseDir)}`);
fs.mkdirSync(outputDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function chapterIdsFromHtml(filename) {
  const source = fs.readFileSync(path.join(releaseDir, filename), "utf8");
  const marker = "const chapters=";
  const start = source.indexOf(marker);
  const end = source.indexOf(";const modeName=", start + marker.length);
  assert(start >= 0 && end > start, `${filename}: 找不到内嵌 chapters 数据`);
  return JSON.parse(source.slice(start + marker.length, end)).map((chapter) => chapter.id);
}

const browser = await playwright.chromium.launch({ headless: true });
const results = [];
try {
  for (const reader of readers) {
    const ids = chapterIdsFromHtml(reader.file);
    assert(ids.length === reader.count, `${reader.name}: 章节数 ${ids.length}，预期 ${reader.count}`);
    assert(new Set(ids).size === ids.length, `${reader.name}: 章节 ID 重复`);

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });

      const url = pathToFileURL(path.join(releaseDir, reader.file)).href;
      await page.goto(url, { waitUntil: "load" });
      await page.waitForFunction(() => document.querySelectorAll("#list a").length > 0);
      assert((await page.locator("#list a").count()) === reader.count, `${reader.name}/${viewport.name}: 目录数错误`);
      assert((await page.locator("#article").innerText()).trim().length > 40, `${reader.name}/${viewport.name}: 首篇正文为空`);
      await page.evaluate(() => {
        for (const chapter of chapters) {
          if (/内部研究稿|内部试读稿/.test(chapter.markdown)) throw new Error(chapter.id + ': 重复稿件声明');
          const parser = new DOMParser();
          const plain = html => parser.parseFromString(html,'text/html').body.textContent.replace(/\s+/g,'');
          if (plain(readerChapterHTML(chapter,modeName)) !== plain(chapter.html.replace('<p>综合正文</p>',''))) throw new Error(chapter.id + ': 段落折叠改变了正文文字');
        }
      });
      assert((await page.locator("#progress").innerText()).includes(`1 / ${reader.count}`), `${reader.name}/${viewport.name}: 初始计数错误`);

      if (viewport.name === "mobile") {
        await page.locator(".catalog-trigger").click();
      }
      await page.locator("#search").fill("朋友");
      assert((await page.locator("#list a").count()) > 0, `${reader.name}/${viewport.name}: 搜索“朋友”无结果`);
      await page.locator("#search").fill("");
      if (viewport.name === 'mobile') await page.locator('#close-catalog').click();

      await page.locator("#evidence summary").click();
      assert(await page.locator("#evidence").evaluate((element) => element.open), `${reader.name}/${viewport.name}: 依据区未打开`);
      assert((await page.locator("#evidence-content").innerText()).trim().length > 40, `${reader.name}/${viewport.name}: 依据内容为空`);

      const next = page.locator("#next");
      if (!(await next.isDisabled())) {
        const before = await page.evaluate(() => location.hash);
        await next.click();
        await page.waitForFunction((oldHash) => location.hash !== oldHash, before);
      }

      for (const topicId of ids) {
        await page.evaluate((id) => {
          location.hash = `#${id}`;
        }, topicId);
        await page.waitForFunction(
          (id) =>
            location.hash === `#${id}` &&
            document.querySelector("#list a[aria-current='page']")?.hash === `#${id}`,
          topicId,
        );
      }

      if (reader.age) {
        const age = viewport.name === "desktop" ? (reader.name === "primary" ? "6" : "12") : reader.name === "primary" ? "11" : "17";
        const expected = await page.evaluate((age) => chapters.filter(c => c.ageRange && Number(age) >= c.ageRange.min && Number(age) <= c.ageRange.max).length, age);
        if (await page.locator("#age").count()) {
          if (viewport.name === 'mobile') await page.locator('.catalog-trigger').click();
          await page.locator("#age").selectOption(age);
          assert((await page.locator("#list a").count()) === expected, `${reader.name}/${viewport.name}: 年龄筛选数错误`);
        } else {
          const ranges = await page.evaluate(() => new Set(chapters.filter(c=>c.ageRange).map(c=>c.ageRange.min+'-'+c.ageRange.max)).size);
          assert(ranges <= 1, 'Only redundant age filters may be hidden');
        }
      }

      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        articleWidth: document.querySelector("#article")?.getBoundingClientRect().width || 0,
      }));
      assert(layout.scrollWidth <= layout.clientWidth + 2, `${reader.name}/${viewport.name}: 页面横向溢出 ${JSON.stringify(layout)}`);
      assert(layout.articleWidth > 250, `${reader.name}/${viewport.name}: 正文宽度异常 ${layout.articleWidth}`);

      const screenshot = path.join(outputDir, `${reader.name}-${viewport.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      assert(errors.length === 0, `${reader.name}/${viewport.name}: ${errors.join(" | ")}`);
      results.push({ reader: reader.name, viewport: viewport.name, chapters: ids.length, screenshot });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
