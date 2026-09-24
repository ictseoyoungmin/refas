# Evidence and artifact provenance

## Primary source manifest

Record for every raw reference:

- stable semantic ID;
- original path or retrieval identifier;
- SHA-256;
- byte size;
- pixel width and height;
- acquisition date and known camera context, when available;
- authority: `primary`.

Never overwrite a primary source. A changed digest is a new source revision and reopens `source-intake`.

## Derived evidence manifest

Every crop, filter, mask, edge view, or annotation records:

- output path and SHA-256;
- source SHA-256;
- deterministic recipe or recipe digest;
- hierarchy scope and ROI;
- authority: `derived`.

Derived evidence can improve visibility but cannot become more authoritative than its source.

## Artifact references

Checkpoint artifact references use:

```json
{
  "kind": "glb",
  "path": "assets/object.glb",
  "sha256": "<64 lowercase hex characters>",
  "sizeBytes": 12345
}
```

Paths locate artifacts; digests identify them. If a path now contains different bytes, the checkpoint still refers to the original digest and the audit should not treat the new file as equivalent.

## Reproducibility

Store model specifications, camera settings, renderer version, and command arguments alongside render outputs. A review board without a traceable GLB and camera is visual evidence but not reproducible evidence.


## Acquisition metadata is not privilege

The `acquisition` object records provenance context only. It may describe a user upload, retrieval path, camera context, or another source origin, but it cannot weaken reconstruction or certification authority.

The labels `test-fixture`, `deterministic-project-fixture`, and `synthetic-test-fixture` are reserved for historical compatibility and are rejected by public source-manifest creation, `initProject`, and `bindSource`. Contract-only test exemptions exist only in trusted internal harness state, are bound to the exact source SHA-256, and are intentionally absent from the public API and discovery graph.

Changing source metadata never converts a production project into a fixture project.
