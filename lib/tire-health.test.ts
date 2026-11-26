import { describe, expect, it } from "vitest";
import { csvEscape, normalizeTireSlot, summarizeTireDashboard, tireChecksCsv, tireHealthLevel, tireHealthPriority } from "./tire-health";

describe("tireHealthLevel", () => {
  it("kondisi verbal buruk menang atas angka; kondisi bagus tidak menutupi angka terukur", () => {
    expect(
      tireHealthLevel({ condition: "Gundul", pressurePsi: 90, treadDepthMm: 5 }),
    ).toBe("action");
    // "Bagus" tidak menurunkan temuan ukuran: psi 60 tetap kempes.
    expect(
      tireHealthLevel({ condition: "Bagus", pressurePsi: 60, treadDepthMm: 6 }),
    ).toBe("action");
    expect(
      tireHealthLevel({ condition: "Bagus", pressurePsi: 90, treadDepthMm: 6 }),
    ).toBe("ok");
  });

  it("nilai tidak tercatat netral", () => {
    expect(tireHealthLevel(null)).toBe("none");
    expect(
      tireHealthLevel({ condition: null, pressurePsi: null, treadDepthMm: null }),
    ).toBe("ok");
  });

  it("batas ketebalan: 2 mm action, 4 mm warning, > 4 mm ok", () => {
    expect(tireHealthLevel({ condition: null, pressurePsi: 90, treadDepthMm: 2.0 })).toBe("action");
    expect(tireHealthLevel({ condition: null, pressurePsi: 90, treadDepthMm: 2.1 })).toBe("warning");
    expect(tireHealthLevel({ condition: null, pressurePsi: 90, treadDepthMm: 4.0 })).toBe("warning");
    expect(tireHealthLevel({ condition: null, pressurePsi: 90, treadDepthMm: 4.1 })).toBe("ok");
  });

  it("batas tekanan: kempes action, agak kurang warning, overinflasi action", () => {
    expect(tireHealthLevel({ condition: null, pressurePsi: 67, treadDepthMm: 6 })).toBe("action");
    expect(tireHealthLevel({ condition: null, pressurePsi: 70, treadDepthMm: 6 })).toBe("warning");
    expect(tireHealthLevel({ condition: null, pressurePsi: 120, treadDepthMm: 6 })).toBe("action");
    expect(tireHealthLevel({ condition: null, pressurePsi: 110, treadDepthMm: 6 })).toBe("warning");
    expect(tireHealthLevel({ condition: null, pressurePsi: 110.1, treadDepthMm: 6 })).toBe("warning");
    expect(tireHealthLevel({ condition: null, pressurePsi: 120.1, treadDepthMm: 6 })).toBe("action");
  });

  it("level diletak antara sinyal: tread action mengalahkan psi warning", () => {
    expect(tireHealthLevel({ condition: null, pressurePsi: 70, treadDepthMm: 1.9 })).toBe("action");
  });
});

describe("tireHealthPriority", () => {
  it("action > warning > lainnya", () => {
    expect(tireHealthPriority("action")).toBe(2);
    expect(tireHealthPriority("warning")).toBe(1);
    expect(tireHealthPriority("ok")).toBe(0);
    expect(tireHealthPriority("none")).toBe(0);
  });
});

describe("csvEscape", () => {
  it("sel dengan koma/petik/newline dibungkus petik dan petik didobel", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('bilang "gundul"')).toBe('"bilang ""gundul"""');
    expect(csvEscape("baris\nbaru")).toBe('"baris\nbaru"');
  });

  it("nilai aman tanpa karakter khusus dan null jadi kosong", () => {
    expect(csvEscape("aman")).toBe("aman");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(90.5)).toBe("90.5");
  });
});

describe("normalizeTireSlot", () => {
  it("kode peta dikenali, posisi asing diabaikan", () => {
    expect(normalizeTireSlot("FR - (Depan Kanan)")).toBe("FR");
    expect(normalizeTireSlot("rli - kiri dalam")).toBe("RLI");
    expect(normalizeTireSlot("Cadangan")).toBeNull();
    expect(normalizeTireSlot(null)).toBeNull();
  });
});

describe("summarizeTireDashboard", () => {
  it("memakai pemeriksaan terbaru per slot dan mengabaikan slot asing", () => {
    const summary = summarizeTireDashboard(
      [
        {
          equipment_id: "EQ-1",
          inspection_date: "2026-11-20",
          tire_check_details: [
            { tire_position: "FR - kanan", tread_depth_mm: 1.5, pressure_psi: 90, condition: "Bagus", created_at: "2026-11-20T01:00:00Z" },
            { tire_position: "Cadangan", tread_depth_mm: 1.0, pressure_psi: 50, condition: "Gundul", created_at: "2026-11-20T02:00:00Z" },
          ],
        },
        {
          equipment_id: "EQ-1",
          inspection_date: "2026-11-21",
          tire_check_details: [
            { tire_position: "FR - kanan", tread_depth_mm: 6, pressure_psi: 70, condition: "Bagus", created_at: "2026-11-21T01:00:00Z" },
          ],
        },
      ],
      new Map([["EQ-1", "B 1234 XY"]]),
    );

    expect(summary.inspectedUnits).toBe(1);
    expect(summary.actionUnits).toBe(0);
    expect(summary.warningUnits).toBe(1);
    expect(summary.units[0].plate).toBe("B 1234 XY");
    expect(summary.units[0].issues.map((issue) => `${issue.slot}:${issue.level}`)).toEqual(["FR:warning"]);
  });
});

describe("tireChecksCsv", () => {
  it("header 10 kolom dan baris ter-escape sesuai", () => {
    const csv = tireChecksCsv([
      {
        plate: "B9413SXV",
        inspectionDate: "2026-10-07",
        position: "FR - (Depan Kanan)",
        slot: "FR",
        pressurePsi: 91,
        treadDepthMm: 1,
        condition: "Gundul",
        notes: "tetap jalan dulu",
        recordedAt: "2026-10-07 17:54:18+00",
      },
    ]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "Unit,Tanggal Pemeriksaan,Posisi,Slot Peta,Tekanan (psi),Ketebalan (mm),Kondisi,Status Kesehatan,Catatan Driver,Dicatat Pada",
    );
    expect(lines[1]).toBe("B9413SXV,2026-10-07,FR - (Depan Kanan),FR,91,1,Gundul,Perlu tindakan,tetap jalan dulu,2026-10-07 17:54:18+00");
  });
});
