# n8n-nodes-convertcraft

ConvertCraft community node for n8n.

## MVP scope

This package MVP implements:

- PDF -> Convert
- PDF -> Compress
- Image -> Convert
- Image -> Resize

Planned for a future release when plan access is available:

- PDF -> OCR
- Image -> Remove Background
- Image -> Enhance

## Credentials

Create credentials with:

- API Key (RapidAPI key)
- RapidAPI Host (default: convertcraft-tools.p.rapidapi.com)
- Base URL (default: https://convertcraft-tools.p.rapidapi.com)

## Node parameters

- Resource: PDF or Image
- Operation: Convert
- File URL: Public URL for the source file
- Output Format: Resource-specific format list for convert and OCR operations
- Output: Simplified, Raw, or Selected Fields
- Fields: Multi-select field list when Output is set to Selected Fields

## Development

1. Install dependencies:
   npm install
2. Build:
   npm run build

## Release docs

- Local test checklist: TESTING-CHECKLIST.md
- n8n verification draft: VERIFICATION-SUBMISSION.md
- Partnerships reply template: PARTNERSHIP-REPLY.md

## n8n metadata

This package includes:

- Credential: ConvertCraft API
- Node: ConvertCraft

The package is configured for n8nNodesApiVersion 1.
