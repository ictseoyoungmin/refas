# Candidate provenance transactions

Use a candidate transaction after one realized candidate and its decision evidence are stable enough to be compared as one state. It is an evidence envelope, not a modeling step and not a certification verdict.

## Contract

`createCandidateTransaction` binds:

- the exact candidate bytes;
- one immutable checkpoint whose artifact set contains that candidate digest;
- an arbitrary acyclic evidence graph;
- exact-byte dependency proofs between evidence nodes;
- one or more terminal decision nodes;
- caller-declared evidence role/schema obligations.

Do not add reconstruction-stage names to the transaction schema. Attachment, fusion, render, review, animation, manufacturing, or other evidence participates through semantic `role` plus the artifact's own `schema`.

## Direct and derived evidence

For JSON evidence that directly names the candidate, provide `subjectPointer` to the digest field in the actual artifact bytes. The runtime resolves the JSON Pointer and requires the exact root candidate SHA-256.

For evidence that does not directly name the candidate, omit `subjectPointer` and connect it through a proven dependency edge. Every dependency must identify a JSON Pointer in either the current artifact or dependency artifact that stores the exact SHA-256 of the other artifact. A bare caller assertion is not a provenance edge.

This supports binary outputs naturally: let the digest-bound JSON report depend on the binary output it lists.

## Example shape

```js
const transaction = createCandidateTransaction({
  candidateBytes: await fs.readFile('assets/candidate.glb'),
  checkpoint,
  evidence: [
    {
      id: 'render.frame',
      role: 'render-output',
      bytes: await fs.readFile('renders/hero.png'),
    },
    {
      id: 'render.report',
      role: 'render-report',
      schema: 'refas.pbr-render-report/v1',
      bytes: await fs.readFile('renders/report.json'),
      subjectPointer: '/assetSha256',
      dependencies: [{
        nodeId: 'render.frame',
        proof: {
          kind: 'json-pointer-artifact-sha256',
          holder: 'self',
          pointer: '/outputs/0/sha256',
        },
      }],
    },
  ],
  decisionNodeIds: ['render.report'],
  obligations: [{id: 'render-proof', role: 'render-report', minCount: 1}],
});
```

Use the artifact's real pointer layout; the example pointer is not a universal requirement.

## Candidate continuity from shape to certification

The first authoritative candidate is the exact GLB committed by `shape-reconstruction`. After that point, a byte-identical carry-forward needs no transition artifact. If `surface-topology`, `assembly`, or `appearance` changes the candidate GLB digest, the checkpoint must include exactly one `refas.candidate-transition/v1` artifact.

A candidate transition binds the runtime-resolved input candidate digest/checkpoint, actual parent checkpoint, authorized mutation capability and scope, changed output digest, and evidence refs that include the exact output candidate path. It is provenance for the candidate replacement; it does not claim that a particular editing algorithm was correct.

`resolveAuthoritativeCandidateLineage` replays those transitions from the shape candidate and derives one unique final candidate. Whole-object certification must preserve that runtime-derived state as `refas.candidate-lineage-proof/v1`. The proof is rederived during audit and certification; caller-authored or stale input/output digests, parent IDs, capabilities, scopes, competing GLBs, missing transitions, or substituted proof bytes fail closed.

Final resemblance authority is separate from continuity: the lineage proves *which bytes are the final candidate*, while `refas.final-resemblance-closure/v1` proves that those final bytes still satisfy the source-specific macro and identity signatures.

## Rules

- Every evidence byte must be the bytes actually reviewed or measured.
- Every evidence node must be reachable from a declared decision node.
- Every node must be provenance-connected to a direct root-candidate binding through proven edges.
- Never satisfy an obligation with an unrelated evidence node merely because its role string matches.
- Revalidate with exact candidate, checkpoint, and evidence bytes before a later certification step consumes the transaction.
- A valid transaction only proves provenance consistency. It does not mean any structural, visual, appearance, or release claim is true.

If validation fails, reopen the owner of the stale or mismatched artifact. Do not rewrite transaction metadata to make old evidence fit a new candidate.
