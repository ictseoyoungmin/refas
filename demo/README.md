# RefAs 1.0 demo

`demo/index.html` is a dependency-free release showcase for the current RefAs 1.0 capability boundary.

It intentionally does not commit opaque generated GLBs or screenshots as proof. Instead it links the repository's reproducible examples and explains which authority chain makes a release claim trustworthy:

`source → candidate → sealed evidence transaction → claim policy → claim decision → certificate`.

Open `index.html` directly in a browser. To produce actual geometry/render evidence, run the linked repository examples from the repository root.

## Scope

The demo describes only behavior already present in the 1.0 runtime. It does not claim simulation-ready physical assemblies, hidden manufacturer mechanisms, or fully resolved 3D orientation where a single reference view is ambiguous. See `docs/known-limitations.md`.
