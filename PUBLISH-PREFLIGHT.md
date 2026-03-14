# Publish Preflight and Manual Test Runbook

## What was fixed for publish readiness

- Removed local `file:..` dependency from package metadata
- Set package entry points to built files in `dist`
- Kept n8n node metadata paths pointing to `dist`

## Automated preflight (run from repo root)

1. Build package:
   `npm --prefix n8n-nodes-convertcraft run build`
2. Create package dry run:
   `npm --prefix n8n-nodes-convertcraft pack --dry-run`
3. Optional package contents check:
   Confirm tarball would include only `dist` and package docs.

## Manual n8n desktop test (required)

I cannot operate your local n8n desktop UI from this environment, so run these steps once on your machine:

1. Open n8n desktop.
2. Install the local package in your n8n custom nodes location.
3. Restart n8n desktop.
4. Add the `ConvertCraft` node in a test workflow.
5. Create `ConvertCraft API` credentials with your RapidAPI key.
6. Validate each operation with a public file URL:
   - PDF: Convert, Compress, OCR
   - Image: Convert, Resize, Remove Background, Enhance
7. Validate output modes:
   - Simplified: <= 10 fields
   - Raw: full response
   - Selected Fields: only chosen keys
8. Validate error messages:
   - Invalid URL
   - Invalid API key
   - Unsupported format
   - Batch with one failing item to verify `[item X]`

## What I need from you to complete full validation report

Share these and I will produce a final release verdict:

- 1 screenshot of node appearing in n8n
- 1 screenshot of credentials test success
- 1 sample successful execution output per resource
- 1 sample failure output showing fix guidance

## Ready-to-publish criteria

- Build passes
- Pack dry run passes
- All 7 operations pass manual test
- Output modes verified
- Error handling verified
