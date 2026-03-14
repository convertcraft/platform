# n8n Node Local Testing Checklist

## Setup

- [ ] Install n8n desktop app: https://n8n.io/get-started/
- [ ] Build node package locally from this folder
- [ ] Link/install node into n8n custom nodes
- [ ] Create ConvertCraft API credentials in n8n
- [ ] Add valid RapidAPI key and host

## PDF Operations

- [ ] PDF: Convert -> test with sample PDF URL -> verify converted output
- [ ] PDF: Compress -> test low, medium, high -> verify size reduction
- [ ] PDF: OCR -> test with scanned PDF -> verify extracted text

## Image Operations

- [ ] Image: Convert -> test JPG, PNG, WebP, AVIF outputs
- [ ] Image: Resize -> test width, height, fit options
- [ ] Image: Remove Background -> test foreground separation quality
- [ ] Image: Enhance -> test upscale, denoise, sharpen modes

## Output Modes

- [ ] Simplified -> verify max 10 fields returned
- [ ] Raw -> verify full API response returned
- [ ] Selected Fields -> verify only chosen fields returned

## Error Handling

- [ ] Invalid file URL -> verify clear fix guidance
- [ ] Invalid API key -> verify credential guidance
- [ ] Unsupported format -> verify output format guidance
- [ ] Batch processing failures -> verify [item X] context

## UX Checks

- [ ] Resource selector shows correct resources
- [ ] Operation selector changes by resource
- [ ] Placeholders use user-friendly examples
- [ ] Boolean descriptions use Whether phrasing where applicable
- [ ] Operation parameters only appear when relevant

## Performance and Stability

- [ ] Typical operation latency is acceptable for expected payload sizes
- [ ] Batch runs complete without memory growth or crashes
- [ ] Continue On Fail behavior is as expected
- [ ] Credentials remain secure and reusable across runs

## Sign-off

- [ ] All 7 operations pass manually
- [ ] Output mode behavior validated
- [ ] Error messaging validated
- [ ] Ready for community node submission
