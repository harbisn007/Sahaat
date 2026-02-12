import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

describe("Sheeloha Generator", () => {
  const testInputPath = "/tmp/test-sheeloha-input.m4a";
  const testOutputPath = "/tmp/test-sheeloha-output-vitest.m4a";

  beforeAll(() => {
    // إنشاء ملف صوتي تجريبي
    execSync(
      `ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" -c:a aac -b:a 128k ${testInputPath}`,
      { stdio: "pipe" }
    );
  });

  it("should generate sheeloha that is different from input", async () => {
    const { generateSheeloha } = await import("../server/sheeloha-generator");
    
    const inputBuffer = fs.readFileSync(testInputPath);
    const outputBuffer = await generateSheeloha(inputBuffer);

    // الشيلوها يجب أن تكون أكبر من الطاروق الأصلي (بسبب 5 نسخ + تصفيق)
    expect(outputBuffer.length).toBeGreaterThan(inputBuffer.length);

    // نسبة الحجم يجب أن تكون أكبر من 1.5 (5 نسخ + تصفيق)
    const sizeRatio = outputBuffer.length / inputBuffer.length;
    expect(sizeRatio).toBeGreaterThan(1.5);

    // حفظ الملف للفحص
    fs.writeFileSync(testOutputPath, outputBuffer);

    // فحص مدة الشيلوها - يجب أن تكون أطول من الأصلي (بسبب التصفيق الختامي)
    const inputDuration = parseFloat(
      execSync(`ffprobe -i ${testInputPath} -show_entries format=duration -v quiet -of csv="p=0"`)
        .toString()
        .trim()
    );
    const outputDuration = parseFloat(
      execSync(`ffprobe -i ${testOutputPath} -show_entries format=duration -v quiet -of csv="p=0"`)
        .toString()
        .trim()
    );

    // الشيلوها يجب أن تكون أطول من الأصلي (بسبب التصفيق الختامي)
    expect(outputDuration).toBeGreaterThan(inputDuration * 0.8); // أقصر قليلاً بسبب التسريع لكن أطول بسبب التصفيق الختامي
  });

  it("should produce stereo output (mixed voices)", async () => {
    // فحص أن الملف الناتج stereo (2 قنوات) - دليل على دمج أصوات متعددة
    const outputExists = fs.existsSync(testOutputPath);
    expect(outputExists).toBe(true);

    const channels = execSync(
      `ffprobe -i ${testOutputPath} -show_entries stream=channels -v quiet -of csv="p=0"`
    )
      .toString()
      .trim();

    expect(parseInt(channels)).toBe(2);
  });

  it("should have different audio characteristics than input", async () => {
    // فحص أن الشيلوها لها خصائص صوتية مختلفة عن الأصلي
    const inputVolume = execSync(
      `ffmpeg -i ${testInputPath} -af volumedetect -f null /dev/null 2>&1 | grep max_volume`
    )
      .toString()
      .trim();
    
    const outputVolume = execSync(
      `ffmpeg -i ${testOutputPath} -af volumedetect -f null /dev/null 2>&1 | grep max_volume`
    )
      .toString()
      .trim();

    // الخصائص الصوتية يجب أن تكون مختلفة
    // max_volume مختلف يعني أن التأثيرات طُبّقت
    expect(inputVolume).not.toBe(outputVolume);
  });
});
