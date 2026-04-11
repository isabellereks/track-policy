# Municipal data

Municipalities are not covered by the state-level sync scripts. Add notable
cities / counties here manually. Each file should match this shape:

```json
{
  "id": "loudoun-county-va",
  "name": "Loudoun County, VA",
  "stateCode": "VA",
  "stance": "concerning",
  "contextBlurb": "...",
  "legislation": [],
  "news": []
}
```

The build-placeholder script will pick these up automatically when it runs.
