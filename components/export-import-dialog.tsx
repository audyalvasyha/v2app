"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Download, Upload, FileJson, Github, Check, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ExportImportDialogProps {
  onExportJSON: () => string
  onImportJSON: (json: string) => { success: boolean; count: number; error?: string }
  onExportGist: () => { description: string; public: boolean; files: Record<string, { content: string }> }
}

export function ExportImportDialog({ onExportJSON, onImportJSON, onExportGist }: ExportImportDialogProps) {
  const [open, setOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [gistJson, setGistJson] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExportJSON = () => {
    const json = onExportJSON()
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `snippets-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImportJSON = () => {
    const result = onImportJSON(importText)
    if (result.success) {
      setImportResult({
        success: true,
        message: `Successfully imported ${result.count} snippet${result.count !== 1 ? "s" : ""}!`,
      })
      setImportText("")
      setTimeout(() => {
        setOpen(false)
        setImportResult(null)
      }, 2000)
    } else {
      setImportResult({
        success: false,
        message: result.error || "Failed to import snippets",
      })
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        setImportText(content)
      }
      reader.readAsText(file)
    }
  }

  const handleExportGist = () => {
    const gistData = onExportGist()
    const json = JSON.stringify(gistData, null, 2)
    setGistJson(json)
  }

  const handleCopyGist = async () => {
    await navigator.clipboard.writeText(gistJson)
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2 bg-transparent">
            <Download className="h-4 w-4" />
            Export / Import
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export & Import Snippets</DialogTitle>
            <DialogDescription>Backup your snippets or import from a previous export</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="export" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="export">Export JSON</TabsTrigger>
              <TabsTrigger value="import">Import JSON</TabsTrigger>
              <TabsTrigger value="gist">Export Gist</TabsTrigger>
            </TabsList>

            <TabsContent value="export" className="space-y-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Download all your snippets as a JSON file. This includes all metadata, tags, and version history.
                </p>
                <Button onClick={handleExportJSON} className="w-full gap-2">
                  <FileJson className="h-4 w-4" />
                  Download JSON File
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="import" className="space-y-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Import snippets from a JSON file. Imported snippets will be added to your existing collection.
                </p>

                <div className="space-y-2">
                  <Label>Upload JSON File</Label>
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full gap-2">
                    <Upload className="h-4 w-4" />
                    Choose File
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="import-text">Or Paste JSON</Label>
                  <Textarea
                    id="import-text"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Paste your exported JSON here..."
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>

                {importResult && (
                  <Alert variant={importResult.success ? "default" : "destructive"}>
                    {importResult.success ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    <AlertDescription>{importResult.message}</AlertDescription>
                  </Alert>
                )}

                <Button onClick={handleImportJSON} disabled={!importText.trim()} className="w-full gap-2">
                  <Upload className="h-4 w-4" />
                  Import Snippets
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="gist" className="space-y-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Generate a GitHub Gist-compatible JSON format. Copy the JSON and create a new Gist on GitHub.
                </p>

                {!gistJson ? (
                  <Button onClick={handleExportGist} className="w-full gap-2">
                    <Github className="h-4 w-4" />
                    Generate Gist JSON
                  </Button>
                ) : (
                  <>
                    <Textarea value={gistJson} readOnly rows={12} className="font-mono text-sm" />
                    <div className="flex gap-2">
                      <Button onClick={handleCopyGist} className="flex-1 gap-2">
                        <FileJson className="h-4 w-4" />
                        Copy JSON
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => window.open("https://gist.github.com", "_blank")}
                        className="flex-1 gap-2"
                      >
                        <Github className="h-4 w-4" />
                        Open GitHub Gist
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}
