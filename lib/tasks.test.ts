import { describe, expect, it } from "vitest"

import { parseTaskAttachmentPaths, serializeTaskAttachmentPaths } from "./tasks"

describe("lampiran komplain", () => {
    it("membaca satu path lama tanpa mengubahnya", () => {
        expect(parseTaskAttachmentPaths("complaints/u1/a.jpg")).toEqual([
            "complaints/u1/a.jpg",
        ])
    })

    it("membaca beberapa path yang dipisah baris baru", () => {
        expect(
            parseTaskAttachmentPaths(
                "complaints/u1/a.jpg\ncomplaints/u1/b.png\n",
            ),
        ).toEqual(["complaints/u1/a.jpg", "complaints/u1/b.png"])
    })

    it("membuang path kosong dan duplikat", () => {
        expect(
            parseTaskAttachmentPaths(
                " complaints/u1/a.jpg \n\ncomplaints/u1/a.jpg\n complaints/u1/b.png ",
            ),
        ).toEqual(["complaints/u1/a.jpg", "complaints/u1/b.png"])
    })

    it("menyimpan daftar sebagai baris baru dan null saat kosong", () => {
        expect(
            serializeTaskAttachmentPaths([
                "complaints/u1/a.jpg",
                "complaints/u1/b.png",
                "complaints/u1/a.jpg",
            ]),
        ).toBe("complaints/u1/a.jpg\ncomplaints/u1/b.png")
        expect(serializeTaskAttachmentPaths([])).toBeNull()
    })
})
